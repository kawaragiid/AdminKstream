import { NextResponse } from "next/server";
import { listAllMedia } from "@/lib/firestoreService";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";
import { fetchAnalyticsSummary } from "@/lib/analyticsService";
import { listUsers } from "@/lib/usersService";
import { getSessionUser } from "@/lib/session";

function toCsv(records) {
  if (!records?.length) return "";
  const headers = Object.keys(records[0]);
  const rows = records.map((record) =>
    headers
      .map((header) => {
        const value = record[header];
        if (value === null || value === undefined) return "";
        if (typeof value === "object") {
          return JSON.stringify(value).replace(/"/g, '""');
        }
        return String(value).replace(/"/g, '""');
      })
      .join(",")
  );
  return [headers.join(","), ...rows].join("\n");
}

export async function GET(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

    if (type === "firestore") {
      if (!isFirebaseConfigured) {
        return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi untuk export Firestore." }, { status: 400 });
      }

      const allowed = new Set(Object.values(FIRESTORE_COLLECTIONS));
      const raw = searchParams.get("collections") ?? "";
      const reqCols = raw
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s && allowed.has(s));

      const collections = reqCols.length ? reqCols : [
        FIRESTORE_COLLECTIONS.MOVIES,
        FIRESTORE_COLLECTIONS.SERIES,
        FIRESTORE_COLLECTIONS.ADMIN_USERS,
        FIRESTORE_COLLECTIONS.SETTINGS,
      ];

      const firestore = getFirestoreClient();
      const result = {};
      for (const col of collections) {
        const snap = await firestore.collection(col).get();
        result[col] = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      }

      const body = JSON.stringify({ exportedAt: new Date().toISOString(), collections: result }, null, 2);
      return new NextResponse(body, {
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Content-Disposition": "attachment; filename=firestore-export.json",
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
