import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";

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
    const body = await request.json().catch(() => null);
    const sha256 = typeof body?.fingerprint?.sha256 === "string" ? body.fingerprint.sha256.trim() : "";
    const size = Number(body?.fingerprint?.size);
    if (!sha256 || !Number.isFinite(size) || size <= 0) {
      return NextResponse.json({ error: "fingerprint.sha256 dan size wajib diisi" }, { status: 400 });
    }

    if (!isNeonConfigured()) {
      return NextResponse.json({ data: null });
    }

    await ensureNeonSchema();
    const sql = getSql();
    const hashPattern = `%${sha256}%`;

    const movieRows = await sql`
      SELECT id, mux_asset_id, mux_playback_id, mux_video_id, thumbnail, trailer, file_hash
      FROM movies
      WHERE file_hash <> '' AND file_hash LIKE ${hashPattern}
      LIMIT 20
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

    const seriesRows = await sql`
      SELECT id, episodes
      FROM series
      WHERE episodes::text LIKE ${hashPattern}
      LIMIT 20
    `;
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
  } catch (error) {
    console.error("POST /api/uploads/lookup", error);
    return NextResponse.json({ error: "Gagal mencari fingerprint." }, { status: 500 });
  }
}
