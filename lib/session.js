import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, getFirestoreClient, isFirebaseConfigured } from "./firebase";
import { FIRESTORE_COLLECTIONS, ADMIN_ROLES, USER_PLANS } from "@/utils/constants";

export const SESSION_COOKIE_NAME = "adminkstream_session";
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 5; // 5 hari
export const ALLOWED_ADMIN_ROLES = [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR];

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
  const resolvedRole = claims.role ?? profile?.role ?? decodedToken.role ?? null;

  return {
    uid: decodedToken.uid,
    email: decodedToken.email ?? profile?.email ?? userRecord?.email ?? null,
    displayName: profile?.displayName ?? userRecord?.displayName ?? decodedToken.name ?? decodedToken.email?.split("@")?.[0] ?? "Admin",
    photoURL: profile?.photoURL ?? userRecord?.photoURL ?? decodedToken.picture ?? null,
    role: resolvedRole,
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
  const sessionUser = assembleSessionUser(decoded, profile, userRecord);

  if (userRecord.disabled || sessionUser.status === "suspend") {
    const err = new Error("Akun admin sedang ditangguhkan.");
    err.statusCode = 403;
    throw err;
  }

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
    secure: process.env.NODE_ENV === "production",
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
  const sessionUser = assembleSessionUser(decoded, profile, userRecord);
  if (!sessionUser.role || !ALLOWED_ADMIN_ROLES.includes(sessionUser.role) || sessionUser.status === "suspend") {
    return null;
  }
  return sessionUser;
}

export async function assertAdminSession(requiredRoles = ALLOWED_ADMIN_ROLES) {
  const sessionUser = await getSessionUser();
  if (!sessionUser || !requiredRoles.includes(sessionUser.role)) {
    return null;
  }
  return sessionUser;
}

export async function requireRole(requiredRoles = ALLOWED_ADMIN_ROLES) {
  const session = await getSessionUser();
  if (!session) {
    return {
      session: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!requiredRoles.includes(session.role)) {
    return {
      session: null,
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, error: null };
}
