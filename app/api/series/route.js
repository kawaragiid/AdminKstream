import { NextResponse } from "next/server";
import { listSeries, createSeries } from "@/lib/firestoreService";
import { normalizeMuxMetadata } from "@/lib/muxService";
import { validateSeriesPayload } from "@/utils/validators";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const filters = {
    search: searchParams.get("search") ?? searchParams.get("q") ?? "",
    category: searchParams.get("category") ?? "",
  };

  try {
    const series = await listSeries(filters);
    return NextResponse.json({ data: series });
  } catch (error) {
    console.error("GET /api/series", error);
    return NextResponse.json({ error: "Gagal memuat series." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const muxInfo = await normalizeMuxMetadata({
      assetId: payload.mux_asset_id,
      playbackId: payload.mux_playback_id,
      videoId: payload.mux_video_id,
    });
    payload.mux_asset_id = muxInfo.assetId;
    payload.mux_playback_id = muxInfo.playbackId;
    payload.mux_video_id = muxInfo.videoId;

    if (Array.isArray(payload.episodes)) {
      payload.episodes = await Promise.all(
        payload.episodes.map(async (episode) => {
          const episodeMux = await normalizeMuxMetadata({
            assetId: episode?.mux_asset_id,
            playbackId: episode?.mux_playback_id,
            videoId: episode?.mux_video_id,
          });
          return {
            ...episode,
            mux_asset_id: episodeMux.assetId,
            mux_playback_id: episodeMux.playbackId,
            mux_video_id: episodeMux.videoId,
          };
        })
      );
    }

    const created = await createSeries(payload, session);

    await recordAuditLog({
      actor: session,
      action: "series.create",
      targetId: created.id,
      targetType: "series",
      metadata: { title: created.title },
    });

    return NextResponse.json({ data: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/series", error);
    return NextResponse.json({ error: "Gagal membuat series." }, { status: 500 });
  }
}
