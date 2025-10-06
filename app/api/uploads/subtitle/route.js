import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { uploadBufferToStorage } from "@/lib/storage";
import { convertSrtToVtt } from "@/utils/subtitles";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    const lang = form.get("lang") || "en";
    const label = form.get("label") || lang;

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File subtitle tidak ditemukan." }, { status: 400 });
    }

    const origName = file.name || `subtitle-${Date.now()}`;
    const isSrt = /\.srt$/i.test(origName) || file.type === "application/x-subrip";

    let buffer;
    let outName;
    let contentType = "text/vtt";

    if (isSrt) {
      const text = Buffer.from(await file.arrayBuffer()).toString("utf-8");
      const vtt = convertSrtToVtt(text);
      buffer = Buffer.from(vtt, "utf-8");
      outName = origName.replace(/\.srt$/i, ".vtt");
    } else if (file.type === "text/vtt" || /\.vtt$/i.test(origName)) {
      buffer = Buffer.from(await file.arrayBuffer());
      outName = origName;
    } else {
      // Paksa VTT jika tipe tidak dikenali
      const text = Buffer.from(await file.arrayBuffer()).toString("utf-8");
      const vtt = convertSrtToVtt(text);
      buffer = Buffer.from(vtt, "utf-8");
      outName = origName.replace(/\.[^/.]+$/, ".vtt");
    }

    const key = `subtitles/${session.uid}/${Date.now()}-${encodeURIComponent(outName)}`;
    const url = await uploadBufferToStorage({ buffer, destination: key, contentType });

    return NextResponse.json({
      data: { url, lang, label, name: outName },
    });
  } catch (error) {
    console.error("POST /api/uploads/subtitle", error);
    return NextResponse.json({ error: "Gagal mengunggah subtitle." }, { status: 500 });
  }
}

