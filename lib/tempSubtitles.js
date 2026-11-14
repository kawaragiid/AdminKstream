import { randomBytes } from "node:crypto";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";

export const TEMP_SUBTITLES_COLLECTION = "kstream-temp-subtitles";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_VTT_BYTES = 900 * 1024;
const TOKEN_REGEX = /^[a-f0-9]{48}$/;

const memoryStore = new Map();

export function resolvePublicBaseUrl(request) {
  const envUrl = process.env.ADMIN_PUBLIC_URL || process.env.NEXT_PUBLIC_ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL;
  if (envUrl) return envUrl.replace(/\/+$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  return `${proto}://${host}`;
}

export async function saveTempSubtitle({ vtt, lang, label, name, uid }) {
  const text = String(vtt || "");
  if (Buffer.byteLength(text, "utf-8") > MAX_VTT_BYTES) {
    throw new Error("Ukuran subtitle melebihi 900 KB setelah konversi.");
  }
  const token = randomBytes(24).toString("hex");
  const now = Date.now();
  const record = {
    vtt: text,
    lang: lang || "en",
    label: label || lang || "Subtitle",
    name: name || "subtitle.vtt",
    uploadedBy: uid || null,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + TTL_MS).toISOString(),
  };

  if (isNeonConfigured()) {
    await ensureNeonSchema();
    const sql = getSql();
    await sql`
      INSERT INTO temp_subtitles (token, vtt_content, lang, label, expires_at, created_at)
      VALUES (${token}, ${record.vtt}, ${record.lang}, ${record.label}, ${record.expiresAt}, ${record.createdAt})
    `;
  } else {
    memoryStore.set(token, record);
  }
  return token;
}

export async function getTempSubtitle(token) {
  if (!TOKEN_REGEX.test(String(token || ""))) return null;
  let record = null;
  if (isNeonConfigured()) {
    await ensureNeonSchema();
    const sql = getSql();
    const rows = await sql`
      SELECT vtt_content, lang, label, expires_at, created_at
      FROM temp_subtitles
      WHERE token = ${token}
      LIMIT 1
    `;
    if (rows.length) {
      const r = rows[0];
      record = {
        vtt: r.vtt_content,
        lang: r.lang,
        label: r.label,
        createdAt: r.created_at ? new Date(r.created_at).toISOString() : null,
        expiresAt: r.expires_at ? new Date(r.expires_at).toISOString() : null,
      };
    }
  } else {
    record = memoryStore.get(token) ?? null;
  }
  if (!record) return null;
  if (record.expiresAt && new Date(record.expiresAt).getTime() < Date.now()) {
    await deleteTempSubtitle(token);
    return null;
  }
  return record;
}

export async function deleteTempSubtitle(token) {
  if (!TOKEN_REGEX.test(String(token || ""))) return false;
  try {
    if (isNeonConfigured()) {
      await ensureNeonSchema();
      const sql = getSql();
      await sql`DELETE FROM temp_subtitles WHERE token = ${token}`;
    } else {
      memoryStore.delete(token);
    }
    return true;
  } catch {
    return false;
  }
}

export function extractTempSubtitleToken(url) {
  try {
    const parsed = new URL(String(url));
    const match = parsed.pathname.match(/\/api\/public\/subtitles\/([a-f0-9]{48})(?:\.vtt)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

export async function purgeExpiredTempSubtitles() {
  if (!isNeonConfigured()) return 0;
  try {
    await ensureNeonSchema();
    const sql = getSql();
    const deleted = await sql`
      DELETE FROM temp_subtitles
      WHERE expires_at < NOW()
      RETURNING token
    `;
    return deleted.length;
  } catch {
    return 0;
  }
}
