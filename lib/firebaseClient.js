import { getApps, initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

const clientConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseClientApp() {
  if (!clientConfig.apiKey) {
    throw new Error("Konfigurasi Firebase client belum lengkap. Pastikan NEXT_PUBLIC_FIREBASE_* terisi.");
  }

  if (!getApps().length) {
    initializeApp(clientConfig);
  }

  return getApps()[0];
}

export function getFirebaseAuth() {
  return getAuth(getFirebaseClientApp());
}

export const googleProvider = new GoogleAuthProvider();
