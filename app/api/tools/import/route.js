import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { createMovie, createSeries } from "@/lib/firestoreService";
import { getFirebaseAdminApp, isFirebaseConfigured } from "@/lib/firebase";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";
import { ADMIN_ROLES, CUSTOMER_ROLE } from "@/utils/constants";
import { validateMoviePayload, validateSeriesPayload } from "@/utils/validators";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

const MAX_IMPORT_DOCS = 500;
const ALLOWED_DATABASE_TABLES = new Set([
  "movies",
  "series",
  "platform_settings",
  "users",
  "analytics_snapshots",
  "audit_logs",
  "notifications",
]);

function serializeHashValue(value) {
  if (typeof value === "string") return value;
  return value ? JSON.stringify(value) : "";
}

async function resolveUniqueSlugs(sql, table, rows) {
  const slugs = rows.map((r) => String(r.slug || r.id)).filter(Boolean);
  if (!slugs.length) return new Map();

  const existing =
    table === "movies"
      ? await sql`SELECT id, slug FROM movies WHERE slug = ANY(${slugs})`
      : await sql`SELECT id, slug FROM series WHERE slug = ANY(${slugs})`;

  const slugOwner = new Map(existing.map((e) => [e.slug, e.id]));
  const usedInBatch = new Set();
  const resolved = new Map();

  for (const row of rows) {
    let candidate = String(row.slug || row.id);
    const owner = slugOwner.get(candidate);
    if ((owner && owner !== row.id) || usedInBatch.has(candidate)) {
      candidate = `${candidate}-${String(row.id).slice(0, 6)}`;
    }
    usedInBatch.add(candidate);
    resolved.set(row.id, candidate);
  }
  return resolved;
}

