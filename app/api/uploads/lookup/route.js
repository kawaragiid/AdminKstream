import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";
import { getFirestoreClient, isFirebaseConfigured } from "@/lib/firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await request.json();
    const sha256 = body?.fingerprint?.sha256;
    const size = Number(body?.fingerprint?.size);
    if (!sha256 || !size) {
      return NextResponse.json({ error: "fingerprint.sha256 dan size wajib diisi" }, { status: 400 });
    }

    if (!isFirebaseConfigured) {
      return NextResponse.json({ data: null });
    }

    const firestore = getFirestoreClient();

    // Cari di movies dengan where pada nested field
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

    // Cari di series (episodes adalah array; perlu scan manual)
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

