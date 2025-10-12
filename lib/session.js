import { cookies } from "next/headers";
import { cache } from "react";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, getFirestoreClient, isFirebaseConfigured } from "./firebase";
import { FIRESTORE_COLLECTIONS, ADMIN_ROLES, USER_PLANS } from "@/utils/constants";

export const SESSION_COOKIE_NAME = "adminkstream_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 hari

function getAdminAuth() {
  const app = getFirebaseAdminApp();
  if (!app) {
    throw new Error("Firebase Admin belum dikonfigurasi. Lengkapi kredensial di .env.local.");
  }
  return getAuth(app);
}

function normalizeAdminProfile(data) {
  if (!data) return null;
  return {
    displayName: data.displayName ?? null,
    email: data.email ?? null,
    role: data.role ?? null,
    status: data.status ?? data.state ?? null,
    plan: data.plan ?? null,
    permissions: data.permissions ?? [],
    photoURL: data.photoUrl ?? data.photoURL ?? null,
  };
}

async function fetchAdminProfile(uid) {
  if (!isFirebaseConfigured) {
    return {
      role: ADMIN_ROLES.ADMIN,
      displayName: "Dev Admin",
      status: "active",
      plan: USER_PLANS.PREMIUM,
    };
  }

  const firestore = getFirestoreClient();
  if (!firestore) return null;

  const doc = await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(uid).get();

  if (!doc.exists) return null;
  return normalizeAdminProfile(doc.data());
}

function assembleSessionUser(decodedToken, profile, userRecord) {
  const claims = userRecord?.customClaims ?? {};
  const isDisabled = userRecord?.disabled ?? false;

  return {
    uid: decodedToken.uid,
    email: decodedToken.email ?? profile?.email ?? userRecord?.email ?? null,
    displayName: profile?.displayName ?? userRecord?.displayName ?? decodedToken.name ?? decodedToken.email?.split("@")?.[0] ?? "Admin",
    photoURL: profile?.photoURL ?? userRecord?.photoURL ?? decodedToken.picture ?? null,
    role: profile?.role ?? claims.role ?? decodedToken.role ?? CUSTOMER_ROLE,
    status: profile?.status ?? (isDisabled ? "suspend" : "active"),
    plan: profile?.plan ?? claims.plan ?? USER_PLANS.FREE,
    permissions: profile?.permissions ?? [],
    lastLoginAt: decodedToken.auth_time ? new Date(decodedToken.auth_time * 1000).toISOString() : null,
  };
}

export async function verifySessionCookieValue(cookieValue) {
  try {
    const auth = getAdminAuth();
    return await auth.verifySessionCookie(cookieValue, true);
  } catch (error) {
    console.error("verifySessionCookieValue", error);
    return null;
  }
}

export async function createSession(idToken) {
  const auth = getAdminAuth();
  const sessionCookie = await auth.createSessionCookie(idToken, {
    expiresIn: SESSION_MAX_AGE_MS,
  });

  const decoded = await auth.verifySessionCookie(sessionCookie, true);
  const [profile, userRecord] = await Promise.all([fetchAdminProfile(decoded.uid), auth.getUser(decoded.uid)]);

  if (userRecord.disabled) {
    throw new Error("Akun admin ditangguhkan.");
  }

  const sessionUser = assembleSessionUser(decoded, profile, userRecord);

  return {
    cookie: sessionCookie,
    user: sessionUser,
    maxAge: SESSION_MAX_AGE_MS / 1000,
  };
}

export async function commitSessionCookie(value, maxAgeSeconds) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value,
    maxAge: maxAgeSeconds,
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value: "",
    expires: new Date(0),
    path: "/",
  });
}

export const getSessionUser = cache(async () => {
  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!cookieValue) return null;
  return getSessionUserFromCookie(cookieValue);
});

export async function getSessionUserFromCookie(cookieValue) {
  const decoded = await verifySessionCookieValue(cookieValue);
  if (!decoded) return null;
  const auth = getAdminAuth();
  const [profile, userRecord] = await Promise.all([fetchAdminProfile(decoded.uid), auth.getUser(decoded.uid)]);
  if (userRecord.disabled) {
    return null;
  }
  return assembleSessionUser(decoded, profile, userRecord);
}

export async function assertAdminSession(requiredRoles = [ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR, ADMIN_ROLES.SUPER_ADMIN]) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !requiredRoles.includes(sessionUser.role)) {
    return null;
  }
  return sessionUser;
}
