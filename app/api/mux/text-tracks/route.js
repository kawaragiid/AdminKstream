import { NextResponse } from "next/server";
import { addMultipleTextTracks, isMuxConfigured, resolveAssetId } from "@/lib/muxService";
import { requireRole } from "@/lib/session";

export async function POST(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const body = await request.json();
    let assetId = body?.assetId;
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];

    if (!assetId) {
      return NextResponse.json({ error: "assetId wajib diisi." }, { status: 400 });
    }

    assetId = await resolveAssetId(assetId);
    if (!assetId) {
      return NextResponse.json({ error: "assetId tidak valid." }, { status: 400 });
    }

    if (!tracks.length) {
      return NextResponse.json({ error: "Tracks wajib diisi." }, { status: 400 });
    }

    // Hanya izinkan URL https (Mux membutuhkan URL publik yang bisa di-fetch).
    const filtered = tracks.filter((t) => {
      if (typeof t?.url !== "string") return false;
      try {
        const parsed = new URL(t.url);
        return parsed.protocol === "https:";
      } catch {
        return false;
      }
    });

    if (!filtered.length) {
      return NextResponse.json({ error: "Semua track harus memiliki URL https:// yang valid." }, { status: 400 });
    }

    const results = await addMultipleTextTracks(assetId, filtered);
    return NextResponse.json({ data: results, muxConfigured: isMuxConfigured });
  } catch (error) {
    console.error("POST /api/mux/text-tracks", error);
    return NextResponse.json({ error: "Gagal menambahkan subtitle ke Mux." }, { status: 500 });
  }
}
