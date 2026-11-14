import crypto from "node:crypto";
import { ensureNeonSchema, getSql, isNeonConfigured } from "./neonDb";

const FALLBACK_NOTIFICATIONS = [
  {
    id: "notif-1",
    title: "Upload konten berhasil",
    body: "Road to Mythic sudah tayang dan siap dipublikasikan.",
    type: "success",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    read: false,
  },
  {
    id: "notif-2",
    title: "API Mux",
    body: "Pemakaian menit encoding mencapai 80% kuota.",
    type: "warning",
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    read: false,
  },
];

export async function listNotifications({ limit = 20 } = {}) {
  if (!isNeonConfigured()) {
    return FALLBACK_NOTIFICATIONS.slice(0, limit);
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, title, message, type, read, metadata, created_at
    FROM notifications
    ORDER BY created_at DESC
    LIMIT ${Number(limit) || 20}
  `;

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.message,
    type: row.type,
    read: Boolean(row.read),
    ...(row.metadata || {}),
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  }));
}

export async function markNotificationAsRead(id) {
  if (!isNeonConfigured()) {
    const index = FALLBACK_NOTIFICATIONS.findIndex((item) => item.id === id);
    if (index !== -1) {
      FALLBACK_NOTIFICATIONS[index].read = true;
    }
    return { success: true };
  }

  await ensureNeonSchema();
  const sql = getSql();
  await sql`
    UPDATE notifications
    SET read = true,
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify({ readAt: new Date().toISOString() })}::jsonb
    WHERE id = ${id}
  `;
  return { success: true };
}

export async function createNotification(payload) {
  if (!payload?.title?.trim() || !payload?.body?.trim()) {
    throw new Error("Judul dan isi notifikasi wajib diisi.");
  }
  const data = {
    id: crypto.randomUUID(),
    title: payload.title.trim(),
    body: payload.body.trim(),
    type: payload.type ?? "info",
    createdAt: new Date().toISOString(),
    read: false,
  };

  if (!isNeonConfigured()) {
    FALLBACK_NOTIFICATIONS.unshift(data);
    return data;
  }

  await ensureNeonSchema();
  const sql = getSql();
  await sql`
    INSERT INTO notifications (id, title, message, type, read, metadata, created_at)
    VALUES (${data.id}, ${data.title}, ${data.body}, ${data.type}, false, '{}'::jsonb, ${data.createdAt})
  `;
  return data;
}
