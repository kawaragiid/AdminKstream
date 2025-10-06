import { NextResponse } from "next/server";
import { listAllMedia } from "@/lib/firestoreService";
import { getSessionUser } from "@/lib/session";

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
    const items = await listAllMedia(filters);
    return NextResponse.json({ data: items });
  } catch (error) {
    console.error("GET /api/content", error);
    return NextResponse.json({ error: "Gagal mengambil data konten." }, { status: 500 });
  }
}

export function POST() {
  return NextResponse.json(
    { error: "Gunakan /api/movies atau /api/series untuk membuat konten." },
    { status: 405 }
  );
}

export function PUT() {
  return NextResponse.json(
    { error: "Gunakan /api/movies/{id} atau /api/series/{id}." },
    { status: 405 }
  );
}

export function DELETE() {
  return NextResponse.json(
    { error: "Gunakan endpoint khusus movies/series." },
    { status: 405 }
  );
}
