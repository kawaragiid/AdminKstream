import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

function matchesFingerprint(rawHash, sha256, size) {
  if (!rawHash) return false;
  if (typeof rawHash === "object") {
    return rawHash.sha256 === sha256 && Number(rawHash.size) === size;
  }
  const str = String(rawHash).trim();
  if (!str) return false;
  if (str === sha256) return true;
  try {
    const parsed = JSON.parse(str);
    return parsed?.sha256 === sha256 && Number(parsed?.size) === size;
  } catch {
    return false;
  }
}

export async function POST(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const body = await request.json();
    const sha256 = body?.fingerprint?.sha256;
    const size = Number(body?.fingerprint?.size);
    if (!sha256 || !size) {
      return NextResponse.json({ error: "fingerprint.sha256 dan size wajib diisi" }, { status: 400 });
    }

    // 1. Cek di Neon Postgres terlebih dahulu (database utama)
    if (isNeonConfigured()) {
      await ensureNeonSchema();
      const sql = getSql();

      const movieRows = await sql`
        SELECT id, mux_asset_id, mux_playback_id, mux_video_id, thumbnail, trailer, file_hash
        FROM movies
        WHERE file_hash <> ''
      `;
      const matchedMovie = movieRows.find((row) => matchesFingerprint(row.file_hash, sha256, size));
      if (matchedMovie && (matchedMovie.mux_playback_id || matchedMovie.mux_video_id)) {
        return NextResponse.json({
          data: {
            type: "movie",
            id: matchedMovie.id,
            mux_asset_id: matchedMovie.mux_asset_id || null,
            mux_playback_id: matchedMovie.mux_playback_id || matchedMovie.mux_video_id || null,
            thumbnail: matchedMovie.thumbnail || null,
            trailer: matchedMovie.trailer || null,
          },
        });
      }

      const seriesRows = await sql`SELECT id, episodes FROM series`;
      for (const row of seriesRows) {
        const episodes = Array.isArray(row.episodes) ? row.episodes : [];
        const match = episodes.find(
          (ep) => matchesFingerprint(ep?.fileHash, sha256, size) && (ep?.mux_playback_id || ep?.mux_video_id)
        );
        if (match) {
          return NextResponse.json({
            data: {
              type: "episode",
              seriesId: row.id,
              episodeId: match.episodeId,
              mux_asset_id: match.mux_asset_id || null,
              mux_playback_id: match.mux_playback_id || match.mux_video_id || null,
              thumbnail: match.thumbnail || null,
              trailer: match.trailer || null,
            },
          });
        }
      }

      return NextResponse.json({ data: null });
    }

    // 2. Fallback ke Firestore jika Neon belum dikonfigurasi
    if (!isFirebaseConfigured) {
      return NextResponse.json({ data: null });
    }

    const firestore = getFirestoreClient();

    const moviesSnap = await firestore
      .collection(FIRESTORE_COLLECTIONS.MOVIES)
      .where("fileHash.sha256", "==", sha256)
      .where("fileHash.size", "==", size)
      .limit(1)
      .get();

    if (!moviesSnap.empty) {
      const doc = moviesSnap.docs[0];
      const d = doc.data();
      return NextResponse.json({
        data: {
          type: "movie",
          id: doc.id,
          mux_asset_id: d.mux_asset_id ?? null,
          mux_playback_id: d.mux_playback_id ?? d.mux_video_id ?? null,
          thumbnail: d.thumbnail ?? null,
          trailer: d.trailer ?? null,
        },
      });
    }

    const seriesSnap = await firestore.collection(FIRESTORE_COLLECTIONS.SERIES).get();
    for (const doc of seriesSnap.docs) {
      const d = doc.data();
      const episodes = Array.isArray(d.episodes) ? d.episodes : [];
      const match = episodes.find((ep) => ep?.fileHash?.sha256 === sha256 && Number(ep?.fileHash?.size) === size);
      if (match) {
        return NextResponse.json({
          data: {
            type: "episode",
            seriesId: doc.id,
            episodeId: match.episodeId,
            mux_asset_id: match.mux_asset_id ?? null,
            mux_playback_id: match.mux_playback_id ?? match.mux_video_id ?? null,
            thumbnail: match.thumbnail ?? null,
            trailer: match.trailer ?? null,
          },
        });
      }
    }

    return NextResponse.json({ data: null });
  } catch (error) {
    console.error("POST /api/uploads/lookup", error);
    return NextResponse.json({ error: "Gagal mencari fingerprint." }, { status: 500 });
  }
}
