import { NextResponse } from "next/server";
import { fetchPlatformSettings, updatePlatformSettings } from "@/lib/settingsService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES } from "@/utils/constants";

export async function GET() {
  const { error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR]);
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
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Payload pengaturan tidak valid." }, { status: 400 });
    }

    const updated = await updatePlatformSettings(payload);
    await recordAuditLog({
      actor: session,
      action: "settings.update",
      targetId: "platform",
      targetType: "settings",
      metadata: { keys: Object.keys(payload) },
    }).catch((err) => console.warn("[PUT /api/settings] audit log failed:", err?.message || err));

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/settings", error);
    const status = error?.statusCode || 500;
    return NextResponse.json(
      { error: status !== 500 ? error.message : "Gagal memperbarui pengaturan." },
      { status }
    );
  }
}
