import { NextResponse } from "next/server";
import { convertSrtToVtt } from "@/utils/subtitles";
import { requireRole } from "@/lib/session";

const MAX_SUBTITLE_BYTES = 5 * 1024 * 1024;

export async function POST(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  const contentLength = Number(request.headers?.get?.("content-length") || 0);
  if (contentLength > MAX_SUBTITLE_BYTES) {
    return NextResponse.json({ error: "Ukuran subtitle melebihi batas 5 MB." }, { status: 413 });
  }

  try {
    let body;
    if (typeof request.text === "function") {
      const rawBody = await request.text();
      if (Buffer.byteLength(rawBody, "utf-8") > MAX_SUBTITLE_BYTES) {
        return NextResponse.json({ error: "Ukuran subtitle melebihi batas 5 MB." }, { status: 413 });
      }
      try {
        body = JSON.parse(rawBody || "{}");
      } catch {
        return NextResponse.json({ error: "Format JSON tidak valid." }, { status: 400 });
      }
    } else {
      body = await request.json();
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Body JSON harus berupa objek." }, { status: 400 });
    }

    const { content } = body;

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Konten subtitle wajib diisi." }, { status: 400 });
    }

    if (content.length > MAX_SUBTITLE_BYTES || Buffer.byteLength(content, "utf-8") > MAX_SUBTITLE_BYTES) {
      return NextResponse.json({ error: "Ukuran konten subtitle melebihi batas 5 MB." }, { status: 413 });
    }

    const normalizedContent = content.replace(/^\uFEFF/, "");
    const isAlreadyVtt = /^WEBVTT(?:\s|$)/i.test(normalizedContent.trimStart());
    if (isAlreadyVtt) {
      return NextResponse.json({ data: normalizedContent, converted: false });
    }

    const converted = convertSrtToVtt(normalizedContent);
    return NextResponse.json({ data: converted, converted: true });
  } catch (error) {
    console.error("POST /api/tools/convert-subtitle", error);
    return NextResponse.json({ error: "Gagal mengonversi subtitle." }, { status: 500 });
  }
}
