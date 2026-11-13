import { randomBytes } from "node:crypto";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";

/**
 * Penyimpanan subtitle SEMENTARA tanpa Firebase Storage (100% gratis).
 *
 * Alur (Opsi A — Full Mux Native):
 * 1. Admin upload .srt/.vtt -> dikonversi ke WebVTT -> teksnya disimpan di Firestore
 *    (koleksi `kstream-temp-subtitles`, 1 dokumen per file, maks ~900 KB).
 * 2. AdminKstream menyajikannya lewat URL publik bertoken acak:
 *    GET /api/public/subtitles/<token>.vtt
 * 3. Mux mengunduh file itu sekali saat `createTrack`, lalu subtitle tersimpan permanen di Mux.
 * 4. Setelah Mux sukses, dokumen sementara dihapus. Dokumen yang tidak terpakai kedaluwarsa otomatis (24 jam).
 */

export const TEMP_SUBTITLES_COLLECTION = "kstream-temp-subtitles";
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_VTT_BYTES = 900 * 1024; // batas aman di bawah limit dokumen Firestore (1 MiB)
const TOKEN_REGEX = /^[a-f0-9]{48}$/;

// Fallback in-memory (mode tanpa Firebase / development)
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

  if (isFirebaseConfigured) {
    await getFirestoreClient().collection(TEMP_SUBTITLES_COLLECTION).doc(token).set(record);
  } else {
    memoryStore.set(token, record);
  }
  return token;
}

export async function getTempSubtitle(token) {
  if (!TOKEN_REGEX.test(String(token || ""))) return null;
  let record = null;
  if (isFirebaseConfigured) {
    const snap = await getFirestoreClient().collection(TEMP_SUBTITLES_COLLECTION).doc(token).get();
    record = snap.exists ? snap.data() : null;
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
    if (isFirebaseConfigured) {
      await getFirestoreClient().collection(TEMP_SUBTITLES_COLLECTION).doc(token).delete();
    } else {
      memoryStore.delete(token);
    }
    return true;
  } catch {
    return false;
  }
}

/** Ambil token dari URL publik `/api/public/subtitles/<token>.vtt`. */
export function extractTempSubtitleToken(url) {
  try {
    const parsed = new URL(String(url));
    const match = parsed.pathname.match(/\/api\/public\/subtitles\/([a-f0-9]{48})(?:\.vtt)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

/** Bersihkan dokumen sementara yang sudah kedaluwarsa (dipanggil oportunistik saat upload). */
export async function purgeExpiredTempSubtitles() {
  if (!isFirebaseConfigured) return 0;
  try {
    const nowIso = new Date().toISOString();
    const snap = await getFirestoreClient()
      .collection(TEMP_SUBTITLES_COLLECTION)
      .where("expiresAt", "<", nowIso)
      .limit(50)
      .get();
    await Promise.allSettled(snap.docs.map((d) => d.ref.delete()));
    return snap.size;
  } catch {
    return 0;
  }
}
