import { NextResponse } from "next/server";
import { listAllMedia } from "@/lib/firestoreService";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";
import { fetchAnalyticsSummary } from "@/lib/analyticsService";
import { listUsers } from "@/lib/usersService";
import { requireRole } from "@/lib/session";
import { ADMIN_ROLES } from "@/utils/constants";

const ALLOWED_DATABASE_TABLES = new Set([
  "movies",
  "series",
  "platform_settings",
  "users",
  "analytics_snapshots",
  "audit_logs",
  "notifications",
]);

function escapeCsvCell(value) {
  if (value === null || value === undefined) return '""';
  const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
  // Netralisir formula injection (CWE-1236) dengan awalan petik tunggal.
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCsv(records) {
  if (!records?.length) return "";
  const headers = Object.keys(records[0]);
  const rows = records.map((record) =>
    headers.map((header) => escapeCsvCell(record[header])).join(",")
  );
  return [headers.map(escapeCsvCell).join(","), ...rows].join("\n");
}

export async function GET(request) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const type = searchParams.get("type") ?? "content";
  const format = searchParams.get("format") ?? "csv";

  try {
    if (type === "content") {
      const data = await listAllMedia();
      if (format === "json") {
        return NextResponse.json({ data });
      }
      const csv = toCsv(
        data.map(({ id, title, category, status, views, createdAt }) => ({
          id,
          title,
          category,
          status,
          views,
          createdAt,
        }))
      );
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=content-export.csv",
        },
      });
    }

    if (type === "users") {
      if (session.role !== ADMIN_ROLES.SUPER_ADMIN) {
        return NextResponse.json({ error: "Hanya super-admin yang dapat mengekspor data pengguna." }, { status: 403 });
      }
      const { users } = await listUsers({ limit: 1000 });
      if (format === "json") {
        return NextResponse.json({ data: users });
      }
      const csv = toCsv(
        users.map(({ uid, email, role, plan, disabled, metadata }) => ({
          uid,
          email,
          role,
          plan,
          disabled,
          createdAt: metadata?.creationTime,
          lastSignInAt: metadata?.lastSignInTime,
        }))
      );
      return new NextResponse(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": "attachment; filename=users-export.csv",
        },
      });
    }

    if (type === "database" || type === "firestore") {
      if (session.role !== ADMIN_ROLES.SUPER_ADMIN) {
        return NextResponse.json({ error: "Hanya super-admin yang dapat mengekspor database." }, { status: 403 });
      }
      if (!isNeonConfigured()) {
        return NextResponse.json({ error: "Database Neon belum dikonfigurasi untuk export." }, { status: 400 });
      }

      const raw = searchParams.get("tables") ?? searchParams.get("collections") ?? "";
      const reqTables = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && ALLOWED_DATABASE_TABLES.has(s));

      const tables = reqTables.length ? reqTables : Array.from(ALLOWED_DATABASE_TABLES);

      await ensureNeonSchema();
      const sql = getSql();
      const result = {};
      if (tables.includes("movies")) {
        result.movies = await sql`SELECT * FROM movies ORDER BY created_at DESC`;
      }
      if (tables.includes("series")) {
        result.series = await sql`SELECT * FROM series ORDER BY created_at DESC`;
      }
      if (tables.includes("platform_settings")) {
        result.platform_settings = await sql`SELECT * FROM platform_settings ORDER BY id ASC`;
      }
      if (tables.includes("users")) {
        result.users = await sql`SELECT * FROM users ORDER BY updated_at DESC`;
      }
      if (tables.includes("analytics_snapshots")) {
        result.analytics_snapshots = await sql`SELECT * FROM analytics_snapshots ORDER BY id ASC`;
      }
      if (tables.includes("audit_logs")) {
        result.audit_logs = await sql`SELECT * FROM audit_logs ORDER BY created_at DESC`;
      }
      if (tables.includes("notifications")) {
        result.notifications = await sql`SELECT * FROM notifications ORDER BY created_at DESC`;
      }

      const body = JSON.stringify({ exportedAt: new Date().toISOString(), tables: result }, null, 2);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=database-export.json",
        },
      });
    }

    if (type === "analytics") {
      const summary = await fetchAnalyticsSummary();
      return NextResponse.json({ data: summary });
    }

    return NextResponse.json({ error: "Tipe export tidak dikenal." }, { status: 400 });
  } catch (error) {
    console.error("GET /api/tools/export", error);
    return NextResponse.json({ error: "Gagal melakukan export." }, { status: 500 });
  }
}
