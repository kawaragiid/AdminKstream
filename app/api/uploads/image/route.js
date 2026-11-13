import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

// Firebase Storage sudah dinonaktifkan (berbayar). Upload file gambar tidak lagi didukung.
// Gunakan URL gambar (https://) atau thumbnail otomatis dari Mux.
export async function POST() {
  const { error: authError } = await requireRole();
  if (authError) return authError;
  return NextResponse.json(
    {
      error:
        "Upload gambar dinonaktifkan karena Firebase Storage berbayar. Tempel URL gambar (https://) atau biarkan kosong untuk memakai thumbnail otomatis dari Mux.",
    },
    { status: 410 }
  );
}
