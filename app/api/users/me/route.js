import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { requireRole } from "@/lib/session";
import { getFirebaseAdminApp } from "@/lib/firebase";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";

function sanitizePhotoUrl(value) {
  if (!value) return null;
  try {
    const parsed = new URL(String(value).trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export async function GET() {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;
  if (!isNeonConfigured()) {
    return NextResponse.json({ data: session });
  }

  try {
    await ensureNeonSchema();
    const sql = getSql();
    const rows = await sql`SELECT display_name, data FROM users WHERE uid = ${session.uid} LIMIT 1`;
    const row = rows[0] || {};
    const data = row.data && typeof row.data === "object" ? row.data : {};

    return NextResponse.json({
      data: {
        displayName: row.display_name || data.displayName || session.displayName,
        photoURL: data.photoURL ?? data.photoUrl ?? session.photoURL ?? null,
        tagline: data.tagline ?? null,
      },
    });
  } catch (error) {
    console.error("GET /api/users/me", error);
    return NextResponse.json({ error: "Gagal memuat profil pengguna." }, { status: 500 });
  }
}

export async function PUT(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
    }

    const displayName = typeof body.displayName === "string" ? body.displayName.trim().slice(0, 100) : "";
    if (!displayName) {
      return NextResponse.json({ error: "Nama tampilan wajib diisi." }, { status: 400 });
    }

    const rawPhoto = body.photoURL;
    const isClearingPhoto = rawPhoto === null || rawPhoto === "";
    const photoURL = isClearingPhoto ? null : sanitizePhotoUrl(rawPhoto);
    if (!isClearingPhoto && !photoURL) {
      return NextResponse.json({ error: "URL foto profil tidak valid." }, { status: 400 });
    }

    const hasTagline = body.tagline !== undefined;
    const tagline = typeof body.tagline === "string" ? body.tagline.trim().slice(0, 200) || null : null;

    if (!isNeonConfigured()) {
      return NextResponse.json({
        data: { displayName, photoURL, ...(hasTagline ? { tagline } : {}) },
      });
    }

    await ensureNeonSchema();
    const sql = getSql();
    const existingRows = await sql`
      SELECT email, role, plan, is_active, data FROM users WHERE uid = ${session.uid} LIMIT 1
    `;
    const existingRow = existingRows[0] || {};
    const existingData = existingRow.data && typeof existingRow.data === "object" ? existingRow.data : {};
    const nextData = {
      ...existingData,
      displayName,
      photoURL: photoURL ?? null,
      photoUrl: photoURL ?? null,
      ...(hasTagline ? { tagline } : {}),
    };

    await sql`
      INSERT INTO users (uid, email, display_name, role, plan, is_active, data, updated_at)
      VALUES (
        ${session.uid},
        ${existingRow.email || session.email || ""},
        ${displayName},
        ${existingRow.role || session.role || "admin"},
        ${existingRow.plan || session.plan || "free"},
        ${existingRow.is_active ?? true},
        ${JSON.stringify(nextData)}::jsonb,
        NOW()
      )
      ON CONFLICT (uid) DO UPDATE SET
        display_name = EXCLUDED.display_name,
        data = EXCLUDED.data,
        updated_at = NOW()
    `;

    const app = getFirebaseAdminApp();
    if (app) {
      try {
        await getAuth(app).updateUser(session.uid, {
          displayName,
          photoURL: photoURL ?? null,
        });
      } catch (fbError) {
        console.warn("[PUT /api/users/me] Firebase updateUser failed:", fbError?.message || fbError);
      }
    }

    return NextResponse.json({
      data: {
        displayName,
        photoURL,
        ...(nextData.tagline !== undefined ? { tagline: nextData.tagline } : {}),
      },
    });
  } catch (error) {
    console.error("PUT /api/users/me", error);
    return NextResponse.json({ error: error.message || "Gagal memperbarui profil." }, { status: 500 });
  }
}
