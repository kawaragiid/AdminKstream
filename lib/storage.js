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
    return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(destination)}`;
  }

  const [url] = await file.getSignedUrl({ action: "read", expires: signedUrlExpires });
  return url;
}

