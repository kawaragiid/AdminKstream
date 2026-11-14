import { randomBytes } from "node:crypto";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";

export const TEMP_SUBTITLES_COLLECTION = "kstream-temp-subtitles";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_VTT_BYTES = 5 * 1024 * 1024;
const TOKEN_REGEX = /^[a-f0-9]{48}$/;
const SAFE_HOST_REGEX = /^[a-z0-9.-]+(:\d+)?$/i;

const memoryStore = new Map();

export function resolvePublicBaseUrl(request) {
  const envUrl =
    process.env.ADMIN_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_ADMIN_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : null) ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null);
  if (envUrl) return envUrl.replace(/\/+$/, "");

  // Jangan percaya header x-forwarded-proto / x-forwarded-host yang dapat di-spoof;
  // gunakan origin dari request.nextUrl atau request.url yang terverifikasi.
  const nextOrigin = request?.nextUrl?.origin;
  if (nextOrigin && nextOrigin !== "null") {
    try {
      const parsed = new URL(nextOrigin);
      if (SAFE_HOST_REGEX.test(parsed.host) && (parsed.protocol === "https:" || parsed.protocol === "http:")) {
        return parsed.origin;
      }
    } catch {
      // Abaikan
    }
  }

  try {
    const parsed = request?.url ? new URL(request.url) : null;
    if (parsed && SAFE_HOST_REGEX.test(parsed.host)) {
      const urlProto = parsed.protocol === "http:" ? "http" : "https";
      return `${urlProto}://${parsed.host}`;
    }
  } catch {
    // Abaikan
  }

  throw new Error("Origin publik tidak terkonfigurasi.");
}

export async function saveTempSubtitle({ vtt, lang, label, name, uid }) {
  const text = String(vtt || "");
  if (Buffer.byteLength(text, "utf-8") > MAX_VTT_BYTES) {
    const err = new Error("Ukuran subtitle melebihi 5 MB setelah konversi.");
    err.statusCode = 413;
    throw err;
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
      INSERT INTO temp_subtitles (token, vtt_content, lang, label, name, uploaded_by, expires_at, created_at)
      VALUES (${token}, ${record.vtt}, ${record.lang}, ${record.label}, ${record.name}, ${record.uploadedBy}, ${record.expiresAt}, ${record.createdAt})
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
      SELECT vtt_content, lang, label, name, uploaded_by, expires_at, created_at
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
        name: r.name || "subtitle.vtt",
        uploadedBy: r.uploaded_by || null,
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
  } catch (error) {
    console.warn("[tempSubtitles] deleteTempSubtitle failed:", error?.message || error);
    return false;
  }
}

export async function shortenTempSubtitleExpiry(token, ttlMs = 5 * 60 * 1000) {
  if (!TOKEN_REGEX.test(String(token || ""))) return false;
  const newExpiry = new Date(Date.now() + ttlMs).toISOString();
  try {
    if (isNeonConfigured()) {
      await ensureNeonSchema();
      const sql = getSql();
      await sql`UPDATE temp_subtitles SET expires_at = ${newExpiry} WHERE token = ${token}`;
    } else if (memoryStore.has(token)) {
      const rec = memoryStore.get(token);
      memoryStore.set(token, { ...rec, expiresAt: newExpiry });
    }
    return true;
  } catch (error) {
    console.warn("[tempSubtitles] shortenTempSubtitleExpiry failed:", error?.message || error);
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
  if (!isNeonConfigured()) {
    const now = Date.now();
    let count = 0;
    for (const [token, rec] of memoryStore.entries()) {
      if (rec?.expiresAt && new Date(rec.expiresAt).getTime() < now) {
        memoryStore.delete(token);
        count += 1;
      }
    }
    return count;
  }
  try {
    await ensureNeonSchema();
    const sql = getSql();
    const deleted = await sql`
      DELETE FROM temp_subtitles
      WHERE expires_at < NOW()
      RETURNING token
    `;
    return deleted.length;
  } catch (error) {
    console.warn("[tempSubtitles] purgeExpiredTempSubtitles failed:", error?.message || error);
    return 0;
  }
}
