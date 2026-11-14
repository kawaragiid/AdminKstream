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
  const safe = /^\s*[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
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

async function queryTableRows(sql, table) {
  switch (table) {
    case "movies":
      return sql`SELECT * FROM movies ORDER BY created_at DESC LIMIT 5000`;
    case "series":
      return sql`SELECT * FROM series ORDER BY created_at DESC LIMIT 5000`;
    case "platform_settings":
      return sql`SELECT * FROM platform_settings ORDER BY id ASC LIMIT 1000`;
    case "users":
      return sql`SELECT * FROM users ORDER BY updated_at DESC LIMIT 5000`;
    case "analytics_snapshots":
      return sql`SELECT * FROM analytics_snapshots ORDER BY id ASC LIMIT 1000`;
    case "audit_logs":
      return sql`SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 5000`;
    case "notifications":
      return sql`SELECT * FROM notifications ORDER BY created_at DESC LIMIT 5000`;
    default:
      return [];
  }
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
        data.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          category: item.category,
          status: item.status ?? (item.type === "movie" ? "Published" : "Ongoing"),
          views: item.views ?? 0,
          createdAt: item.createdAt,
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
        return NextResponse.json(
          { error: "Hanya super-admin yang dapat mengekspor data pengguna." },
          { status: 403 }
        );
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
        return NextResponse.json(
          { error: "Hanya super-admin yang dapat mengekspor database." },
          { status: 403 }
        );
      }
      if (!isNeonConfigured()) {
        return NextResponse.json(
          { error: "Database Neon belum dikonfigurasi untuk export." },
          { status: 400 }
        );
      }

      const raw = searchParams.get("tables") ?? searchParams.get("collections") ?? "";
      const reqTables = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && ALLOWED_DATABASE_TABLES.has(s));

      const tables = reqTables.length ? reqTables : Array.from(ALLOWED_DATABASE_TABLES);

      await ensureNeonSchema();
      const sql = getSql();
      const encoder = new TextEncoder();

      const stream = new ReadableStream({
        async start(controller) {
          try {
            controller.enqueue(
              encoder.encode(`{"exportedAt":${JSON.stringify(new Date().toISOString())},"tables":{`)
            );
            for (let i = 0; i < tables.length; i += 1) {
              const table = tables[i];
              const rows = await queryTableRows(sql, table);
              const prefix = i > 0 ? "," : "";
              controller.enqueue(encoder.encode(`${prefix}${JSON.stringify(table)}:${JSON.stringify(rows)}`));
            }
            controller.enqueue(encoder.encode("}}"));
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });

      return new Response(stream, {
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
