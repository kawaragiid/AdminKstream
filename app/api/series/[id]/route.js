import { NextResponse } from "next/server";
import { getSeries, updateSeries, deleteSeries } from "@/lib/firestoreService";
import { deleteAsset, isMuxConfigured, normalizeMuxMetadata, syncEpisodeMuxMetadata } from "@/lib/muxService";
import { validateSeriesPayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES } from "@/utils/constants";

export async function GET(_request, { params }) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const { id } = await params;
    const series = await getSeries(id);
    if (!series) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ data: series });
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

    const payload = await request.json();
    const merged = { ...existing, ...payload };
    if (payload.mux_asset_id !== undefined || payload.mux_playback_id !== undefined || payload.mux_video_id !== undefined) {
      const muxInfo = await normalizeMuxMetadata({
        assetId: merged.mux_asset_id,
        playbackId: merged.mux_playback_id,
        videoId: merged.mux_video_id,
      });
      merged.mux_asset_id = muxInfo.assetId;
      merged.mux_playback_id = muxInfo.playbackId;
      merged.mux_video_id = muxInfo.videoId;
    }

    if (Array.isArray(merged.episodes)) {
      const existingEpisodes = Array.isArray(existing.episodes) ? existing.episodes : [];
      merged.episodes = await Promise.all(
        merged.episodes.map(async (episode) => {
          const matchedExisting = existingEpisodes.find(
            (ep) =>
              (episode?.episodeId && ep?.episodeId === episode.episodeId) ||
              (episode?.epNumber !== undefined && ep?.epNumber === episode.epNumber)
          );
          const episodeMux = await normalizeMuxMetadata({
            assetId: episode?.mux_asset_id ?? matchedExisting?.mux_asset_id,
            playbackId: episode?.mux_playback_id ?? matchedExisting?.mux_playback_id,
            videoId: episode?.mux_video_id ?? matchedExisting?.mux_video_id,
          });
          return {
            ...(matchedExisting ?? {}),
            ...episode,
            episodeId: episode?.episodeId ?? matchedExisting?.episodeId,
            createdAt: episode?.createdAt ?? matchedExisting?.createdAt,
            duration: episode?.duration || matchedExisting?.duration || episodeMux.duration || null,
            mux_asset_id: episodeMux.assetId,
            mux_playback_id: episodeMux.playbackId,
            mux_video_id: episodeMux.videoId,
          };
        })
      );
    }

    const validation = validateSeriesPayload(merged);
    if (!validation.valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: validation.errors }, { status: 422 });
    }

    const { id: _omit, ...data } = merged;
    const updated = await updateSeries(id, data);

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
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal memperbarui series." }, { status: 500 });
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
    // Hapus semua asset Mux episode jika ada
    try {
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
            try { await deleteAsset(assetId); } catch (e) { console.warn('Gagal hapus asset', assetId); }
          }
        }
      }
    } catch (e) {
      console.warn("Gagal memproses penghapusan asset Mux untuk series", e?.message);
    }
    await deleteSeries(id);

    await recordAuditLog({
      actor: session,
      action: "series.delete",
      targetId: id,
      targetType: "series",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus series." }, { status: 500 });
  }
}
