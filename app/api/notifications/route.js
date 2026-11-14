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
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const notifications = await listNotifications({ limit: 25, uid: session.uid });
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
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }
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
    }).catch((err) => console.warn("[POST /api/notifications] audit log failed:", err?.message || err));
    return NextResponse.json({ data: notification }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications", error);
    return NextResponse.json({ error: "Gagal membuat notifikasi." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return NextResponse.json({ error: "Payload tidak valid." }, { status: 400 });
    }
    if (!payload.id) {
      return NextResponse.json({ error: "ID notifikasi wajib diisi." }, { status: 400 });
    }

    const result = await markNotificationAsRead(payload.id, session.uid);
    await recordAuditLog({
      actor: session,
      action: "notification.read",
      targetId: payload.id,
      targetType: "notification",
    }).catch((err) => console.warn("[PATCH /api/notifications] audit log failed:", err?.message || err));

    return NextResponse.json({ data: result });
  } catch (error) {
    console.error("PATCH /api/notifications", error);
    const status = error?.statusCode || 500;
    return NextResponse.json(
      { error: status !== 500 ? error.message : "Gagal memperbarui notifikasi." },
      { status }
    );
  }
}
