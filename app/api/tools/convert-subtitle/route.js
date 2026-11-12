import { NextResponse } from "next/server";
import { convertSrtToVtt } from "@/utils/subtitles";
import { requireRole } from "@/lib/session";

export async function POST(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const body = await request.json();
    const { content, mimeType } = body ?? {};

    if (!content || typeof content !== "string") {
      return NextResponse.json({ error: "Konten subtitle wajib diisi." }, { status: 400 });
    }

    if (mimeType && mimeType !== "application/x-subrip") {
      return NextResponse.json({ data: content, converted: false });
    }

    const converted = convertSrtToVtt(content);
    return NextResponse.json({ data: converted, converted: true });
  } catch (error) {
    console.error("POST /api/tools/convert-subtitle", error);
    return NextResponse.json({ error: "Gagal mengonversi subtitle." }, { status: 500 });
  }
}
