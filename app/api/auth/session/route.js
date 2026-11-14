import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase";
import {
  ALLOWED_ADMIN_ROLES,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  commitSessionCookie,
  createSession,
  getSessionUserFromCookie,
  verifySameOrigin,
  verifySessionCookieValue,
} from "@/lib/session";

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 15;
const loginAttemptsByIp = new Map();

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function checkSessionRateLimit(ip) {
  const now = Date.now();
  if (loginAttemptsByIp.size > 500) {
    for (const [key, entry] of loginAttemptsByIp.entries()) {
      if (now >= entry.resetAt) loginAttemptsByIp.delete(key);
    }
  }
  const existing = loginAttemptsByIp.get(ip);
  if (!existing || now >= existing.resetAt) {
    loginAttemptsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (existing.count >= RATE_LIMIT_MAX_ATTEMPTS) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

export async function POST(request) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden origin." }, { status: 403 });
    }

    const rateLimit = checkSessionRateLimit(getClientIp(request));
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Terlalu banyak percobaan login. Coba lagi nanti." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfter) } }
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Format JSON tidak valid." }, { status: 400 });
    }

    if (!body?.idToken || typeof body.idToken !== "string") {
      return NextResponse.json({ error: "Token tidak ditemukan." }, { status: 400 });
    }

    const { cookie, user, maxAge } = await createSession(body.idToken);

    if (!user || !ALLOWED_ADMIN_ROLES.includes(user.role)) {
      return NextResponse.json(
        { error: "Akun tidak memiliki akses ke dashboard admin." },
        { status: 403 }
      );
    }

    await commitSessionCookie(cookie, maxAge);

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("POST /api/auth/session", error);
    const isForbidden = error?.statusCode === 403 || error.message?.includes("ditangguhkan");
    const isAuthError = typeof error?.code === "string" && error.code.startsWith("auth/");
    return NextResponse.json(
      {
        error: isForbidden
          ? error.message || "Akun tidak memiliki akses."
          : isAuthError
          ? "Token sesi tidak valid atau kedaluwarsa."
          : "Gagal membuat sesi.",
      },
      { status: isForbidden ? 403 : isAuthError ? 401 : 500 }
    );
  }
}

export async function GET() {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (!cookieValue) {
      return NextResponse.json({ data: null });
    }

    const user = await getSessionUserFromCookie(cookieValue);
    if (!user) {
      const response = NextResponse.json({ data: null });
      response.cookies.set({
        name: SESSION_COOKIE_NAME,
        value: "",
        expires: new Date(0),
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
      return response;
    }
    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("GET /api/auth/session", error);
    return NextResponse.json({ error: "Tidak dapat memuat sesi." }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden origin." }, { status: 403 });
    }

    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (cookieValue) {
      const decoded = await verifySessionCookieValue(cookieValue);
      if (decoded?.uid) {
        const app = getFirebaseAdminApp();
        if (app) {
          await getAuth(app)
            .revokeRefreshTokens(decoded.uid)
            .catch((err) => console.warn("DELETE /api/auth/session revokeRefreshTokens failed:", err?.message || err));
        }
      }
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/auth/session", error);
    return NextResponse.json({ error: "Gagal menghapus sesi." }, { status: 500 });
  }
}
