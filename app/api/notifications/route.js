import { NextResponse } from "next/server";
import {
  listNotifications,
  markNotificationAsRead,
  createNotification,
} from "@/lib/notificationsService";
import { getSessionUser } from "@/lib/session";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const notifications = await listNotifications({ limit: 25 });
    return NextResponse.json({ data: notifications });
  } catch (error) {
    console.error("GET /api/notifications", error);
    return NextResponse.json({ error: "Gagal memuat notifikasi." }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const notification = await createNotification(payload);
    return NextResponse.json({ data: notification }, { status: 201 });
  } catch (error) {
    console.error("POST /api/notifications", error);
    return NextResponse.json({ error: "Gagal membuat notifikasi." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
