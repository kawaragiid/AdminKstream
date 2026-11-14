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
}

export async function PUT(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;
  try {
    const body = await request.json();
    const displayName = typeof body?.displayName === "string" ? body.displayName.trim().slice(0, 100) || null : null;
    const photoURL = body?.photoURL ? sanitizePhotoUrl(body.photoURL) : null;
    if (body?.photoURL && !photoURL) {
      return NextResponse.json({ error: "URL foto profil tidak valid." }, { status: 400 });
    }
    const hasTagline = body?.tagline !== undefined;
    const tagline = typeof body?.tagline === "string" ? body.tagline.trim().slice(0, 200) || null : null;

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
      displayName: displayName ?? "",
      photoURL: photoURL ?? null,
      photoUrl: photoURL ?? null,
      ...(hasTagline ? { tagline } : {}),
    };

    await sql`
      INSERT INTO users (uid, email, display_name, role, plan, is_active, data, updated_at)
      VALUES (
        ${session.uid},
        ${existingRow.email || session.email || ""},
        ${displayName || ""},
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
      await getAuth(app)
        .updateUser(session.uid, {
          displayName,
          ...(photoURL ? { photoURL } : {}),
        })
        .catch(() => {});
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

