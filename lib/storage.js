import { getFirebaseAdminApp } from "@/lib/firebase";
import { getStorage } from "firebase-admin/storage";

function getBucketName() {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || null;
}

export function getStorageBucket() {
  const app = getFirebaseAdminApp();
  const bucketName = getBucketName();
  if (!app || !bucketName) return null;
  return getStorage(app).bucket(bucketName);
}

export async function uploadBufferToStorage({
  buffer,
  destination,
  contentType = "application/octet-stream",
  makePublic = false,
  signedUrlExpires = "2099-12-31",
}) {
  const bucket = getStorageBucket();
  if (!bucket) throw new Error("Firebase Storage belum dikonfigurasi.");

  const file = bucket.file(destination);
  await file.save(buffer, { contentType, resumable: false, public: makePublic });

  if (makePublic) {
    try {
      await file.makePublic();
    } catch (_) {}
    const encodedPath = String(destination)
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    return `https://storage.googleapis.com/${bucket.name}/${encodedPath}`;
  }

  const [url] = await file.getSignedUrl({ action: "read", expires: signedUrlExpires });
  return url;
}

export async function deleteTempSubtitleFromStorage(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return false;
  const bucket = getStorageBucket();
  if (!bucket) return false;
  try {
    const parsed = new URL(fileUrl);
    if (parsed.hostname !== "storage.googleapis.com") return false;
    const prefix = `/${bucket.name}/`;
    if (!parsed.pathname.startsWith(prefix)) return false;
    const objectPath = parsed.pathname
      .slice(prefix.length)
      .split("/")
      .map((seg) => decodeURIComponent(seg))
      .join("/");
    if (!objectPath.startsWith("subtitles/")) return false;
    await bucket.file(objectPath).delete({ ignoreNotFound: true });
    return true;
  } catch {
    return false;
  }
}

