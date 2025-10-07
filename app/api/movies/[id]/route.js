import { NextResponse } from "next/server";
import { getMovie, updateMovie, deleteMovie } from "@/lib/firestoreService";
import { deleteAsset, isMuxConfigured, normalizeMuxMetadata } from "@/lib/muxService";
import { validateMoviePayload } from "@/utils/validators";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(_request, { params }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const movie = await getMovie(id);
    if (!movie) {
      return NextResponse.json({ error: "Movie tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ data: movie });
  } catch (error) {
    console.error("GET /api/movies/[id]", error);
    return NextResponse.json({ error: "Gagal memuat movie." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await getMovie(id);
    if (!existing) {
      return NextResponse.json({ error: "Movie tidak ditemukan." }, { status: 404 });
    }

    const payload = await request.json();
    const merged = { ...existing, ...payload };
    const muxInfo = await normalizeMuxMetadata({
      assetId: merged.mux_asset_id,
      playbackId: merged.mux_playback_id,
      videoId: merged.mux_video_id,
    });
    merged.mux_asset_id = muxInfo.assetId;
    merged.mux_playback_id = muxInfo.playbackId;
    merged.mux_video_id = muxInfo.videoId;
    const { valid, errors } = validateMoviePayload(merged);

    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const { id: _omit, ...data } = merged;
    const updated = await updateMovie(id, data);

    await recordAuditLog({
      actor: session,
      action: "movie.update",
      targetId: id,
      targetType: "movie",
      metadata: { title: updated.title },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/movies/[id]", error);
    return NextResponse.json({ error: "Gagal memperbarui movie." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    // Hapus asset Mux bila ada
    try {
      const current = await getMovie(id);
      const assetId = current?.mux_asset_id;
      if (assetId && isMuxConfigured) {
        await deleteAsset(assetId);
      }
    } catch (e) {
      console.warn("Gagal menghapus asset Mux untuk movie", e?.message);
    }
    await deleteMovie(id);

    await recordAuditLog({
      actor: session,
      action: "movie.delete",
      targetId: id,
      targetType: "movie",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/movies/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus movie." }, { status: 500 });
  }
}
