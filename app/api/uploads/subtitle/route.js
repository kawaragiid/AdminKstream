import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { purgeExpiredTempSubtitles, resolvePublicBaseUrl, saveTempSubtitle } from "@/lib/tempSubtitles";
import { convertSrtToVtt } from "@/utils/subtitles";

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;
const ALLOWED_SUBTITLE_MIME = new Set([
  "text/vtt",
  "text/plain",
  "text/srt",
  "application/srt",
  "application/x-subrip",
  "application/octet-stream",
  "",
]);

function sanitizeSubtitleName(rawName) {
  return String(rawName || `subtitle-${Date.now()}.vtt`).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
}

function decodeSubtitleBuffer(buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder("utf-16le").decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder("utf-16be").decode(buffer.subarray(2));
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

const VTT_CUE_TIMING_REGEX =
  /^\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}\s+-->\s+(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{3}/m;
const LANG_CODE_REGEX = /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i;

function isValidWebVttContent(text) {
  const trimmed = text.trimStart();
  if (!/^WEBVTT(?:\s|$)/i.test(trimmed)) return false;
  return VTT_CUE_TIMING_REGEX.test(trimmed);
}

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const form = await request.formData();
    const file = form.get("file");
    const normalizedLang = String(form.get("lang") || "en")
      .trim()
      .replace(/_/g, "-")
      .replace(/[^a-zA-Z0-9-]/g, "")
      .slice(0, 16);
    const lang = LANG_CODE_REGEX.test(normalizedLang) ? normalizedLang : "en";
    const label = String(form.get("label") || lang).trim().slice(0, 60) || lang;

    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File subtitle tidak ditemukan." }, { status: 400 });
    }

    const rawFileName = typeof file.name === "string" ? file.name.trim() : "";
    const hasValidExt = /\.(srt|vtt|txt)$/i.test(rawFileName);
    const fileType = String(file.type || "").toLowerCase().split(";")[0].trim();
    if (!hasValidExt || !ALLOWED_SUBTITLE_MIME.has(fileType)) {
      return NextResponse.json({ error: "Format subtitle harus .srt, .vtt, atau .txt." }, { status: 400 });
    }

    const rawBuffer = Buffer.from(await file.arrayBuffer());
    if (rawBuffer.byteLength === 0) {
      return NextResponse.json({ error: "File subtitle tidak boleh kosong." }, { status: 400 });
    }
    if (rawBuffer.byteLength > MAX_SUBTITLE_BYTES) {
      return NextResponse.json({ error: "Ukuran file subtitle maksimal 5 MB." }, { status: 413 });
    }

    const rawText = decodeSubtitleBuffer(rawBuffer).replace(/^\uFEFF/, "");
    if (rawText.includes("\0")) {
      return NextResponse.json({ error: "File biner tidak diizinkan sebagai subtitle." }, { status: 400 });
    }

    const isVtt = /^WEBVTT(?:\s|$)/i.test(rawText.trimStart());
    if (isVtt && !isValidWebVttContent(rawText)) {
      return NextResponse.json({ error: "File WebVTT tidak memiliki cue timestamp yang valid." }, { status: 400 });
    }

    const vtt = isVtt ? rawText : convertSrtToVtt(rawText);
    if (!VTT_CUE_TIMING_REGEX.test(vtt)) {
      return NextResponse.json({ error: "Subtitle tidak memiliki cue timestamp yang valid." }, { status: 400 });
    }
    if (Buffer.byteLength(vtt, "utf-8") > MAX_SUBTITLE_BYTES) {
      return NextResponse.json({ error: "Ukuran subtitle melebihi batas maksimal 5 MB." }, { status: 413 });
    }

    const baseName = rawFileName.replace(/\.(srt|txt|vtt)$/i, "");
    const outName = sanitizeSubtitleName(`${baseName || "subtitle"}.vtt`);

    purgeExpiredTempSubtitles().catch(() => {});
    const token = await saveTempSubtitle({ vtt, lang, label, name: outName, uid: session.uid });
    const url = `${resolvePublicBaseUrl(request)}/api/public/subtitles/${token}.vtt`;

    return NextResponse.json({
      data: { url, lang, label, name: outName, temporary: true },
    });
  } catch (error) {
    console.error("POST /api/uploads/subtitle", error);
    const status = error?.statusCode || 500;
    return NextResponse.json({ error: error.message || "Gagal mengunggah subtitle." }, { status });
  }
}
