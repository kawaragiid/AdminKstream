import crypto from "node:crypto";
import { ensureNeonSchema, getSql, isNeonConfigured } from "./neonDb";

const MAX_FALLBACK_LOGS = 200;
const FALLBACK_LOGS = [];

export async function recordAuditLog({
  actor,
  action,
  targetId,
  targetType,
  metadata,
}) {
  const logEntry = {
    id: crypto.randomUUID(),
    action,
    targetId: targetId ?? null,
    targetType: targetType ?? null,
    metadata: metadata ?? null,
    actor: actor
      ? {
          uid: actor.uid,
          email: actor.email ?? null,
          displayName: actor.displayName ?? null,
        }
      : null,
    createdAt: new Date().toISOString(),
  };

  if (!isNeonConfigured()) {
    FALLBACK_LOGS.unshift(logEntry);
    if (FALLBACK_LOGS.length > MAX_FALLBACK_LOGS) {
      FALLBACK_LOGS.length = MAX_FALLBACK_LOGS;
    }
    return logEntry;
  }

  await ensureNeonSchema();
  const sql = getSql();
  await sql`
    INSERT INTO audit_logs (id, actor, action, target_id, target_type, metadata, created_at)
    VALUES (
      ${logEntry.id},
      ${logEntry.actor ? JSON.stringify(logEntry.actor) : null}::jsonb,
      ${logEntry.action},
      ${logEntry.targetId || ""},
      ${logEntry.targetType || ""},
      ${JSON.stringify(logEntry.metadata || {})}::jsonb,
      ${logEntry.createdAt}
    )
  `;
  return logEntry;
}

export async function listAuditLogs({ limit = 50 } = {}) {
  const parsed = Number.parseInt(limit, 10);
  const safeLimit = Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 500) : 50;

  if (!isNeonConfigured()) {
    return FALLBACK_LOGS.slice(0, safeLimit);
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT id, actor, action, target_id, target_type, metadata, created_at
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `;

  return rows.map((row) => ({
    id: row.id,
    actor: row.actor,
    action: row.action,
    targetId: row.target_id || null,
    targetType: row.target_type || null,
    metadata: row.metadata || null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
  }));
}
