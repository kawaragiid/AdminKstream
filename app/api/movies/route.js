import { NextResponse } from "next/server";
import { listMovies, createMovie } from "@/lib/firestoreService";
import { resolveAssetId } from "@/lib/muxService";
import { validateMoviePayload } from "@/utils/validators";
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
    const movies = await listMovies(filters);
    return NextResponse.json({ data: movies });
  } catch (error) {
    console.error("GET /api/movies", error);
    return NextResponse.json({ error: "Gagal memuat movie." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    payload.mux_asset_id = (await resolveAssetId([
      payload.mux_asset_id,
      payload.mux_video_id,
      payload.mux_playback_id,
    ])) ?? null;
    const { valid, errors } = validateMoviePayload(payload);

    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const created = await createMovie(payload, session);

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
