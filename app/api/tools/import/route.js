import { NextResponse } from "next/server";
import { createMovie, createSeries } from "@/lib/firestoreService";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { ADMIN_ROLES, FIRESTORE_COLLECTIONS } from "@/utils/constants";
import { validateMoviePayload, validateSeriesPayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

const MAX_IMPORT_DOCS = 500;

export async function POST(request) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json();
    // Import metadata konten (legacy)
    if (payload.type === "content") {
      if (!Array.isArray(payload.records)) {
        return NextResponse.json({ error: "Format import tidak valid." }, { status: 400 });
      }
      const results = [];
      for (const record of payload.records) {
        if (!record || typeof record !== "object") {
          results.push({ title: "unknown", status: "failed", message: "Format item tidak valid." });
          continue;
        }
        try {
          const normalizedRecord = {
            ...record,
            mux_playback_id: record.mux_playback_id ?? record.mux_video_id ?? record.mainPlaybackId ?? undefined,
            thumbnail: record.thumbnail ?? record.thumbnailUrl ?? undefined,
            trailer:
              record.trailer ??
              (record.trailerPlaybackId ? `https://stream.mux.com/${record.trailerPlaybackId}.m3u8` : undefined),
          };
          const validation =
            normalizedRecord.type === "series"
              ? validateSeriesPayload(normalizedRecord)
              : validateMoviePayload(normalizedRecord);
          if (!validation.valid) {
            const firstError = Object.values(validation.errors)[0];
            throw new Error(typeof firstError === "string" ? firstError : "Validasi metadata konten gagal.");
          }

          const created = normalizedRecord.type === "series"
            ? await createSeries(normalizedRecord, session)
            : await createMovie(normalizedRecord, session);
          results.push({ id: created.id, status: "success" });
        } catch (error) {
          results.push({ title: record?.title ?? "unknown", status: "failed", message: error.message });
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

    // Import Firestore collections (JSON) - hanya super-admin dan tanpa koleksi users
    if (payload.type === "firestore") {
      if (session.role !== ADMIN_ROLES.SUPER_ADMIN) {
        return NextResponse.json({ error: "Hanya super-admin yang dapat mengimpor Firestore." }, { status: 403 });
      }
      if (!isFirebaseConfigured) {
        return NextResponse.json({ error: "Firebase Admin belum dikonfigurasi untuk import Firestore." }, { status: 400 });
      }
      const { collections, merge = true } = payload;
      if (!collections || typeof collections !== "object") {
        return NextResponse.json({ error: "Payload collections tidak valid." }, { status: 400 });
      }

      const allowed = new Set(
        Object.values(FIRESTORE_COLLECTIONS).filter((col) => col !== FIRESTORE_COLLECTIONS.ADMIN_USERS)
      );
      const operations = [];
      for (const [col, docs] of Object.entries(collections)) {
        if (!allowed.has(col)) continue; // skip koleksi yang tidak dikenal atau sensitif (users)
        if (!Array.isArray(docs)) continue;
        for (const doc of docs) {
          const { id, ...data } = doc || {};
          if (!id || typeof id !== "string" || !data || typeof data !== "object") continue;
          operations.push({ col, id, data });
        }
      }

      if (operations.length > MAX_IMPORT_DOCS) {
        return NextResponse.json(
          { error: `Melebihi batas maksimum ${MAX_IMPORT_DOCS} dokumen per import.`, data: [] },
          { status: 400 }
        );
      }

      const firestore = getFirestoreClient();
      const batch = firestore.batch();
      const summary = [];
      for (const op of operations) {
        const docRef = firestore.collection(op.col).doc(op.id);
        batch.set(docRef, op.data, { merge: Boolean(merge) });
        summary.push({ col: op.col, id: op.id });
      }
      if (operations.length > 0) {
        await batch.commit();
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
