import { getFirestoreClient, isFirebaseConfigured } from "./firebase";
import { FIRESTORE_COLLECTIONS, CONTENT_CATEGORIES } from "@/utils/constants";

const FALLBACK_SETTINGS = {
  categories: CONTENT_CATEGORIES,
  hero: {
    contentId: "demo-1",
    title: "Final Tournament Stream",
    subtitle: "Tonton pertandingan final yang paling epic minggu ini!",
    backgroundUrl: "https://images.unsplash.com/photo-1525182008055-f88b95ff7980",
  },
  theme: {
    mode: "dark",
  },
};

export async function fetchPlatformSettings() {
  if (!isFirebaseConfigured) {
    return FALLBACK_SETTINGS;
  }

  const firestore = getFirestoreClient();
  const doc = await firestore
    .collection(FIRESTORE_COLLECTIONS.SETTINGS)
    .doc("platform")
    .get();

  if (!doc.exists) {
    return FALLBACK_SETTINGS;
  }

  return {
    ...FALLBACK_SETTINGS,
    ...doc.data(),
  };
}

export async function updatePlatformSettings(payload) {
  const data = {
    categories: payload.categories ?? CONTENT_CATEGORIES,
    hero: payload.hero ?? FALLBACK_SETTINGS.hero,
    theme: payload.theme ?? FALLBACK_SETTINGS.theme,
    updatedAt: new Date().toISOString(),
  };

  if (!isFirebaseConfigured) {
    Object.assign(FALLBACK_SETTINGS, data);
    return FALLBACK_SETTINGS;
  }

  const firestore = getFirestoreClient();
  await firestore
    .collection(FIRESTORE_COLLECTIONS.SETTINGS)
    .doc("platform")
    .set(data, { merge: true });

  return data;
}
