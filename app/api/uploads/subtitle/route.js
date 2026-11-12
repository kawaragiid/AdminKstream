import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { uploadBufferToStorage } from "@/lib/storage";
import { convertSrtToVtt } from "@/utils/subtitles";

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_SUBTITLE_MIME = new Set(["text/vtt", "text/plain", "application/x-subrip", "application/octet-stream", ""]);

function sanitizeSubtitleName(rawName) {
  return String(rawName || `subtitle-${Date.now()}.vtt`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const lang = String(form.get("lang") || "en").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 16) || "en";
    const label = String(form.get("label") || lang).trim().slice(0, 60) || lang;

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File subtitle tidak ditemukan." }, { status: 400 });
    }

    const origName = sanitizeSubtitleName(file.name);
    const fileType = String(file.type || "").toLowerCase();
    const hasValidExt = /\.(srt|vtt|txt)$/i.test(origName);
    if (!hasValidExt && !ALLOWED_SUBTITLE_MIME.has(fileType)) {
      return NextResponse.json({ error: "Format subtitle harus .srt atau .vtt." }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.byteLength === 0 || rawBuffer.byteLength > MAX_SUBTITLE_BYTES) {
      return NextResponse.json({ error: "Ukuran file subtitle maksimal 5 MB." }, { status: 400 });
    }

    const isSrt = /\.srt$/i.test(origName) || fileType === "application/x-subrip";
    let buffer;
    let outName;
    const contentType = "text/vtt";

    if (isSrt) {
      const vtt = convertSrtToVtt(rawBuffer.toString("utf-8"));
      buffer = Buffer.from(vtt, "utf-8");
      outName = origName.replace(/\.srt$/i, ".vtt");
    } else if (fileType === "text/vtt" || /\.vtt$/i.test(origName)) {
      buffer = rawBuffer;
      outName = origName;
    } else {
      const vtt = convertSrtToVtt(rawBuffer.toString("utf-8"));
      buffer = Buffer.from(vtt, "utf-8");
      outName = origName.replace(/\.[^/.]+$/, ".vtt");
    }

    const key = `subtitles/${session.uid}/${Date.now()}-${outName}`;
    const url = await uploadBufferToStorage({ buffer, destination: key, contentType });

    return NextResponse.json({
      data: { url, lang, label, name: outName },
    });
  } catch (error) {
    console.error("POST /api/uploads/subtitle", error);
    return NextResponse.json({ error: "Gagal mengunggah subtitle." }, { status: 500 });
  }
}
