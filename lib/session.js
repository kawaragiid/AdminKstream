import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "./firebase";
import { ensureNeonSchema, getSql, isNeonConfigured } from "./neonDb";
import { ADMIN_ROLES, USER_PLANS } from "@/utils/constants";

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
    isActive: data.isActive !== undefined ? Boolean(data.isActive) : true,
    expiresAt: data.expiresAt ?? null,
    permissions: data.permissions ?? [],
    photoURL: data.photoUrl ?? data.photoURL ?? null,
  };
}

async function fetchAdminProfile(uid) {
  if (!isNeonConfigured()) {
    return null;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT email, display_name, role, plan, is_active, expires_at, data
    FROM users
    WHERE uid = ${uid}
    LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return normalizeAdminProfile({
    ...(row.data || {}),
    email: row.email || row.data?.email,
    displayName: row.display_name || row.data?.displayName,
    role: row.role || row.data?.role,
    plan: row.plan || row.data?.plan,
    isActive: row.is_active !== false,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.data?.expiresAt ?? null,
    status: row.data?.status ?? "active",
  });
}

function assembleSessionUser(decodedToken, profile, userRecord) {
  const claims = userRecord?.customClaims ?? {};
  const isDisabled = userRecord?.disabled ?? false;
  // Prioritaskan role dari database (Neon) di atas customClaims agar pencabutan role segera efektif
  const resolvedRole = profile?.role ?? claims.role ?? decodedToken.role ?? null;

  return {
    uid: decodedToken.uid,
    email: decodedToken.email ?? profile?.email ?? userRecord?.email ?? null,
    displayName: profile?.displayName ?? userRecord?.displayName ?? decodedToken.name ?? decodedToken.email?.split("@")?.[0] ?? "Admin",
    photoURL: profile?.photoURL ?? userRecord?.photoURL ?? decodedToken.picture ?? null,
    role: resolvedRole,
    status: profile?.status ?? (isDisabled ? "suspend" : "active"),
    plan: profile?.plan ?? claims.plan ?? USER_PLANS.FREE,
    isActive: profile?.isActive ?? true,
    expiresAt: profile?.expiresAt ?? null,
    permissions: profile?.permissions ?? [],
    lastLoginAt: decodedToken.auth_time ? new Date(decodedToken.auth_time * 1000).toISOString() : null,
  };
}

function isAccountExpired(expiresAt) {
  if (!expiresAt) return false;
  const ms = new Date(expiresAt).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
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
  const [profile, userRecord] = await Promise.all([
    fetchAdminProfile(decoded.uid),
    auth.getUser(decoded.uid),
  ]);

  if (!userRecord.emailVerified && !decoded.email_verified) {
    const err = new Error("Email akun belum terverifikasi.");
    err.statusCode = 403;
    throw err;
  }

  const sessionUser = assembleSessionUser(decoded, profile, userRecord);

  if (userRecord.disabled || sessionUser.status === "suspend" || sessionUser.isActive === false) {
    const err = new Error("Akun admin sedang ditangguhkan atau dinonaktifkan.");
    err.statusCode = 403;
    throw err;
  }

  if (isAccountExpired(sessionUser.expiresAt)) {
    const err = new Error("Masa aktif akun admin telah berakhir.");
    err.statusCode = 403;
    throw err;
  }

  if (!sessionUser.role || !ALLOWED_ADMIN_ROLES.includes(sessionUser.role)) {
    const err = new Error("Akun tidak memiliki akses ke dashboard admin.");
    err.statusCode = 403;
    throw err;
  }

  return {
    cookie: sessionCookie,
    user: sessionUser,
    maxAge: SESSION_MAX_AGE_MS / 1000,
  };
}

function isSecureCookieEnvironment() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
}

export async function commitSessionCookie(value, maxAgeSeconds) {
  const cookieStore = await cookies();
  cookieStore.set({
    name: SESSION_COOKIE_NAME,
    value,
    maxAge: maxAgeSeconds,
    httpOnly: true,
    secure: isSecureCookieEnvironment(),
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
    httpOnly: true,
    secure: isSecureCookieEnvironment(),
    sameSite: "lax",
    path: "/",
  });
}

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function getAllowedHosts() {
  const hosts = new Set();
  for (const envUrl of [
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.ADMIN_PUBLIC_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.APP_URL,
  ]) {
    if (!envUrl) continue;
    try {
      hosts.add(new URL(envUrl).host.toLowerCase());
    } catch {
      // Abaikan URL env yang tidak valid
    }
  }
  if (process.env.VERCEL_URL) hosts.add(process.env.VERCEL_URL.toLowerCase());
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    hosts.add(process.env.VERCEL_PROJECT_PRODUCTION_URL.toLowerCase());
  }
  return hosts;
}

export function verifySameOrigin(request) {
  const originHeader = request.headers.get("origin");
  const refererHeader = request.headers.get("referer");
  const expectedOrigin = request.nextUrl?.origin;
  const rawHost = request.headers.get("host");
  const forwardedHost = request.headers.get("x-forwarded-host");
  const allowedHosts = getAllowedHosts();
  const trustedForwardedHost =
    forwardedHost &&
    ((rawHost && forwardedHost.toLowerCase() === rawHost.toLowerCase()) ||
      allowedHosts.has(forwardedHost.toLowerCase()))
      ? forwardedHost
      : null;
  const hostHeader = trustedForwardedHost || rawHost;
  const protoHeader = request.headers.get("x-forwarded-proto") || (expectedOrigin?.startsWith("https:") ? "https" : "http");
  const allowedOrigins = new Set();
  if (expectedOrigin) allowedOrigins.add(expectedOrigin);
  if (hostHeader) allowedOrigins.add(`${protoHeader}://${hostHeader}`);
  if (process.env.NEXT_PUBLIC_APP_URL) {
    try {
      allowedOrigins.add(new URL(process.env.NEXT_PUBLIC_APP_URL).origin);
    } catch {
      // Abaikan URL env yang tidak valid
    }
  }

  if (originHeader) {
    return allowedOrigins.has(originHeader);
  }
  if (refererHeader) {
    try {
      return allowedOrigins.has(new URL(refererHeader).origin);
    } catch {
      return false;
    }
  }

  const method = String(request.method || "GET").toUpperCase();
  if (STATE_CHANGING_METHODS.has(method)) {
    return false;
  }
  return true;
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

  let profile = null;
  let userRecord = null;
  try {
    const auth = getAdminAuth();
    [profile, userRecord] = await Promise.all([
      fetchAdminProfile(decoded.uid),
      auth.getUser(decoded.uid),
    ]);
  } catch (error) {
    console.warn("getSessionUserFromCookie verification failed:", error?.code || error?.message || error);
    return null;
  }

  if (!userRecord || userRecord.disabled) {
    return null;
  }
  if (!userRecord.emailVerified && !decoded.email_verified) {
    return null;
  }
  const sessionUser = assembleSessionUser(decoded, profile, userRecord);
  if (
    !sessionUser.role ||
    !ALLOWED_ADMIN_ROLES.includes(sessionUser.role) ||
    sessionUser.status === "suspend" ||
    sessionUser.isActive === false ||
    isAccountExpired(sessionUser.expiresAt)
  ) {
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
