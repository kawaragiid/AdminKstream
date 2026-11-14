import { NextResponse } from "next/server";
import { createMovie, createSeries } from "@/lib/firestoreService";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";
import { ADMIN_ROLES } from "@/utils/constants";
import { validateMoviePayload, validateSeriesPayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

const MAX_IMPORT_DOCS = 500;
const ALLOWED_DATABASE_TABLES = new Set(["movies", "series", "platform_settings"]);

function serializeHashValue(value) {
  if (typeof value === "string") return value;
  return value ? JSON.stringify(value) : "";
}

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

    // Import Neon Postgres tables (JSON) - hanya super-admin
    if (payload.type === "database" || payload.type === "firestore") {
      if (session.role !== ADMIN_ROLES.SUPER_ADMIN) {
        return NextResponse.json({ error: "Hanya super-admin yang dapat mengimpor database." }, { status: 403 });
      }
      if (!isNeonConfigured()) {
        return NextResponse.json({ error: "Database Neon belum dikonfigurasi untuk import." }, { status: 400 });
      }
      const tables = payload.tables ?? payload.collections;
      const merge = payload.merge !== false;
      if (!tables || typeof tables !== "object") {
        return NextResponse.json({ error: "Payload tables tidak valid." }, { status: 400 });
      }

      const operations = [];
      for (const [table, rows] of Object.entries(tables)) {
        if (!ALLOWED_DATABASE_TABLES.has(table)) continue;
        if (!Array.isArray(rows)) continue;
        for (const row of rows) {
          if (!row || typeof row !== "object" || !row.id || typeof row.id !== "string") continue;
          operations.push({ table, row });
        }
      }

      if (operations.length > MAX_IMPORT_DOCS) {
        return NextResponse.json(
          { error: `Melebihi batas maksimum ${MAX_IMPORT_DOCS} baris per import.`, data: [] },
          { status: 400 }
        );
      }

      await ensureNeonSchema();
      const sql = getSql();
      const summary = [];

      for (const { table, row } of operations) {
        if (table === "movies") {
          const slug = row.slug || `${row.id}`;
          const createdAt = row.created_at ?? row.createdAt ?? new Date().toISOString();
          const updatedAt = row.updated_at ?? row.updatedAt ?? new Date().toISOString();
          if (merge) {
            await sql`
              INSERT INTO movies (
                id, type, title, slug, description, category,
                mux_asset_id, mux_playback_id, mux_video_id, thumbnail, backdrop_url, trailer,
                duration, release_year, maturity_rating, genres, cast_members, director, country, language,
                subtitles, tags, views, featured, rating, orientation, file_hash, created_by, created_at, updated_at
              ) VALUES (
                ${row.id}, ${row.type || "movie"}, ${row.title || "Untitled"}, ${slug}, ${row.description || ""}, ${row.category || ""},
                ${row.mux_asset_id || ""}, ${row.mux_playback_id || ""}, ${row.mux_video_id || ""},
                ${row.thumbnail || ""}, ${row.backdrop_url ?? row.backdropUrl ?? ""}, ${row.trailer || ""},
                ${Number(row.duration) || 0}, ${row.release_year ?? row.releaseYear ?? null}, ${row.maturity_rating ?? row.maturityRating ?? ""},
                ${JSON.stringify(row.genres || [])}::jsonb, ${JSON.stringify(row.cast_members ?? row.cast ?? [])}::jsonb,
                ${row.director || ""}, ${row.country || ""}, ${row.language || ""},
                ${JSON.stringify(row.subtitles || [])}::jsonb, ${JSON.stringify(row.tags || [])}::jsonb,
                ${Number(row.views) || 0}, ${Boolean(row.featured)}, ${row.rating != null ? Number(row.rating) : null},
                ${row.orientation || "landscape"}, ${serializeHashValue(row.file_hash ?? row.fileHash)},
                ${row.created_by || row.createdBy ? JSON.stringify(row.created_by ?? row.createdBy) : null}::jsonb,
                ${createdAt}, ${updatedAt}
              )
              ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type,
                title = EXCLUDED.title,
                slug = EXCLUDED.slug,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                mux_asset_id = EXCLUDED.mux_asset_id,
                mux_playback_id = EXCLUDED.mux_playback_id,
                mux_video_id = EXCLUDED.mux_video_id,
                thumbnail = EXCLUDED.thumbnail,
                backdrop_url = EXCLUDED.backdrop_url,
                trailer = EXCLUDED.trailer,
                duration = EXCLUDED.duration,
                release_year = EXCLUDED.release_year,
                maturity_rating = EXCLUDED.maturity_rating,
                genres = EXCLUDED.genres,
                cast_members = EXCLUDED.cast_members,
                director = EXCLUDED.director,
                country = EXCLUDED.country,
                language = EXCLUDED.language,
                subtitles = EXCLUDED.subtitles,
                tags = EXCLUDED.tags,
                views = EXCLUDED.views,
                featured = EXCLUDED.featured,
                rating = EXCLUDED.rating,
                orientation = EXCLUDED.orientation,
                file_hash = EXCLUDED.file_hash,
                updated_at = NOW()
            `;
          } else {
            await sql`
              INSERT INTO movies (
                id, type, title, slug, description, category,
                mux_asset_id, mux_playback_id, mux_video_id, thumbnail, backdrop_url, trailer,
                duration, release_year, maturity_rating, genres, cast_members, director, country, language,
                subtitles, tags, views, featured, rating, orientation, file_hash, created_by, created_at, updated_at
              ) VALUES (
                ${row.id}, ${row.type || "movie"}, ${row.title || "Untitled"}, ${slug}, ${row.description || ""}, ${row.category || ""},
                ${row.mux_asset_id || ""}, ${row.mux_playback_id || ""}, ${row.mux_video_id || ""},
                ${row.thumbnail || ""}, ${row.backdrop_url ?? row.backdropUrl ?? ""}, ${row.trailer || ""},
                ${Number(row.duration) || 0}, ${row.release_year ?? row.releaseYear ?? null}, ${row.maturity_rating ?? row.maturityRating ?? ""},
                ${JSON.stringify(row.genres || [])}::jsonb, ${JSON.stringify(row.cast_members ?? row.cast ?? [])}::jsonb,
                ${row.director || ""}, ${row.country || ""}, ${row.language || ""},
                ${JSON.stringify(row.subtitles || [])}::jsonb, ${JSON.stringify(row.tags || [])}::jsonb,
                ${Number(row.views) || 0}, ${Boolean(row.featured)}, ${row.rating != null ? Number(row.rating) : null},
                ${row.orientation || "landscape"}, ${serializeHashValue(row.file_hash ?? row.fileHash)},
                ${row.created_by || row.createdBy ? JSON.stringify(row.created_by ?? row.createdBy) : null}::jsonb,
                ${createdAt}, ${updatedAt}
              )
              ON CONFLICT (id) DO NOTHING
            `;
          }
          summary.push({ table, id: row.id });
        } else if (table === "series") {
          const slug = row.slug || `${row.id}`;
          const createdAt = row.created_at ?? row.createdAt ?? new Date().toISOString();
          const updatedAt = row.updated_at ?? row.updatedAt ?? new Date().toISOString();
          if (merge) {
            await sql`
              INSERT INTO series (
                id, type, title, slug, description, category, thumbnail, backdrop_url, trailer,
                release_year, maturity_rating, status, total_seasons, genres, cast_members, director,
                country, language, tags, subtitles, episodes, views, featured, rating, orientation,
                created_by, created_at, updated_at
              ) VALUES (
                ${row.id}, ${row.type || "series"}, ${row.title || "Untitled Series"}, ${slug},
                ${row.description || ""}, ${row.category || ""}, ${row.thumbnail || ""},
                ${row.backdrop_url ?? row.backdropUrl ?? ""}, ${row.trailer || ""},
                ${row.release_year ?? row.releaseYear ?? null}, ${row.maturity_rating ?? row.maturityRating ?? ""},
                ${row.status || "Ongoing"}, ${Number(row.total_seasons ?? row.totalSeasons ?? 1)},
                ${JSON.stringify(row.genres || [])}::jsonb, ${JSON.stringify(row.cast_members ?? row.cast ?? [])}::jsonb,
                ${row.director || ""}, ${row.country || ""}, ${row.language || ""},
                ${JSON.stringify(row.tags || [])}::jsonb, ${JSON.stringify(row.subtitles || [])}::jsonb,
                ${JSON.stringify(row.episodes || [])}::jsonb, ${Number(row.views) || 0},
                ${Boolean(row.featured)}, ${row.rating != null ? Number(row.rating) : null},
                ${row.orientation || "landscape"},
                ${row.created_by || row.createdBy ? JSON.stringify(row.created_by ?? row.createdBy) : null}::jsonb,
                ${createdAt}, ${updatedAt}
              )
              ON CONFLICT (id) DO UPDATE SET
                type = EXCLUDED.type,
                title = EXCLUDED.title,
                slug = EXCLUDED.slug,
                description = EXCLUDED.description,
                category = EXCLUDED.category,
                thumbnail = EXCLUDED.thumbnail,
                backdrop_url = EXCLUDED.backdrop_url,
                trailer = EXCLUDED.trailer,
                release_year = EXCLUDED.release_year,
                maturity_rating = EXCLUDED.maturity_rating,
                status = EXCLUDED.status,
                total_seasons = EXCLUDED.total_seasons,
                genres = EXCLUDED.genres,
                cast_members = EXCLUDED.cast_members,
                director = EXCLUDED.director,
                country = EXCLUDED.country,
                language = EXCLUDED.language,
                tags = EXCLUDED.tags,
                subtitles = EXCLUDED.subtitles,
                episodes = EXCLUDED.episodes,
                views = EXCLUDED.views,
                featured = EXCLUDED.featured,
                rating = EXCLUDED.rating,
                orientation = EXCLUDED.orientation,
                updated_at = NOW()
            `;
          } else {
            await sql`
              INSERT INTO series (
                id, type, title, slug, description, category, thumbnail, backdrop_url, trailer,
                release_year, maturity_rating, status, total_seasons, genres, cast_members, director,
                country, language, tags, subtitles, episodes, views, featured, rating, orientation,
                created_by, created_at, updated_at
              ) VALUES (
                ${row.id}, ${row.type || "series"}, ${row.title || "Untitled Series"}, ${slug},
                ${row.description || ""}, ${row.category || ""}, ${row.thumbnail || ""},
                ${row.backdrop_url ?? row.backdropUrl ?? ""}, ${row.trailer || ""},
                ${row.release_year ?? row.releaseYear ?? null}, ${row.maturity_rating ?? row.maturityRating ?? ""},
                ${row.status || "Ongoing"}, ${Number(row.total_seasons ?? row.totalSeasons ?? 1)},
                ${JSON.stringify(row.genres || [])}::jsonb, ${JSON.stringify(row.cast_members ?? row.cast ?? [])}::jsonb,
                ${row.director || ""}, ${row.country || ""}, ${row.language || ""},
                ${JSON.stringify(row.tags || [])}::jsonb, ${JSON.stringify(row.subtitles || [])}::jsonb,
                ${JSON.stringify(row.episodes || [])}::jsonb, ${Number(row.views) || 0},
                ${Boolean(row.featured)}, ${row.rating != null ? Number(row.rating) : null},
                ${row.orientation || "landscape"},
                ${row.created_by || row.createdBy ? JSON.stringify(row.created_by ?? row.createdBy) : null}::jsonb,
                ${createdAt}, ${updatedAt}
              )
              ON CONFLICT (id) DO NOTHING
            `;
          }
          summary.push({ table, id: row.id });
        } else if (table === "platform_settings") {
          const settingsData = row.data && typeof row.data === "object" ? row.data : (() => {
            const { id: _id, updated_at: _ua, ...rest } = row;
            return rest;
          })();
          if (merge) {
            await sql`
              INSERT INTO platform_settings (id, data, updated_at)
              VALUES (${row.id}, ${JSON.stringify(settingsData)}::jsonb, NOW())
              ON CONFLICT (id) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = NOW()
            `;
          } else {
            await sql`
              INSERT INTO platform_settings (id, data, updated_at)
              VALUES (${row.id}, ${JSON.stringify(settingsData)}::jsonb, NOW())
              ON CONFLICT (id) DO NOTHING
            `;
          }
          summary.push({ table, id: row.id });
        }
      }

      await recordAuditLog({
        actor: session,
        action: "tools.import.database",
        targetType: "database",
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
