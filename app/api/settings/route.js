import { NextResponse } from "next/server";
import { fetchPlatformSettings, updatePlatformSettings } from "@/lib/settingsService";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const settings = await fetchPlatformSettings();
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error("GET /api/settings", error);
    return NextResponse.json({ error: "Gagal memuat pengaturan." }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const updated = await updatePlatformSettings(payload);
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/settings", error);
    return NextResponse.json({ error: "Gagal memperbarui pengaturan." }, { status: 500 });
  }
}
