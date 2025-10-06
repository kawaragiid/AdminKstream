import { NextResponse } from "next/server";
import { addMultipleTextTracks, isMuxConfigured, resolveAssetId } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    let assetId = body?.assetId;
    const tracks = Array.isArray(body?.tracks) ? body.tracks : [];

    console.log("[MUX DEBUG] Receiving assetId:", assetId);
    console.log("TEXT TRACK REQUEST BODY", body);

    if (!assetId) {
      return NextResponse.json({ error: "assetId wajib diisi." }, { status: 400 });
    }

    assetId = await resolveAssetId(assetId);
    if (!assetId) {
      return NextResponse.json({ error: "assetId tidak valid." }, { status: 400 });
    }
    if (assetId !== body?.assetId) {
      console.log("[MUX DEBUG] Normalized assetId:", assetId);
    }

    if (!tracks.length) {
      return NextResponse.json({ error: "Tracks wajib diisi." }, { status: 400 });
    }

    // Hanya izinkan URL http(s). Mux membutuhkan URL publik yang bisa di-fetch.
    const filtered = tracks.filter((t) => typeof t?.url === "string" && /^https?:\/\//i.test(t.url));

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
