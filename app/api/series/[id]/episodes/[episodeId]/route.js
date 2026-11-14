import { NextResponse } from "next/server";
import { getSeries, updateEpisode, deleteEpisode } from "@/lib/firestoreService";
import { deleteAsset, isMuxConfigured, normalizeMuxMetadata, syncEpisodeMuxMetadata } from "@/lib/muxService";
import { validateEpisode } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES } from "@/utils/constants";

function stripImmutableEpisodeFields(payload) {
  const { episodeId: _eid, id: _id, createdAt: _ca, ...rest } = payload;
  return rest;
}

export async function PUT(request, { params }) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const { id, episodeId } = await params;
    const series = await getSeries(id);
    if (!series) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }

    const existingEpisode = (series.episodes ?? []).find(
      (episode) => episode.episodeId === episodeId
    );
    if (!existingEpisode) {
      return NextResponse.json({ error: "Episode tidak ditemukan." }, { status: 404 });
    }

    const rawPayload = await request.json().catch(() => null);
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    const payload = stripImmutableEpisodeFields(rawPayload);
    const merged = { ...existingEpisode, ...payload };

    const { valid, errors } = validateEpisode(merged);
    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const muxChanged =
      payload.mux_asset_id !== undefined ||
      payload.mux_playback_id !== undefined ||
      payload.mux_video_id !== undefined;

    if (muxChanged) {
      const muxInfo = await normalizeMuxMetadata({
        assetId: merged.mux_asset_id,
        playbackId: merged.mux_playback_id,
        videoId: merged.mux_video_id,
      });
      if (isMuxConfigured && !muxInfo.assetId) {
        return NextResponse.json(
          { error: "Asset Mux episode tidak ditemukan atau belum valid." },
          { status: 422 }
        );
      }
      merged.mux_asset_id = muxInfo.assetId;
      merged.mux_playback_id = muxInfo.playbackId;
      merged.mux_video_id = muxInfo.videoId;
      if (!merged.duration && muxInfo.duration) {
        merged.duration = muxInfo.duration;
      }
    }

    const updateResult = await updateEpisode(id, episodeId, merged);
    const updatedSeries = await getSeries(id);
    const persistedEpisode =
      (updatedSeries?.episodes ?? []).find(
        (ep) => ep.episodeId === episodeId || ep.id === episodeId
      ) ||
      (updateResult && typeof updateResult === "object" && (updateResult.episodeId || updateResult.id)
        ? updateResult
        : merged);

    if (
      existingEpisode.mux_asset_id &&
      persistedEpisode.mux_asset_id &&
      existingEpisode.mux_asset_id !== persistedEpisode.mux_asset_id &&
      isMuxConfigured
    ) {
      await deleteAsset(existingEpisode.mux_asset_id).catch((err) =>
        console.warn("Gagal menghapus asset Mux lama episode:", existingEpisode.mux_asset_id, err?.message)
      );
    }

    await syncEpisodeMuxMetadata({
      seriesId: id,
      seriesTitle: series.title,
      episode: persistedEpisode,
      creatorId: session.uid,
    }).catch((err) => console.warn("Gagal sinkronisasi metadata Mux episode:", err?.message));

    await recordAuditLog({
      actor: session,
      action: "series.episode.update",
      targetId: id,
      targetType: "series-episode",
      metadata: { episodeId, title: persistedEpisode.title },
    }).catch((err) => console.warn("[PUT episode] audit log failed:", err?.message || err));

    return NextResponse.json({ data: persistedEpisode });
  } catch (error) {
    console.error("PUT /api/series/[id]/episodes/[episodeId]", error);
    const status = error?.statusCode || 500;
    return NextResponse.json(
      { error: status !== 500 ? error.message : "Gagal memperbarui episode." },
      { status }
    );
  }
}

export async function DELETE(_request, { params }) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const { id, episodeId } = await params;
    const series = await getSeries(id);
    if (!series) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }

    const targetEpisode = (series.episodes ?? []).find((episode) => episode.episodeId === episodeId);
    if (!targetEpisode) {
      return NextResponse.json({ error: "Episode tidak ditemukan." }, { status: 404 });
    }

    let assetId = targetEpisode.mux_asset_id ?? null;
    if (!assetId && (targetEpisode.mux_playback_id || targetEpisode.mux_video_id)) {
      const muxInfo = await normalizeMuxMetadata({
        assetId: targetEpisode.mux_asset_id,
        playbackId: targetEpisode.mux_playback_id,
        videoId: targetEpisode.mux_video_id,
      });
      assetId = muxInfo.assetId ?? null;
    }

    if (assetId && isMuxConfigured) {
      try {
        await deleteAsset(assetId);
      } catch (muxErr) {
        const code = muxErr?.status ?? muxErr?.statusCode;
        if (code !== 404) {
          console.error("DELETE episode Mux delete failed:", assetId, muxErr);
          return NextResponse.json(
            { error: "Gagal menghapus asset Mux episode; penghapusan dibatalkan." },
            { status: 502 }
          );
        }
      }
    }

    await deleteEpisode(id, episodeId);

    await recordAuditLog({
      actor: session,
      action: "series.episode.delete",
      targetId: id,
      targetType: "series-episode",
      metadata: { episodeId },
    }).catch((err) => console.warn("[DELETE episode] audit log failed:", err?.message || err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/series/[id]/episodes/[episodeId]", error);
    return NextResponse.json({ error: "Gagal menghapus episode." }, { status: 500 });
  }
}
