import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const ADMIN_APP_NAME = "adminkstream-admin";

function normalizePrivateKey(rawKey) {
  if (!rawKey || typeof rawKey !== "string") return undefined;
  return rawKey
    .trim()
    .replace(/^["']|["']$/g, "")
    .replace(/\\\\n/g, "\n")
    .replace(/\\n/g, "\n");
}

const firebaseCredentials = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY),
};

const isCredentialsComplete =
  Boolean(firebaseCredentials.projectId) &&
  Boolean(firebaseCredentials.clientEmail) &&
  Boolean(firebaseCredentials.privateKey);

export const isFirebaseConfigured = isCredentialsComplete;

export function getFirebaseAdminApp() {
  if (!isCredentialsComplete) return null;

  const namedApp = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (namedApp) {
    return namedApp;
  }

  const defaultApp = getApps().find((app) => app.name === "[DEFAULT]");
  if (defaultApp) {
    return defaultApp;
  }

  return initializeApp(
    {
      credential: cert(firebaseCredentials),
    },
    ADMIN_APP_NAME
  );
}

export function getFirestoreClient() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getFirestore(app);
}
