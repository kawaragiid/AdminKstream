import { getFirestoreClient, isFirebaseConfigured } from "./firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

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
  if (!isFirebaseConfigured) {
    return FALLBACK_NOTIFICATIONS.slice(0, limit);
  }

  const firestore = getFirestoreClient();
  const snapshot = await firestore
    .collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}

export async function markNotificationAsRead(id) {
  if (!isFirebaseConfigured) {
    const index = FALLBACK_NOTIFICATIONS.findIndex((item) => item.id === id);
    if (index !== -1) {
      FALLBACK_NOTIFICATIONS[index].read = true;
    }
    return { success: true };
  }

  const firestore = getFirestoreClient();
  await firestore
    .collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS)
    .doc(id)
    .update({ read: true, readAt: new Date().toISOString() });

  return { success: true };
}

export async function createNotification(payload) {
  const data = {
    title: payload.title,
    body: payload.body,
    type: payload.type ?? "info",
    createdAt: new Date().toISOString(),
    read: false,
  };

  if (!isFirebaseConfigured) {
    FALLBACK_NOTIFICATIONS.unshift({ id: `mock-${Date.now()}`, ...data });
    return data;
  }

  const firestore = getFirestoreClient();
  const docRef = await firestore.collection(FIRESTORE_COLLECTIONS.NOTIFICATIONS).add(data);
  return { id: docRef.id, ...data };
}
