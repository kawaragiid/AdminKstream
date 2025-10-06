import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp } from "@/lib/firebase";
import {
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  commitSessionCookie,
  createSession,
  getSessionUserFromCookie,
  verifySessionCookieValue,
} from "@/lib/session";

export async function POST(request) {
  try {
    const body = await request.json();
    if (!body?.idToken) {
      return NextResponse.json({ error: "Token tidak ditemukan." }, { status: 400 });
    }

    const { cookie, user, maxAge } = await createSession(body.idToken);

    if (!user || !["super-admin", "admin", "editor"].includes(user.role)) {
      return NextResponse.json(
        { error: "Akun tidak memiliki akses ke dashboard admin." },
        { status: 403 }
      );
    }

    await commitSessionCookie(cookie, maxAge);

    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("POST /api/auth/session", error);
    const status = error.message?.includes("ditangguhkan") ? 403 : 500;
    return NextResponse.json({ error: error.message ?? "Gagal membuat sesi." }, { status });
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
    return NextResponse.json({ data: user });
  } catch (error) {
    console.error("GET /api/auth/session", error);
    return NextResponse.json({ error: "Tidak dapat memuat sesi." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies();
    const cookieValue = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    if (cookieValue) {
      const decoded = await verifySessionCookieValue(cookieValue);
      if (decoded) {
        const auth = getAuth(getFirebaseAdminApp());
        await auth.revokeRefreshTokens(decoded.sub ?? decoded.uid);
      }
    }

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/auth/session", error);
    return NextResponse.json({ error: "Gagal menghapus sesi." }, { status: 500 });
  }
}
