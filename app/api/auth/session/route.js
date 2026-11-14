import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ALLOWED_ADMIN_ROLES,
  SESSION_COOKIE_NAME,
  clearSessionCookie,
  commitSessionCookie,
  createSession,
  getSessionUserFromCookie,
  verifySameOrigin,
} from "@/lib/session";

export async function POST(request) {
  try {
    if (!verifySameOrigin(request)) {
      return NextResponse.json({ error: "Forbidden origin." }, { status: 403 });
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

    await clearSessionCookie();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/auth/session", error);
    return NextResponse.json({ error: "Gagal menghapus sesi." }, { status: 500 });
  }
}
