import { NextResponse } from "next/server";
import { getSeries, updateSeries, deleteSeries } from "@/lib/firestoreService";
import {
  deleteAsset,
  isMuxConfigured,
  normalizeMuxMetadata,
  signMediaItemMuxUrls,
  syncEpisodeMuxMetadata,
} from "@/lib/muxService";
import { validateSeriesPayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES } from "@/utils/constants";

function stripImmutableFields(payload) {
  const { id: _id, createdAt: _ca, createdBy: _cb, views: _v, ...rest } = payload;
  return rest;
}

export async function GET(_request, { params }) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const { id } = await params;
    const series = await getSeries(id);
    if (!series) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ data: signMediaItemMuxUrls(series) });
  } catch (error) {
    console.error("GET /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal memuat series." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const { id } = await params;
    const existing = await getSeries(id);
    if (!existing) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }

    const rawPayload = await request.json().catch(() => null);
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    const payload = stripImmutableFields(rawPayload);
    const merged = { ...existing, ...payload };

    const existingEpisodes = Array.isArray(existing.episodes) ? existing.episodes : [];
    if (Array.isArray(payload.episodes)) {
      merged.episodes = payload.episodes.map((episode) => {
        const matchedExisting = existingEpisodes.find(
          (ep) =>
            (episode?.episodeId && ep?.episodeId === episode.episodeId) ||
            (episode?.epNumber !== undefined &&
              ep?.epNumber === episode.epNumber &&
              Number(ep?.seasonNumber ?? 1) === Number(episode?.seasonNumber ?? 1))
        );
        return {
          ...(matchedExisting ?? {}),
          ...episode,
          episodeId: episode?.episodeId ?? matchedExisting?.episodeId,
          createdAt: episode?.createdAt ?? matchedExisting?.createdAt,
        };
      });
    }

    const validation = validateSeriesPayload(merged);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: validation.errors }, { status: 422 });
    }

    if (
      payload.mux_asset_id !== undefined ||
      payload.mux_playback_id !== undefined ||
      payload.mux_video_id !== undefined
    ) {
      const muxInfo = await normalizeMuxMetadata({
        assetId: merged.mux_asset_id,
        playbackId: merged.mux_playback_id,
        videoId: merged.mux_video_id,
      });
      if (
        isMuxConfigured &&
        (merged.mux_asset_id || merged.mux_playback_id || merged.mux_video_id) &&
        !muxInfo.assetId
      ) {
        return NextResponse.json(
          { error: "Asset Mux tidak ditemukan atau belum valid. Periksa Playback/Asset ID." },
          { status: 422 }
        );
      }
      merged.mux_asset_id = muxInfo.assetId;
      merged.mux_playback_id = muxInfo.playbackId;
      merged.mux_video_id = muxInfo.videoId;
    }

    if (Array.isArray(payload.episodes)) {
      const normalizedEpisodes = [];
      for (const episode of merged.episodes) {
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
      merged.episodes = normalizedEpisodes;
    }

    const { id: _omit, ...data } = merged;
    const updated = await updateSeries(id, data);

    // Bersihkan asset Mux dari episode yang dihapus atau diganti
    if (isMuxConfigured && Array.isArray(payload.episodes)) {
      const nextAssetIds = new Set((updated.episodes ?? []).map((ep) => ep?.mux_asset_id).filter(Boolean));
      const removedAssetIds = existingEpisodes
        .map((ep) => ep?.mux_asset_id)
        .filter((assetId) => assetId && !nextAssetIds.has(assetId));
      await Promise.allSettled(
        removedAssetIds.map((assetId) =>
          deleteAsset(assetId).catch((err) =>
            console.warn("Gagal menghapus asset episode lama:", assetId, err?.message)
          )
        )
      );
    }

    const syncedEpisodes = Array.isArray(updated.episodes) ? updated.episodes : merged.episodes;
    if (Array.isArray(syncedEpisodes)) {
      await Promise.allSettled(
        syncedEpisodes.map((episode) =>
          syncEpisodeMuxMetadata({
            seriesId: id,
            seriesTitle: updated.title ?? merged.title,
            episode,
            creatorId: session.uid,
          })
        )
      );
    }

    await recordAuditLog({
      actor: session,
      action: "series.update",
      targetId: id,
      targetType: "series",
      metadata: { title: updated.title },
    }).catch((err) => console.warn("[PUT /api/series/[id]] audit log failed:", err?.message || err));

    return NextResponse.json({ data: signMediaItemMuxUrls(updated) });
  } catch (error) {
    console.error("PUT /api/series/[id]", error);
    const status = error?.statusCode || 500;
    return NextResponse.json(
      { error: status !== 500 ? error.message : "Gagal memperbarui series." },
      { status }
    );
  }
}

export async function DELETE(_request, { params }) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const { id } = await params;
    const current = await getSeries(id);
    if (!current) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }

    const episodes = current?.episodes ?? [];
    if (Array.isArray(episodes) && isMuxConfigured) {
      for (const ep of episodes) {
        let assetId = ep?.mux_asset_id ?? null;
        if (!assetId && (ep?.mux_playback_id || ep?.mux_video_id)) {
          const muxInfo = await normalizeMuxMetadata({
            assetId: ep?.mux_asset_id,
            playbackId: ep?.mux_playback_id,
            videoId: ep?.mux_video_id,
          });
          assetId = muxInfo.assetId;
        }
        if (assetId) {
          try {
            await deleteAsset(assetId);
          } catch (muxErr) {
            const code = muxErr?.status ?? muxErr?.statusCode;
            if (code !== 404) {
              console.error("DELETE /api/series/[id] Mux delete failed:", assetId, muxErr);
              return NextResponse.json(
                { error: "Gagal menghapus asset Mux episode; penghapusan series dibatalkan." },
                { status: 502 }
              );
            }
          }
        }
      }
    }

    await deleteSeries(id);

    await recordAuditLog({
      actor: session,
      action: "series.delete",
      targetId: id,
      targetType: "series",
    }).catch((err) => console.warn("[DELETE /api/series/[id]] audit log failed:", err?.message || err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus series." }, { status: 500 });
  }
}
