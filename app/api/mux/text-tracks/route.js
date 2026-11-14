import { NextResponse } from "next/server";
import { addMultipleTextTracks, isMuxConfigured, resolveAssetId } from "@/lib/muxService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import {
  deleteTempSubtitle,
  extractTempSubtitleToken,
  purgeExpiredTempSubtitles,
  shortenTempSubtitleExpiry,
} from "@/lib/tempSubtitles";

const LANG_CODE_REGEX = /^[a-zA-Z]{2,3}(?:-[a-zA-Z0-9]{2,8})*$/;

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
    }

    let assetId = body?.assetId;
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];

    if (!assetId) {
      return NextResponse.json({ error: "assetId wajib diisi." }, { status: 400 });
    }

    assetId = await resolveAssetId(assetId);
    if (!assetId) {
      return NextResponse.json({ error: "assetId tidak valid." }, { status: 400 });
    }

    if (!tracks.length) {
      return NextResponse.json({ error: "Tracks wajib diisi." }, { status: 400 });
    }

    const normalizedTracks = [];
    for (let i = 0; i < tracks.length; i += 1) {
      const t = tracks[i];
      if (!t || typeof t !== "object" || typeof t.url !== "string") {
        return NextResponse.json({ error: `Track #${i + 1}: URL wajib diisi.` }, { status: 400 });
      }
      let parsedUrl;
      try {
        parsedUrl = new URL(t.url);
      } catch {
        return NextResponse.json({ error: `Track #${i + 1}: URL tidak valid.` }, { status: 400 });
      }
      if (parsedUrl.protocol !== "https:") {
        return NextResponse.json(
          { error: `Track #${i + 1}: URL harus menggunakan protokol https://.` },
          { status: 400 }
        );
      }

      const languageCode = String(t.language_code ?? t.lang ?? "").trim();
      if (!LANG_CODE_REGEX.test(languageCode)) {
        return NextResponse.json(
          { error: `Track #${i + 1}: language_code tidak valid.` },
          { status: 400 }
        );
      }

      const name = String(t.name ?? t.label ?? "").trim();
      if (name.length < 1 || name.length > 64) {
        return NextResponse.json(
          { error: `Track #${i + 1}: name/label subtitle wajib diisi (1-64 karakter).` },
          { status: 400 }
        );
      }

      normalizedTracks.push({
        ...t,
        url: parsedUrl.toString(),
        language_code: languageCode,
        name,
      });
    }

    const results = await addMultipleTextTracks(assetId, normalizedTracks);
    const failed = results.filter((item) => item?.ok === false);
    if (failed.length > 0) {
      return NextResponse.json(
        {
          error: failed.map((f) => f.error || "Gagal menambahkan subtitle ke Mux.").join("; "),
          data: results,
          muxConfigured: isMuxConfigured,
        },
        { status: 502 }
      );
    }

    // Bersihkan temp_subtitles untuk track yang sudah siap, dan percepat TTL (5 menit) untuk yang masih diproses Mux.
    let cleanedCount = 0;
    await Promise.all(
      normalizedTracks.map(async (track, idx) => {
        const token = extractTempSubtitleToken(track.url);
        if (!token) return;
        const trackStatus = results[idx]?.data?.status;
        if (trackStatus === "ready") {
          if (await deleteTempSubtitle(token)) cleanedCount += 1;
        } else {
          await shortenTempSubtitleExpiry(token, 5 * 60 * 1000);
        }
      })
    );
    purgeExpiredTempSubtitles().catch(() => {});

    await recordAuditLog({
      actor: session,
      action: "mux.text-tracks.create",
      targetId: assetId,
      targetType: "mux-asset",
      metadata: {
        trackCount: normalizedTracks.length,
        languages: normalizedTracks.map((t) => t.language_code),
      },
    }).catch((err) => console.warn("[text-tracks] audit log failed:", err?.message || err));

    return NextResponse.json({
      data: results,
      muxConfigured: isMuxConfigured,
      tempCleaned: cleanedCount > 0,
    });
  } catch (error) {
    console.error("POST /api/mux/text-tracks", error);
    return NextResponse.json({ error: "Gagal menambahkan subtitle ke Mux." }, { status: 500 });
  }
}