export async function POST(request) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json().catch(() => null);
    if (!payload || typeof payload !== "object") {
      return NextResponse.json({ error: "Body JSON tidak valid." }, { status: 400 });
    }

    // Import metadata konten (legacy)
    if (payload.type === "content") {
      if (!Array.isArray(payload.records)) {
        return NextResponse.json({ error: "Format import tidak valid." }, { status: 400 });
      }
      if (payload.records.length > MAX_IMPORT_DOCS) {
        return NextResponse.json(
          { error: `Melebihi batas maksimum ${MAX_IMPORT_DOCS} item per import.`, data: [] },
          { status: 400 }
        );
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

          const created =
            normalizedRecord.type === "series"
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
      }).catch((err) => console.warn("[import content] audit log failed:", err?.message || err));
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
          if (!row || typeof row !== "object") continue;
          const rowKey = table === "users" ? row.uid || row.id : row.id;
          if (!rowKey || typeof rowKey !== "string") continue;
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

      const movieOps = operations.filter((op) => op.table === "movies").map((op) => op.row);
      const seriesOps = operations.filter((op) => op.table === "series").map((op) => op.row);
      const [movieSlugMap, seriesSlugMap] = await Promise.all([
        resolveUniqueSlugs(sql, "movies", movieOps),
        resolveUniqueSlugs(sql, "series", seriesOps),
      ]);

      const txQueries = [];
      const summary = [];
      const usersToSync = [];

      for (const { table, row } of operations) {
        if (table === "movies") {
          const slug = movieSlugMap.get(row.id) || `${row.id}`;
          const createdAt = row.created_at ?? row.createdAt ?? new Date().toISOString();
          const updatedAt = row.updated_at ?? row.updatedAt ?? new Date().toISOString();
          if (merge) {
            txQueries.push(sql`
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
            `);
          } else {
            txQueries.push(sql`
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
            `);
          }
          summary.push({ table, id: row.id });
        } else if (table === "series") {
          const slug = seriesSlugMap.get(row.id) || `${row.id}`;
          const createdAt = row.created_at ?? row.createdAt ?? new Date().toISOString();
          const updatedAt = row.updated_at ?? row.updatedAt ?? new Date().toISOString();
          if (merge) {
            txQueries.push(sql`
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
            `);
          } else {
            txQueries.push(sql`
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
            `);
          }
          summary.push({ table, id: row.id });
        } else if (table === "platform_settings") {
          const settingsData =
            row.data && typeof row.data === "object"
              ? row.data
              : (() => {
                  const { id: _id, updated_at: _ua, ...rest } = row;
                  return rest;
                })();
          if (merge) {
            txQueries.push(sql`
              INSERT INTO platform_settings (id, data, updated_at)
              VALUES (${row.id}, ${JSON.stringify(settingsData)}::jsonb, NOW())
              ON CONFLICT (id) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = NOW()
            `);
          } else {
            txQueries.push(sql`
              INSERT INTO platform_settings (id, data, updated_at)
              VALUES (${row.id}, ${JSON.stringify(settingsData)}::jsonb, NOW())
              ON CONFLICT (id) DO NOTHING
            `);
          }
          summary.push({ table, id: row.id });
        } else if (table === "users") {
          const uid = row.uid || row.id;
          const email = String(row.email || "");
          const displayName = String(row.display_name ?? row.displayName ?? "");
          const role = String(row.role || CUSTOMER_ROLE);
          const plan = String(row.plan || "free");
          const isActive =
            row.is_active !== undefined
              ? Boolean(row.is_active)
              : row.isActive !== undefined
              ? Boolean(row.isActive)
              : true;
          const expiresAt = row.expires_at || row.expiresAt || null;
          const excludedKeys = new Set([
            "uid",
            "id",
            "email",
            "display_name",
            "role",
            "plan",
            "is_active",
            "expires_at",
            "updated_at",
          ]);
          const userData =
            row.data && typeof row.data === "object"
              ? row.data
              : Object.fromEntries(Object.entries(row).filter(([k]) => !excludedKeys.has(k)));
          if (merge) {
            txQueries.push(sql`
              INSERT INTO users (uid, email, display_name, role, plan, is_active, expires_at, data, updated_at)
              VALUES (
                ${uid}, ${email}, ${displayName}, ${role}, ${plan}, ${isActive}, ${expiresAt},
                ${JSON.stringify(userData)}::jsonb, NOW()
              )
              ON CONFLICT (uid) DO UPDATE SET
                email = EXCLUDED.email,
                display_name = EXCLUDED.display_name,
                role = EXCLUDED.role,
                plan = EXCLUDED.plan,
                is_active = EXCLUDED.is_active,
                expires_at = EXCLUDED.expires_at,
                data = EXCLUDED.data,
                updated_at = NOW()
            `);
          } else {
            txQueries.push(sql`
              INSERT INTO users (uid, email, display_name, role, plan, is_active, expires_at, data, updated_at)
              VALUES (
                ${uid}, ${email}, ${displayName}, ${role}, ${plan}, ${isActive}, ${expiresAt},
                ${JSON.stringify(userData)}::jsonb, NOW()
              )
              ON CONFLICT (uid) DO NOTHING
            `);
          }
          usersToSync.push({
            uid,
            role,
            plan,
            disabled: userData?.status === "suspend",
          });
          summary.push({ table, id: uid });
        } else if (table === "analytics_snapshots") {
          const excludedKeys = new Set(["id", "updated_at"]);
          const snapshotData =
            row.data && typeof row.data === "object"
              ? row.data
              : Object.fromEntries(Object.entries(row).filter(([k]) => !excludedKeys.has(k)));
          if (merge) {
            txQueries.push(sql`
              INSERT INTO analytics_snapshots (id, data, updated_at)
              VALUES (${row.id}, ${JSON.stringify(snapshotData)}::jsonb, NOW())
              ON CONFLICT (id) DO UPDATE SET
                data = EXCLUDED.data,
                updated_at = NOW()
            `);
          } else {
            txQueries.push(sql`
              INSERT INTO analytics_snapshots (id, data, updated_at)
              VALUES (${row.id}, ${JSON.stringify(snapshotData)}::jsonb, NOW())
              ON CONFLICT (id) DO NOTHING
            `);
          }
          summary.push({ table, id: row.id });
        } else if (table === "audit_logs") {
          const actorJson = row.actor ? JSON.stringify(row.actor) : null;
          const action = String(row.action || "");
          const targetId = String(row.target_id ?? row.targetId ?? "");
          const targetType = String(row.target_type ?? row.targetType ?? "");
          const metadata = JSON.stringify(
            row.metadata && typeof row.metadata === "object" ? row.metadata : {}
          );
          const createdAt = row.created_at || row.createdAt || new Date().toISOString();
          if (merge) {
            txQueries.push(sql`
              INSERT INTO audit_logs (id, actor, action, target_id, target_type, metadata, created_at)
              VALUES (${row.id}, ${actorJson}::jsonb, ${action}, ${targetId}, ${targetType}, ${metadata}::jsonb, ${createdAt})
              ON CONFLICT (id) DO UPDATE SET
                actor = EXCLUDED.actor,
                action = EXCLUDED.action,
                target_id = EXCLUDED.target_id,
                target_type = EXCLUDED.target_type,
                metadata = EXCLUDED.metadata,
                created_at = EXCLUDED.created_at
            `);
          } else {
            txQueries.push(sql`
              INSERT INTO audit_logs (id, actor, action, target_id, target_type, metadata, created_at)
              VALUES (${row.id}, ${actorJson}::jsonb, ${action}, ${targetId}, ${targetType}, ${metadata}::jsonb, ${createdAt})
              ON CONFLICT (id) DO NOTHING
            `);
          }
          summary.push({ table, id: row.id });
        } else if (table === "notifications") {
          const title = String(row.title || "");
          const message = String(row.message ?? row.body ?? "");
          const notifType = String(row.type || "info");
          const read = Boolean(row.read);
          const metadata = JSON.stringify(
            row.metadata && typeof row.metadata === "object" ? row.metadata : {}
          );
          const createdAt = row.created_at || row.createdAt || new Date().toISOString();
          if (merge) {
            txQueries.push(sql`
              INSERT INTO notifications (id, title, message, type, read, metadata, created_at)
              VALUES (${row.id}, ${title}, ${message}, ${notifType}, ${read}, ${metadata}::jsonb, ${createdAt})
              ON CONFLICT (id) DO UPDATE SET
                title = EXCLUDED.title,
                message = EXCLUDED.message,
                type = EXCLUDED.type,
                read = EXCLUDED.read,
                metadata = EXCLUDED.metadata,
                created_at = EXCLUDED.created_at
            `);
          } else {
            txQueries.push(sql`
              INSERT INTO notifications (id, title, message, type, read, metadata, created_at)
              VALUES (${row.id}, ${title}, ${message}, ${notifType}, ${read}, ${metadata}::jsonb, ${createdAt})
              ON CONFLICT (id) DO NOTHING
            `);
          }
          summary.push({ table, id: row.id });
        }
      }

      if (txQueries.length > 0) {
        await sql.transaction(txQueries);
      }

      // Sinkronkan customClaims & status disabled ke Firebase Auth untuk user yang diimpor
      if (usersToSync.length > 0 && isFirebaseConfigured) {
        const app = getFirebaseAdminApp();
        if (app) {
          const auth = getAuth(app);
          await Promise.allSettled(
            usersToSync.map(async (u) => {
              await auth.setCustomUserClaims(u.uid, { role: u.role, plan: u.plan });
              await auth.updateUser(u.uid, { disabled: u.disabled });
            })
          );
        }
      }

      await recordAuditLog({
        actor: session,
        action: "tools.import.database",
        targetType: "database",
        metadata: { count: summary.length },
      }).catch((err) => console.warn("[import database] audit log failed:", err?.message || err));
      return NextResponse.json({ data: summary });
    }

    return NextResponse.json({ error: "Tipe import tidak dikenal." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/tools/import", error);
    return NextResponse.json({ error: error.message || "Gagal melakukan import." }, { status: 500 });
  }
}
