import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { uploadBufferToStorage } from "@/lib/storage";

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_IMAGE_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
  ["image/avif", "avif"],
]);

function sanitizeFilename(rawName, fallbackExt) {
  const base = String(rawName || `image-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, "_");
  return base.includes(".") ? base.slice(0, 120) : `${base.slice(0, 100)}.${fallbackExt}`;
}

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File gambar tidak ditemukan." }, { status: 400 });
    }

    const contentType = String(file.type || "").toLowerCase();
    const ext = ALLOWED_IMAGE_TYPES.get(contentType);
    if (!ext) {
      return NextResponse.json({ error: "Format gambar harus JPEG, PNG, WebP, GIF, atau AVIF." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (buffer.byteLength === 0 || buffer.byteLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: "Ukuran gambar maksimal 10 MB." }, { status: 400 });
    }

    const name = sanitizeFilename(file.name, ext);
    const key = `images/${session.uid}/${Date.now()}-${name}`;
    const url = await uploadBufferToStorage({ buffer, destination: key, contentType });
    return NextResponse.json({ data: { url, name } });
  } catch (error) {
    console.error("POST /api/uploads/image", error);
    return NextResponse.json({ error: "Gagal mengunggah gambar." }, { status: 500 });
  }
}
