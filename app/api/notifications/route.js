import { NextResponse } from "next/server";
import {
  listNotifications,
  markNotificationAsRead,
  createNotification,
} from "@/lib/notificationsService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES } from "@/utils/constants";

export async function GET() {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const notifications = await listNotifications({ limit: 25 });
    return NextResponse.json({ data: notifications });
  } catch (error) {
    console.error("GET /api/notifications", error);
    return NextResponse.json({ error: "Gagal memuat notifikasi." }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json();
    if (!payload?.title?.trim() || !payload?.body?.trim()) {
      return NextResponse.json({ error: "Judul dan isi notifikasi wajib diisi." }, { status: 400 });
    }
    const notification = await createNotification(payload);
    await recordAuditLog({
      actor: session,
      action: "notification.create",
      targetId: notification.id,
      targetType: "notification",
      metadata: { title: notification.title, type: notification.type },
    });
    return NextResponse.json({ data: notification }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications", error);
    return NextResponse.json({ error: "Gagal membuat notifikasi." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const payload = await request.json();
    if (!payload.id) {
      return NextResponse.json({ error: "ID notifikasi wajib diisi." }, { status: 400 });
    }

    const result = await markNotificationAsRead(payload.id);
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("PATCH /api/notifications", error);
    return NextResponse.json({ error: "Gagal memperbarui notifikasi." }, { status: 500 });
  }
}
