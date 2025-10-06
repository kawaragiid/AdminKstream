import { NextResponse } from "next/server";
import { getSeries, updateEpisode, deleteEpisode } from "@/lib/firestoreService";
import { validateEpisode } from "@/utils/validators";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function PUT(request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    const payload = await request.json();
    const merged = { ...existingEpisode, ...payload };
    const { valid, errors } = validateEpisode(merged);

    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    await updateEpisode(id, episodeId, merged);

    await recordAuditLog({
      actor: session,
      action: "series.episode.update",
      targetId: id,
      targetType: "series-episode",
      metadata: { episodeId: episodeId, title: merged.title },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT /api/series/[id]/episodes/[episodeId]", error);
    return NextResponse.json({ error: "Gagal memperbarui episode." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, episodeId } = await params;
    await deleteEpisode(id, episodeId);

    await recordAuditLog({
      actor: session,
      action: "series.episode.delete",
      targetId: id,
      targetType: "series-episode",
      metadata: { episodeId: episodeId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/series/[id]/episodes/[episodeId]", error);
    return NextResponse.json({ error: "Gagal menghapus episode." }, { status: 500 });
  }
}
