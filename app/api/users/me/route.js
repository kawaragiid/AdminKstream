import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

export async function GET() {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isFirebaseConfigured) return NextResponse.json({ data: session });
  const firestore = getFirestoreClient();
  const doc = await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(session.uid).get();
  const data = doc.exists ? doc.data() : {};
  return NextResponse.json({ data: { displayName: data.displayName ?? session.displayName, photoURL: data.photoUrl ?? data.photoURL ?? session.photoURL } });
}

export async function PUT(request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await request.json();
  if (!isFirebaseConfigured) return NextResponse.json({ data: { displayName: body.displayName, photoURL: body.photoURL } });
  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(session.uid).set({
    displayName: body.displayName ?? null,
    photoUrl: body.photoURL ?? null,
  }, { merge: true });
  return NextResponse.json({ data: { displayName: body.displayName ?? null, photoURL: body.photoURL ?? null } });
}

