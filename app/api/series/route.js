import { NextResponse } from "next/server";
import { listSeries, createSeries } from "@/lib/firestoreService";
import { isMuxConfigured, normalizeMuxMetadata, signMediaItemMuxUrls, syncEpisodeMuxMetadata } from "@/lib/muxService";
import { validateSeriesPayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const filters = {
    search: searchParams.get("search") ?? searchParams.get("q") ?? "",
    category: searchParams.get("category") ?? "",
    limit: searchParams.get("limit") ?? undefined,
    offset: searchParams.get("offset") ?? undefined,
  };

  try {
    const series = await listSeries(filters);
    return NextResponse.json({ data: series.map(signMediaItemMuxUrls) });
  } catch (error) {
    console.error("GET /api/series", error);
    return NextResponse.json({ error: "Gagal memuat series." }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    const validation = validateSeriesPayload(payload);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: validation.errors }, { status: 422 });
    }

    if (payload.mux_asset_id || payload.mux_playback_id || payload.mux_video_id) {
      const muxInfo = await normalizeMuxMetadata({
        assetId: payload.mux_asset_id,
        playbackId: payload.mux_playback_id,
        videoId: payload.mux_video_id,
      });
      if (isMuxConfigured && !muxInfo.assetId) {
        return NextResponse.json(
          { error: "Asset Mux tidak ditemukan atau belum valid. Periksa Playback/Asset ID." },
          { status: 422 }
        );
      }
      payload.mux_asset_id = muxInfo.assetId;
      payload.mux_playback_id = muxInfo.playbackId;
      payload.mux_video_id = muxInfo.videoId;
    }

    if (Array.isArray(payload.episodes)) {
      const normalizedEpisodes = [];
      for (const episode of payload.episodes) {
        const episodeMux = await normalizeMuxMetadata({
          assetId: episode?.mux_asset_id,
          playbackId: episode?.mux_playback_id,
          videoId: episode?.mux_video_id,
        });
        if (
          isMuxConfigured &&
          (episode?.mux_asset_id || episode?.mux_playback_id || episode?.mux_video_id) &&
          !episodeMux.assetId
        ) {
          return NextResponse.json(
            { error: "Asset Mux episode tidak ditemukan atau belum valid. Periksa Playback/Asset ID." },
            { status: 422 }
          );
        }
        normalizedEpisodes.push({
          ...episode,
          duration: episode?.duration || episodeMux.duration || null,
          mux_asset_id: episodeMux.assetId,
          mux_playback_id: episodeMux.playbackId,
          mux_video_id: episodeMux.videoId,
        });
      }
      payload.episodes = normalizedEpisodes;
    }

    let created;
    try {
      created = await createSeries(payload, session);
    } catch (dbError) {
      if (dbError?.statusCode === 400) {
        return NextResponse.json({ error: dbError.message }, { status: 400 });
      }
      const orphanedAssetIds = [
        payload.mux_asset_id,
        ...(Array.isArray(payload.episodes) ? payload.episodes.map((ep) => ep?.mux_asset_id) : []),
      ].filter(Boolean);
      const cleanupGuidance = orphanedAssetIds.length
        ? `DB write gagal setelah asset Mux (${orphanedAssetIds.join(", ")}) ditautkan. Jika asset tersebut baru diunggah dan tidak dipakai konten lain, bersihkan melalui DELETE /api/mux/assets/<assetId> atau dashboard Mux.`
        : "DB write gagal. Periksa apakah terdapat asset Mux yatim yang perlu dibersihkan di dashboard Mux.";
      console.error("POST /api/series DB write failed:", {
        error: dbError?.message ?? dbError,
        mux_asset_ids: orphanedAssetIds,
        cleanupGuidance,
      });
      return NextResponse.json(
        { error: "Gagal menyimpan series ke database.", cleanupGuidance },
        { status: 500 }
      );
    }

    if (Array.isArray(created.episodes)) {
      await Promise.allSettled(
        created.episodes.map((episode) =>
          syncEpisodeMuxMetadata({
            seriesId: created.id,
            seriesTitle: created.title,
            episode,
            creatorId: session.uid,
          })
        )
      );
    }

    await recordAuditLog({
      actor: session,
      action: "series.create",
      targetId: created.id,
      targetType: "series",
      metadata: { title: created.title },
    }).catch((err) => console.warn("[POST /api/series] audit log failed:", err?.message || err));

    return NextResponse.json({ data: signMediaItemMuxUrls(created) }, { status: 201 });
  } catch (error) {
    console.error("POST /api/series", error);
    return NextResponse.json({ error: "Gagal membuat series." }, { status: 500 });
  }
}
