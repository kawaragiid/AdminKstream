import { NextResponse } from "next/server";
import { getMovie, updateMovie, deleteMovie } from "@/lib/firestoreService";
import {
  deleteAsset,
  isMuxConfigured,
  normalizeMuxMetadata,
  signMediaItemMuxUrls,
  updateAssetMetadata,
} from "@/lib/muxService";
import { validateMoviePayload } from "@/utils/validators";
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
    const movie = await getMovie(id);
    if (!movie) {
      return NextResponse.json({ error: "Movie tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ data: signMediaItemMuxUrls(movie) });
  } catch (error) {
    console.error("GET /api/movies/[id]", error);
    return NextResponse.json({ error: "Gagal memuat movie." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const { id } = await params;
    const existing = await getMovie(id);
    if (!existing) {
      return NextResponse.json({ error: "Movie tidak ditemukan." }, { status: 404 });
    }

    const rawPayload = await request.json().catch(() => null);
    if (!rawPayload || typeof rawPayload !== "object" || Array.isArray(rawPayload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }

    const payload = stripImmutableFields(rawPayload);
    const merged = { ...existing, ...payload };

    const { valid, errors } = validateMoviePayload(merged);
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
          { error: "Asset Mux tidak ditemukan atau belum valid." },
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

    const { id: _omit, ...data } = merged;
    const updated = await updateMovie(id, data);

    // Hapus asset Mux lama jika diganti dengan asset baru
    const oldAssetId = existing.mux_asset_id;
    const newAssetId = updated.mux_asset_id;
    if (oldAssetId && newAssetId && oldAssetId !== newAssetId && isMuxConfigured) {
      await deleteAsset(oldAssetId).catch((err) =>
        console.warn("Gagal menghapus asset Mux lama saat update movie:", oldAssetId, err?.message)
      );
    }

    if (updated.mux_asset_id) {
      await updateAssetMetadata(updated.mux_asset_id, {
        title: updated.title,
        externalId: id,
        creatorId: session.uid,
        passthrough: JSON.stringify({ type: "movie", id, title: String(updated.title || "").slice(0, 100) }),
      }).catch((err) => console.warn("Gagal sinkronisasi metadata Mux movie:", err?.message));
    }

    await recordAuditLog({
      actor: session,
      action: "movie.update",
      targetId: id,
      targetType: "movie",
      metadata: { title: updated.title },
    }).catch((err) => console.warn("[PUT /api/movies/[id]] audit log failed:", err?.message || err));

    return NextResponse.json({ data: signMediaItemMuxUrls(updated) });
  } catch (error) {
    console.error("PUT /api/movies/[id]", error);
    const status = error?.statusCode || 500;
    return NextResponse.json(
      { error: status !== 500 ? error.message : "Gagal memperbarui movie." },
      { status }
    );
  }
}

export async function DELETE(_request, { params }) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const { id } = await params;
    const current = await getMovie(id);
    if (!current) {
      return NextResponse.json({ error: "Movie tidak ditemukan." }, { status: 404 });
    }

    let assetId = current?.mux_asset_id ?? null;
    if (!assetId && (current?.mux_playback_id || current?.mux_video_id)) {
      const muxInfo = await normalizeMuxMetadata({
        assetId: current?.mux_asset_id,
        playbackId: current?.mux_playback_id,
        videoId: current?.mux_video_id,
      });
      assetId = muxInfo.assetId;
    }

    if (assetId && isMuxConfigured) {
      try {
        await deleteAsset(assetId);
      } catch (muxErr) {
        const code = muxErr?.status ?? muxErr?.statusCode;
        if (code !== 404) {
          console.error("DELETE /api/movies/[id] Mux delete failed:", muxErr);
          return NextResponse.json(
            { error: "Gagal menghapus asset Mux; penghapusan movie dibatalkan agar tidak meninggalkan asset yatim." },
            { status: 502 }
          );
        }
      }
    }

    await deleteMovie(id);

    await recordAuditLog({
      actor: session,
      action: "movie.delete",
      targetId: id,
      targetType: "movie",
    }).catch((err) => console.warn("[DELETE /api/movies/[id]] audit log failed:", err?.message || err));

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/movies/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus movie." }, { status: 500 });
  }
}
