import { NextResponse } from "next/server";
import { getSeries, addEpisode } from "@/lib/firestoreService";
import { validateEpisode } from "@/utils/validators";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(_request, { params }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    payload.mux_asset_id = payload.mux_asset_id ?? payload.mux_video_id ?? payload.mux_playback_id ?? null;
    if (!payload || typeof payload !== 'object') {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }
    const { valid, errors } = validateEpisode(payload);

    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const { id } = await params;
    const episode = await addEpisode(id, payload);

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
