import crypto from "node:crypto";
import { ensureNeonSchema, getSql, isNeonConfigured, withTransaction } from "./neonDb";

const FALLBACK_NOTIFICATIONS = [
  {
    id: "notif-1",
    title: "Upload konten berhasil",
    body: "Road to Mythic sudah tayang dan siap dipublikasikan.",
    type: "success",
    createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    read: false,
    readBy: [],
  },
  {
    id: "notif-2",
    title: "API Mux",
    body: "Pemakaian menit encoding mencapai 80% kuota.",
    type: "warning",
    createdAt: new Date(Date.now() - 1000 * 60 * 35).toISOString(),
    read: false,
    readBy: [],
  },
];

export async function listNotifications({ limit = 20, uid } = {}) {
  const parsed = Number.parseInt(limit, 10);
  const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 200) : 20;

  if (!isNeonConfigured()) {
    return FALLBACK_NOTIFICATIONS.slice(0, safeLimit).map((item) => ({
      ...item,
      read: uid ? (Array.isArray(item.readBy) ? item.readBy.includes(uid) : Boolean(item.read)) : Boolean(item.read),
    }));
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, title, message, type, read, metadata, created_at
    FROM notifications
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map((row) => {
    const meta = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
    const readBy = Array.isArray(meta.readBy) ? meta.readBy : [];
    const isRead = uid ? readBy.includes(uid) || Boolean(row.read) : Boolean(row.read);
    return {
      id: row.id,
      title: row.title,
      body: row.message,
      type: row.type,
      ...meta,
      read: isRead,
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
    };
  });
}

export async function markNotificationAsRead(id, uid) {
  if (!id) {
    const err = new Error("ID notifikasi wajib diisi.");
    err.statusCode = 400;
    throw err;
  }

  if (!isNeonConfigured()) {
    const index = FALLBACK_NOTIFICATIONS.findIndex((item) => item.id === id);
    if (index === -1) {
      const err = new Error("Notifikasi tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }
    const item = FALLBACK_NOTIFICATIONS[index];
    if (uid) {
      const readBy = Array.isArray(item.readBy) ? [...item.readBy] : [];
      if (!readBy.includes(uid)) {
        readBy.push(uid);
        if (readBy.length > 500) {
          readBy.splice(0, readBy.length - 500);
        }
      }
      item.readBy = readBy;
    } else {
      item.read = true;
    }
    return { success: true };
  }

  await ensureNeonSchema();
  await withTransaction(async (tx) => {
    const existing = await tx`
      SELECT id, metadata
      FROM notifications
      WHERE id = ${id}
      FOR UPDATE
    `;
    if (!existing.length) {
      const err = new Error("Notifikasi tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }

    const meta = existing[0].metadata && typeof existing[0].metadata === "object" ? existing[0].metadata : {};
    let readBy = Array.isArray(meta.readBy) ? [...meta.readBy] : [];
    if (uid && !readBy.includes(uid)) {
      readBy.push(uid);
      if (readBy.length > 500) {
        readBy = readBy.slice(-500);
      }
    }
    const nextMeta = { ...meta, readBy, readAt: new Date().toISOString() };

    await tx`
      UPDATE notifications
      SET metadata = ${JSON.stringify(nextMeta)}::jsonb,
          read = COALESCE(read, false) OR ${!uid}
      WHERE id = ${id}
    `;
  });
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
    FALLBACK_NOTIFICATIONS.unshift({ ...data, readBy: [] });
    if (FALLBACK_NOTIFICATIONS.length > 200) FALLBACK_NOTIFICATIONS.length = 200;
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
