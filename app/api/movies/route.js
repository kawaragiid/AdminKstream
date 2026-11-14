import { NextResponse } from "next/server";
import { listMovies, createMovie } from "@/lib/firestoreService";
import { normalizeMuxMetadata, updateAssetMetadata } from "@/lib/muxService";
import { validateMoviePayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const filters = {
    search: searchParams.get("search") ?? searchParams.get("q") ?? "",
    category: searchParams.get("category") ?? "",
  };

  try {
    const movies = await listMovies(filters);
    return NextResponse.json({ data: movies });
  } catch (error) {
    console.error("GET /api/movies", error);
    return NextResponse.json({ error: "Gagal memuat movie." }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const payload = await request.json();
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    // Validasi payload sebelum memanggil Mux API agar typo validasi tidak memicu side effect ke Mux.
    const { valid, errors } = validateMoviePayload(payload);
    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const muxInfo = await normalizeMuxMetadata({
      assetId: payload.mux_asset_id,
      playbackId: payload.mux_playback_id,
      videoId: payload.mux_video_id,
    });
    payload.mux_asset_id = muxInfo.assetId;
    payload.mux_playback_id = muxInfo.playbackId;
    payload.mux_video_id = muxInfo.videoId;
    if (!payload.duration && muxInfo.duration) {
      payload.duration = muxInfo.duration;
    }

    let created;
    try {
      created = await createMovie(payload, session);
    } catch (dbError) {
      const orphanedAssetId = payload.mux_asset_id || null;
      const cleanupGuidance = orphanedAssetId
        ? `DB write gagal setelah asset Mux (${orphanedAssetId}) ditautkan. Jika asset tersebut baru diunggah dan tidak dipakai konten lain, bersihkan melalui DELETE /api/mux/assets/${orphanedAssetId} atau dashboard Mux.`
        : "DB write gagal. Periksa apakah terdapat asset Mux yatim yang perlu dibersihkan di dashboard Mux.";
      console.error("POST /api/movies DB write failed:", {
        error: dbError?.message ?? dbError,
        mux_asset_id: orphanedAssetId,
        mux_playback_id: payload.mux_playback_id ?? null,
        cleanupGuidance,
      });
      return NextResponse.json(
        { error: "Gagal menyimpan movie ke database.", cleanupGuidance },
        { status: 500 }
      );
    }

    if (created.mux_asset_id) {
      await updateAssetMetadata(created.mux_asset_id, {
        title: created.title,
        externalId: created.id,
        creatorId: session.uid,
        passthrough: JSON.stringify({ type: "movie", id: created.id, title: created.title.slice(0, 100) }),
      }).catch((err) => console.warn("Gagal sinkronisasi metadata Mux movie:", err?.message));
    }

    await recordAuditLog({
      actor: session,
      action: "movie.create",
      targetId: created.id,
      targetType: "movie",
      metadata: { title: created.title },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/movies", error);
    return NextResponse.json({ error: "Gagal membuat movie." }, { status: 500 });
  }
}
