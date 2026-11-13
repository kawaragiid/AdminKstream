import { NextResponse } from "next/server";
import { fetchPlatformSettings, updatePlatformSettings } from "@/lib/settingsService";
import { requireRole } from "@/lib/session";
import { ADMIN_ROLES } from "@/utils/constants";

export async function GET() {
  const { error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const settings = await fetchPlatformSettings();
    return NextResponse.json({ data: settings });
  } catch (error) {
    console.error("GET /api/settings", error);
    return NextResponse.json({ error: "Gagal memuat pengaturan." }, { status: 500 });
  }
}

export async function PUT(request) {
  const { error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json();
    const updated = await updatePlatformSettings(payload);
    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/settings", error);
    return NextResponse.json({ error: "Gagal memperbarui pengaturan." }, { status: 500 });
  }
}
