import { NextResponse } from "next/server";
import { createMovie, createSeries } from "@/lib/firestoreService";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    // Import metadata konten (legacy)
    if (payload.type === "content") {
      if (!Array.isArray(payload.records)) {
        return NextResponse.json({ error: "Format import tidak valid." }, { status: 400 });
      }
      const results = [];
      for (const record of payload.records) {
        try {
          const created = record?.type === 'series'
            ? await createSeries(record, session)
            : await createMovie(record, session);
          results.push({ id: created.id, status: "success" });
        } catch (error) {
          results.push({ title: record.title, status: "failed", message: error.message });
        }
      }
      await recordAuditLog({
        actor: session,
        action: "tools.import.content",
        targetType: "content",
        metadata: { count: results.length },
      });
      return NextResponse.json({ data: results });
    }

    // Import Firestore collections (JSON)
    if (payload.type === "firestore") {
      if (!isFirebaseConfigured) {
        return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi untuk import Firestore." }, { status: 400 });
      }
      const { collections, merge = true } = payload;
      if (!collections || typeof collections !== 'object') {
        return NextResponse.json({ error: "Payload collections tidak valid." }, { status: 400 });
      }

      const allowed = new Set(Object.values(FIRESTORE_COLLECTIONS));
      const firestore = getFirestoreClient();
      const summary = [];
      for (const [col, docs] of Object.entries(collections)) {
        if (!allowed.has(col)) continue; // skip koleksi yang tidak dikenal
        if (!Array.isArray(docs)) continue;
        for (const doc of docs) {
          const { id, ...data } = doc || {};
          if (!id || !data) continue;
          await firestore.collection(col).doc(id).set(data, { merge });
          summary.push({ col, id });
        }
      }
      await recordAuditLog({
        actor: session,
        action: "tools.import.firestore",
        targetType: "firestore",
        metadata: { count: summary.length },
      });
      return NextResponse.json({ data: summary });
    }

    return NextResponse.json({ error: "Tipe import tidak dikenal." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/tools/import", error);
    return NextResponse.json({ error: "Gagal melakukan import." }, { status: 500 });
  }
}
