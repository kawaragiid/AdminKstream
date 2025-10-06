import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const firebaseCredentials = {
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
};

const isCredentialsComplete =
  Boolean(firebaseCredentials.projectId) &&
  Boolean(firebaseCredentials.clientEmail) &&
  Boolean(firebaseCredentials.privateKey);

export const isFirebaseConfigured = isCredentialsComplete;

export function getFirebaseAdminApp() {
  if (!isCredentialsComplete) return null;

  const existingApp = getApps()[0];
  if (existingApp) {
    return existingApp;
  }

  return initializeApp({
    credential: cert(firebaseCredentials),
  });
}

export function getFirestoreClient() {
  const app = getFirebaseAdminApp();
  if (!app) return null;
  return getFirestore(app);
}
