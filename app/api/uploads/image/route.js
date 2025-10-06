import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { uploadBufferToStorage } from "@/lib/storage";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!file || typeof file.arrayBuffer !== "function") {
      return NextResponse.json({ error: "File gambar tidak ditemukan." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name || `image-${Date.now()}`;
    const key = `images/${session.uid}/${Date.now()}-${encodeURIComponent(name)}`;
    const contentType = file.type || "image/jpeg";
    const url = await uploadBufferToStorage({ buffer, destination: key, contentType });
    return NextResponse.json({ data: { url, name } });
  } catch (error) {
    console.error("POST /api/uploads/image", error);
    return NextResponse.json({ error: "Gagal mengunggah gambar." }, { status: 500 });
  }
}

