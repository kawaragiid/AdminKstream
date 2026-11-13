import { NextResponse } from "next/server";
import { getSeries, addEpisode } from "@/lib/firestoreService";
import { normalizeMuxMetadata, syncEpisodeMuxMetadata } from "@/lib/muxService";
import { validateEpisode } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(_request, { params }) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const { id } = await params;
    const series = await getSeries(id);
    if (!series) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ data: series.episodes ?? [] });
  } catch (error) {
    console.error("GET /api/series/[id]/episodes", error);
    return NextResponse.json({ error: "Gagal memuat episode." }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const payload = await request.json();
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
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

    const { valid, errors } = validateEpisode(payload);

    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const { id } = await params;
    const series = await getSeries(id);
    const episode = await addEpisode(id, payload);

    await syncEpisodeMuxMetadata({
      seriesId: id,
      seriesTitle: series?.title,
      episode,
      creatorId: session.uid,
    }).catch((err) => console.warn("Gagal sinkronisasi metadata Mux episode:", err?.message));

    await recordAuditLog({
      actor: session,
      action: "series.episode.create",
      targetId: id,
      targetType: "series-episode",
      metadata: { episodeId: episode.episodeId, title: episode.title },
    });

    return NextResponse.json({ data: episode }, { status: 201 });
  } catch (error) {
    console.error("POST /api/series/[id]/episodes", error);
    return NextResponse.json({ error: "Gagal menambah episode." }, { status: 500 });
  }
}
