import { NextResponse } from "next/server";
import { addMultipleTextTracks, isMuxConfigured } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const assetId = body?.assetId;
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];

    if (!assetId || !tracks.length) {
      return NextResponse.json({ error: "assetId dan tracks wajib diisi." }, { status: 400 });
    }

    // Hanya izinkan URL http(s). Mux membutuhkan URL publik yang bisa di-fetch.
    const filtered = tracks.filter((t) => typeof t?.url === "string" && /^https?:\/\//i.test(t.url));

    console.log("TEXT TRACK REQUEST BODY", body);
    console.log("FILTERED TRACKS", filtered);
    if (!filtered.length) {
      return NextResponse.json({ error: "Semua track harus memiliki URL http(s) yang valid." }, { status: 400 });
    }

    const results = await addMultipleTextTracks(assetId, filtered);
    console.log("MUX TEXT TRACKS RESULT", results);
    return NextResponse.json({ data: results, muxConfigured: isMuxConfigured });
  } catch (error) {
    console.error("POST /api/mux/text-tracks", error);
    return NextResponse.json({ error: "Gagal menambahkan subtitle ke Mux." }, { status: 500 });
  }
}


