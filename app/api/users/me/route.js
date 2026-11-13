import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { requireRole } from "@/lib/session";
import { getFirebaseAdminApp, getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

function sanitizePhotoUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;
  if (!isFirebaseConfigured) return NextResponse.json({ data: session });
  const firestore = getFirestoreClient();
  const doc = await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(session.uid).get();
  const data = doc.exists ? doc.data() : {};
  return NextResponse.json({ data: { displayName: data.displayName ?? session.displayName, photoURL: data.photoUrl ?? data.photoURL ?? session.photoURL } });
}

export async function PUT(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;
  try {
    const body = await request.json();
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 100) || null : null;
    const photoURL = body?.photoURL ? sanitizePhotoUrl(body.photoURL) : null;
    if (body?.photoURL && !photoURL) {
      return NextResponse.json({ error: "URL foto profil tidak valid." }, { status: 400 });
    }
    if (!isFirebaseConfigured) return NextResponse.json({ data: { displayName, photoURL } });
    const firestore = getFirestoreClient();
    await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(session.uid).set({
      displayName,
      photoUrl: photoURL,
    }, { merge: true });
    const app = getFirebaseAdminApp();
    if (app) {
      await getAuth(app)
        .updateUser(session.uid, {
          displayName,
          ...(photoURL ? { photoURL } : {}),
        })
        .catch(() => {});
    }
    return NextResponse.json({ data: { displayName, photoURL } });
  } catch (error) {
    console.error("PUT /api/users/me", error);
    return NextResponse.json({ error: error.message || "Gagal memperbarui profil." }, { status: 500 });
  }
}

