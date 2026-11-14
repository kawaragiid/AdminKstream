import { randomUUID } from "node:crypto";
import {
  ensureNeonSchema,
  getSql,
  isNeonConfigured,
} from "./neonDb";
import {
  CONTENT_TYPES,
} from "@/utils/constants";
import {
  ensureHttps,
  sanitizeTagsList,
} from "@/utils/validators";

const NOW = () => new Date().toISOString();

const FALLBACK_MOVIES = [
  {
    id: "movie-demo-1",
    type: CONTENT_TYPES.MOVIE,
    title: "Demo Movie",
    description: "Contoh movie tunggal untuk preview UI.",
    category: "Action",
    mux_asset_id: "mock-asset",
    mux_playback_id: "mux_demo_movie",
    mux_video_id: "mux_demo_movie",
    thumbnail: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4",
    trailer: null,
    subtitles: [
      { lang: "en", label: "English", url: "https://example.com/movie_en.vtt" },
    ],
    tags: ["demo", "movie"],
    createdAt: NOW(),
  },
];

const FALLBACK_SERIES = [
  {
    id: "series-demo-1",
    type: CONTENT_TYPES.SERIES,
    title: "Demo Series",
    description: "Contoh series dengan dua episode untuk preview UI.",
    category: "Drama",
    thumbnail: "https://images.unsplash.com/photo-1517602302552-471fe67acf66",
    trailer: null,
    tags: ["demo", "series"],
    episodes: [
      {
        episodeId: "series-demo-1-ep1",
        epNumber: 1,
        title: "Episode 1",
        description: "Deskripsi singkat episode 1.",
        mux_asset_id: "mock-asset-ep1",
        mux_playback_id: "mux_demo_series_ep1",
        mux_video_id: "mux_demo_series_ep1",
        thumbnail: "https://images.unsplash.com/photo-1521737604893-d14cc237f11d",
        subtitles: [],
        createdAt: NOW(),
      },
      {
        episodeId: "series-demo-1-ep2",
        epNumber: 2,
        title: "Episode 2",
        description: "Deskripsi singkat episode 2.",
        mux_asset_id: "mock-asset-ep2",
        mux_playback_id: "mux_demo_series_ep2",
        mux_video_id: "mux_demo_series_ep2",
        thumbnail: "https://images.unsplash.com/photo-1524985069026-dd778a71c7b4",
        subtitles: [],
        createdAt: NOW(),
      },
    ],
    createdAt: NOW(),
  },
];

let inMemoryMovies = [...FALLBACK_MOVIES];
let inMemorySeries = [...FALLBACK_SERIES];

function toSlug(title = "") {
  return String(title)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function defaultTagsFor(type, category, tags) {
  const cleaned = sanitizeTagsList(tags ?? []);
  if (cleaned.length > 0) return cleaned;
  const base = [type];
  if (category) base.push(String(category).trim().toLowerCase());
  return [...new Set(base.filter(Boolean))];
}

function normalizeStringList(raw) {
  const arr = Array.isArray(raw)
    ? raw
    : typeof raw === "string"
      ? raw.split(",")
      : [];
  return [...new Set(arr.map((item) => String(item ?? "").trim()).filter(Boolean))];
}

function normalizeYear(raw) {
  if (raw === null || raw === undefined || raw === "") return null;
  const num = Number(raw);
  return Number.isInteger(num) && num >= 1900 && num <= 2100 ? num : null;
}

function normalizePositiveNumber(raw, fallback = null) {
  if (raw === null || raw === undefined || raw === "") return fallback;
  const num = Number(raw);
  return Number.isFinite(num) && num > 0 ? Math.round(num) : fallback;
}

function extractNetflixMeta(payload, { isSeries = false } = {}) {
  const genres = normalizeStringList(payload.genres);
  if (genres.length === 0 && payload.category) {
    genres.push(String(payload.category).trim());
  }

  const meta = {
    releaseYear: normalizeYear(payload.releaseYear),
    maturityRating: payload.maturityRating ? String(payload.maturityRating).trim() : null,
    genres,
    cast: normalizeStringList(payload.cast),
    director: payload.director ? String(payload.director).trim() : null,
    country: payload.country ? String(payload.country).trim() : null,
    language: payload.language ? String(payload.language).trim() : null,
    backdropUrl: payload.backdropUrl ? ensureHttps(payload.backdropUrl) : null,
  };

  if (isSeries) {
    meta.status = payload.status ? String(payload.status).trim() : "Ongoing";
    meta.totalSeasons = normalizePositiveNumber(payload.totalSeasons, 1);
  } else {
    meta.duration = normalizePositiveNumber(payload.duration, null);
  }

  return meta;
}

function pickNetflixMetaPatch(payload, { isSeries = false } = {}) {
  const patch = {};
  if (payload.releaseYear !== undefined) patch.releaseYear = normalizeYear(payload.releaseYear);
  if (payload.maturityRating !== undefined) {
    patch.maturityRating = payload.maturityRating ? String(payload.maturityRating).trim() : null;
  }
  if (payload.genres !== undefined) patch.genres = normalizeStringList(payload.genres);
  if (payload.cast !== undefined) patch.cast = normalizeStringList(payload.cast);
  if (payload.director !== undefined) patch.director = payload.director ? String(payload.director).trim() : null;
  if (payload.country !== undefined) patch.country = payload.country ? String(payload.country).trim() : null;
  if (payload.language !== undefined) patch.language = payload.language ? String(payload.language).trim() : null;
  if (payload.backdropUrl !== undefined) {
    patch.backdropUrl = payload.backdropUrl ? ensureHttps(payload.backdropUrl) : null;
  }
  if (isSeries) {
    if (payload.status !== undefined) patch.status = payload.status ? String(payload.status).trim() : "Ongoing";
    if (payload.totalSeasons !== undefined) patch.totalSeasons = normalizePositiveNumber(payload.totalSeasons, 1);
  } else if (payload.duration !== undefined) {
    patch.duration = normalizePositiveNumber(payload.duration, null);
  }
  return patch;
}

function withCommonMovieFields(payload, actor) {
  const playbackId = payload.mux_playback_id ?? payload.mux_video_id ?? payload.mainPlaybackId ?? null;
  const rawThumbnail = payload.thumbnail ?? payload.thumbnailUrl ?? null;
  const resolvedThumbnail = rawThumbnail
    ? ensureHttps(rawThumbnail)
    : playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=5`
      : null;
  const rawTrailer =
    payload.trailer ??
    (payload.trailerPlaybackId ? `https://stream.mux.com/${payload.trailerPlaybackId}.m3u8` : null);

  return {
    type: CONTENT_TYPES.MOVIE,
    title: payload.title,
    slug: payload.slug ? toSlug(payload.slug) : toSlug(payload.title),
    description: payload.description,
    category: payload.category,
    // New schema fields
    mux_asset_id: payload.mux_asset_id ?? null,
    mux_playback_id: playbackId,
    // Backward-compatibility field
    mux_video_id: payload.mux_video_id ?? playbackId,
    fileHash: payload.fileHash ?? null,
    thumbnail: resolvedThumbnail,
    trailer: rawTrailer ? ensureHttps(rawTrailer) : null,
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : [],
    tags: defaultTagsFor(CONTENT_TYPES.MOVIE, payload.category, payload.tags),
    ...extractNetflixMeta(payload, { isSeries: false }),
    createdAt: payload.createdAt ?? NOW(),
    updatedAt: NOW(),
    createdBy: actor
      ? {
          uid: actor.uid,
          email: actor.email ?? null,
          displayName: actor.displayName ?? null,
        }
      : null,
  };
}

function withCommonSeriesFields(payload, actor) {
  const rawThumbnail = payload.thumbnail ?? payload.thumbnailUrl ?? null;
  const rawTrailer =
    payload.trailer ??
    (payload.trailerPlaybackId ? `https://stream.mux.com/${payload.trailerPlaybackId}.m3u8` : null);

  return {
    type: CONTENT_TYPES.SERIES,
    title: payload.title,
    slug: payload.slug ? toSlug(payload.slug) : toSlug(payload.title),
    description: payload.description,
    category: payload.category,
    thumbnail: rawThumbnail ? ensureHttps(rawThumbnail) : null,
    trailer: rawTrailer ? ensureHttps(rawTrailer) : null,
    tags: defaultTagsFor(CONTENT_TYPES.SERIES, payload.category, payload.tags),
    ...extractNetflixMeta(payload, { isSeries: true }),
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : [],
    episodes: Array.isArray(payload.episodes) ? payload.episodes : [],
    createdAt: payload.createdAt ?? NOW(),
    updatedAt: NOW(),
    createdBy: actor
      ? {
          uid: actor.uid,
          email: actor.email ?? null,
          displayName: actor.displayName ?? null,
        }
      : null,
  };
}

function attachEpisodeDefaults(episode) {
  const playbackId = episode.mux_playback_id ?? episode.mux_video_id ?? null;
  const resolvedThumbnail = episode.thumbnail
    ? ensureHttps(episode.thumbnail)
    : playbackId
      ? `https://image.mux.com/${playbackId}/thumbnail.jpg?time=10`
      : null;

  return {
    episodeId: episode.episodeId ?? randomUUID(),
    seasonNumber: normalizePositiveNumber(episode.seasonNumber, 1),
    epNumber: episode.epNumber,
    title: episode.title,
    description: episode.description,
    duration: normalizePositiveNumber(episode.duration, null),
    releaseDate: episode.releaseDate ? String(episode.releaseDate).trim() : null,
    mux_asset_id: episode.mux_asset_id ?? null,
    mux_playback_id: playbackId,
    mux_video_id: playbackId,
    mux_upload_id: episode.mux_upload_id ?? null,
    fileHash: episode.fileHash ?? null,
    thumbnail: resolvedThumbnail,
    trailer: episode.trailer ? ensureHttps(episode.trailer) : null,
    subtitles: Array.isArray(episode.subtitles) ? episode.subtitles : [],
    createdAt: episode.createdAt ?? NOW(),
    updatedAt: NOW(),
  };
}

function mapMovieDoc(doc) {
  const data = doc.data();
  return { id: doc.id, ...data };
}

function slugifyTitle(value, fallbackId) {
  const base = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || fallbackId || randomUUID();
}

function mapMovieRow(row) {
  return {
    id: row.id,
    type: row.type || CONTENT_TYPES.MOVIE,
    title: row.title,
    slug: row.slug,
    description: row.description ?? "",
    category: row.category ?? "",
    mux_asset_id: row.mux_asset_id ?? "",
    mux_playback_id: row.mux_playback_id ?? "",
    mux_video_id: row.mux_video_id ?? "",
    thumbnail: row.thumbnail || null,
    backdropUrl: row.backdrop_url || null,
    trailer: row.trailer || null,
    duration: row.duration ?? 0,
    releaseYear: row.release_year ?? null,
    maturityRating: row.maturity_rating || null,
    genres: Array.isArray(row.genres) ? row.genres : [],
    cast: Array.isArray(row.cast_members) ? row.cast_members : [],
    director: row.director || null,
    country: row.country || null,
    language: row.language || null,
    subtitles: Array.isArray(row.subtitles) ? row.subtitles : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    views: Number(row.views ?? 0),
    featured: Boolean(row.featured),
    rating: row.rating != null ? Number(row.rating) : null,
    orientation: row.orientation || "landscape",
    fileHash: row.file_hash || "",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : NOW(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : NOW(),
  };
}

function normalizeEpisodeRow(ep = {}) {
  const playbackId = ep.mux_playback_id || ep.muxPlaybackId || ep.mux_video_id || ep.muxVideoId || "";
  const assetId = ep.mux_asset_id || ep.muxAssetId || "";
  const epNum = Number(ep.epNumber ?? ep.episodeNumber ?? ep.number ?? 0);
  const seasonNum = Number(ep.seasonNumber ?? ep.season_number ?? 1);
  const resolvedId = ep.episodeId || ep.id || `s${seasonNum}-ep-${epNum}`;
  return {
    ...ep,
    episodeId: resolvedId,
    id: ep.id || resolvedId,
    seasonNumber: seasonNum,
    epNumber: epNum,
    episodeNumber: epNum,
    mux_asset_id: assetId,
    muxAssetId: assetId,
    mux_playback_id: playbackId,
    muxPlaybackId: playbackId,
    mux_video_id: playbackId,
  };
}

function mapSeriesRow(row) {
  const rawEpisodes = Array.isArray(row.episodes) ? row.episodes : [];
  return {
    id: row.id,
    type: row.type || CONTENT_TYPES.SERIES,
    title: row.title,
    slug: row.slug,
    description: row.description ?? "",
    category: row.category ?? "",
    thumbnail: row.thumbnail || null,
    backdropUrl: row.backdrop_url || null,
    trailer: row.trailer || null,
    releaseYear: row.release_year ?? null,
    maturityRating: row.maturity_rating || null,
    status: row.status || "Ongoing",
    totalSeasons: row.total_seasons ?? 1,
    genres: Array.isArray(row.genres) ? row.genres : [],
    cast: Array.isArray(row.cast_members) ? row.cast_members : [],
    director: row.director || null,
    country: row.country || null,
    language: row.language || null,
    tags: Array.isArray(row.tags) ? row.tags : [],
    subtitles: Array.isArray(row.subtitles) ? row.subtitles : [],
    episodes: rawEpisodes.map(normalizeEpisodeRow),
    views: Number(row.views ?? 0),
    featured: Boolean(row.featured),
    rating: row.rating != null ? Number(row.rating) : null,
    orientation: row.orientation || "landscape",
    createdBy: row.created_by ?? null,
    createdAt: row.created_at ? new Date(row.created_at).toISOString() : NOW(),
    updatedAt: row.updated_at ? new Date(row.updated_at).toISOString() : NOW(),
  };
}

export async function listMovies(filters = {}) {
  if (!isNeonConfigured()) {
    return inMemoryMovies.filter((item) => applyMovieFilters(item, filters));
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM movies ORDER BY created_at DESC`;
  const items = rows.map(mapMovieRow);
  return filters.search || filters.category
    ? items.filter((item) => applyMovieFilters(item, filters))
    : items;
}

export async function listSeries(filters = {}) {
  if (!isNeonConfigured()) {
    return inMemorySeries.filter((item) => applySeriesFilters(item, filters));
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM series ORDER BY created_at DESC`;
  const items = rows.map(mapSeriesRow);
  return filters.search || filters.category
    ? items.filter((item) => applySeriesFilters(item, filters))
    : items;
}

export async function listAllMedia(filters = {}) {
  const [movies, series] = await Promise.all([listMovies(filters), listSeries(filters)]);
  return [...movies, ...series].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
}

export async function getMovie(id) {
  if (!isNeonConfigured()) {
    return inMemoryMovies.find((movie) => movie.id === id) ?? null;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM movies WHERE id = ${id} LIMIT 1`;
  return rows.length ? mapMovieRow(rows[0]) : null;
}

export async function getSeries(id) {
  if (!isNeonConfigured()) {
    return inMemorySeries.find((series) => series.id === id) ?? null;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT * FROM series WHERE id = ${id} LIMIT 1`;
  return rows.length ? mapSeriesRow(rows[0]) : null;
}

export async function createMovie(payload, actor) {
  const data = withCommonMovieFields(payload, actor);

  if (!isNeonConfigured()) {
    const movie = { id: randomUUID(), ...data };
    inMemoryMovies = [movie, ...inMemoryMovies];
    return movie;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const id = randomUUID();
  const slug = `${slugifyTitle(data.title, id)}-${id.slice(0, 6)}`;
  await sql`
    INSERT INTO movies (
      id, type, title, slug, description, category,
      mux_asset_id, mux_playback_id, mux_video_id, thumbnail, backdrop_url, trailer,
      duration, release_year, maturity_rating, genres, cast_members, director, country, language,
      subtitles, tags, views, featured, rating, orientation, file_hash, created_by, created_at, updated_at
    ) VALUES (
      ${id}, ${CONTENT_TYPES.MOVIE}, ${data.title || "Untitled"}, ${slug}, ${data.description || ""}, ${data.category || ""},
      ${data.mux_asset_id || ""}, ${data.mux_playback_id || ""}, ${data.mux_video_id || ""},
      ${data.thumbnail || ""}, ${data.backdropUrl || ""}, ${data.trailer || ""},
      ${Number(data.duration) || 0}, ${data.releaseYear ? Number(data.releaseYear) : null}, ${data.maturityRating || ""},
      ${JSON.stringify(data.genres || [])}::jsonb, ${JSON.stringify(data.cast || [])}::jsonb,
      ${data.director || ""}, ${data.country || ""}, ${data.language || ""},
      ${JSON.stringify(data.subtitles || [])}::jsonb, ${JSON.stringify(data.tags || [])}::jsonb,
      ${Number(data.views) || 0}, ${Boolean(data.featured)}, ${data.rating != null ? Number(data.rating) : null},
      ${data.orientation || "landscape"}, ${data.fileHash || ""},
      ${data.createdBy ? JSON.stringify(data.createdBy) : null}::jsonb, ${data.createdAt || NOW()}, ${data.updatedAt || NOW()}
    )
  `;
  return { id, slug, ...data };
}

export async function updateMovie(id, payload) {
  if (!id) throw new Error("Movie ID wajib diisi.");
  const allowed = {};
  if (payload.title !== undefined) allowed.title = payload.title;
  if (payload.description !== undefined) allowed.description = payload.description;
  if (payload.category !== undefined) allowed.category = payload.category;
  if (payload.mux_asset_id !== undefined) allowed.mux_asset_id = payload.mux_asset_id;
  if (payload.mux_playback_id !== undefined) allowed.mux_playback_id = payload.mux_playback_id;
  if (payload.mux_video_id !== undefined) allowed.mux_video_id = payload.mux_video_id;
  if (payload.fileHash !== undefined) allowed.fileHash = payload.fileHash;
  if (payload.thumbnail !== undefined) allowed.thumbnail = payload.thumbnail ? ensureHttps(payload.thumbnail) : null;
  if (payload.trailer !== undefined) allowed.trailer = payload.trailer ? ensureHttps(payload.trailer) : null;
  if (Array.isArray(payload.subtitles)) allowed.subtitles = payload.subtitles;
  if (Array.isArray(payload.tags)) allowed.tags = sanitizeTagsList(payload.tags);
  if (payload.orientation !== undefined) allowed.orientation = payload.orientation;
  Object.assign(allowed, pickNetflixMetaPatch(payload, { isSeries: false }));

  const data = {
    ...allowed,
    updatedAt: NOW(),
  };

  if (!isNeonConfigured()) {
    inMemoryMovies = inMemoryMovies.map((movie) => (movie.id === id ? { ...movie, ...data } : movie));
    return { id, ...data };
  }

  await ensureNeonSchema();
  const sql = getSql();
  const existing = await getMovie(id);
  if (!existing) throw new Error("Movie tidak ditemukan.");
  const merged = { ...existing, ...data };
  await sql`
    UPDATE movies SET
      title = ${merged.title || "Untitled"},
      description = ${merged.description || ""},
      category = ${merged.category || ""},
      mux_asset_id = ${merged.mux_asset_id || ""},
      mux_playback_id = ${merged.mux_playback_id || ""},
      mux_video_id = ${merged.mux_video_id || ""},
      thumbnail = ${merged.thumbnail || ""},
      backdrop_url = ${merged.backdropUrl || ""},
      trailer = ${merged.trailer || ""},
      duration = ${Number(merged.duration) || 0},
      release_year = ${merged.releaseYear ? Number(merged.releaseYear) : null},
      maturity_rating = ${merged.maturityRating || ""},
      genres = ${JSON.stringify(merged.genres || [])}::jsonb,
      cast_members = ${JSON.stringify(merged.cast || [])}::jsonb,
      director = ${merged.director || ""},
      country = ${merged.country || ""},
      language = ${merged.language || ""},
      subtitles = ${JSON.stringify(merged.subtitles || [])}::jsonb,
      tags = ${JSON.stringify(merged.tags || [])}::jsonb,
      orientation = ${merged.orientation || "landscape"},
      file_hash = ${merged.fileHash || ""},
      rating = ${merged.rating != null ? Number(merged.rating) : null},
      featured = ${Boolean(merged.featured)},
      updated_at = NOW()
    WHERE id = ${id}
  `;
  return merged;
}

export async function deleteMovie(id) {
  if (!id) throw new Error("Movie ID wajib diisi.");

  if (!isNeonConfigured()) {
    inMemoryMovies = inMemoryMovies.filter((movie) => movie.id !== id);
    return { success: true };
  }

  await ensureNeonSchema();
  const sql = getSql();
  await sql`DELETE FROM movies WHERE id = ${id}`;
  return { success: true };
}

export async function createSeries(payload, actor) {
  const episodes = (payload.episodes ?? []).map(attachEpisodeDefaults);
  const data = {
    ...withCommonSeriesFields({ ...payload, episodes }, actor),
  };

  if (!isNeonConfigured()) {
    const series = { id: randomUUID(), ...data };
    inMemorySeries = [series, ...inMemorySeries];
    return series;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const id = randomUUID();
  const slug = `${slugifyTitle(data.title, id)}-${id.slice(0, 6)}`;
  await sql`
    INSERT INTO series (
      id, type, title, slug, description, category,
      thumbnail, backdrop_url, trailer, release_year, maturity_rating, status, total_seasons,
      genres, cast_members, director, country, language, tags, subtitles, episodes,
      views, featured, rating, orientation, created_by, created_at, updated_at
    ) VALUES (
      ${id}, ${CONTENT_TYPES.SERIES}, ${data.title || "Untitled Series"}, ${slug}, ${data.description || ""}, ${data.category || ""},
      ${data.thumbnail || ""}, ${data.backdropUrl || ""}, ${data.trailer || ""},
      ${data.releaseYear ? Number(data.releaseYear) : null}, ${data.maturityRating || ""},
      ${data.status || "Ongoing"}, ${Number(data.totalSeasons) || 1},
      ${JSON.stringify(data.genres || [])}::jsonb, ${JSON.stringify(data.cast || [])}::jsonb,
      ${data.director || ""}, ${data.country || ""}, ${data.language || ""},
      ${JSON.stringify(data.tags || [])}::jsonb, ${JSON.stringify(data.subtitles || [])}::jsonb,
      ${JSON.stringify(data.episodes || [])}::jsonb,
      ${Number(data.views) || 0}, ${Boolean(data.featured)}, ${data.rating != null ? Number(data.rating) : null},
      ${data.orientation || "landscape"}, ${data.createdBy ? JSON.stringify(data.createdBy) : null}::jsonb,
      ${data.createdAt || NOW()}, ${data.updatedAt || NOW()}
    )
  `;
  return { id, slug, ...data };
}

export async function updateSeries(id, payload) {
  if (!id) throw new Error("Series ID wajib diisi.");

  const existing = await getSeries(id);
  const existingEpisodes = Array.isArray(existing?.episodes) ? existing.episodes : [];

  const allowed = {};
  if (payload.title !== undefined) allowed.title = payload.title;
  if (payload.description !== undefined) allowed.description = payload.description;
  if (payload.category !== undefined) allowed.category = payload.category;
  if (payload.thumbnail !== undefined) allowed.thumbnail = payload.thumbnail ? ensureHttps(payload.thumbnail) : null;
  if (payload.trailer !== undefined) allowed.trailer = payload.trailer ? ensureHttps(payload.trailer) : null;
  if (Array.isArray(payload.subtitles)) allowed.subtitles = payload.subtitles;
  if (Array.isArray(payload.tags)) allowed.tags = sanitizeTagsList(payload.tags);
  if (payload.orientation !== undefined) allowed.orientation = payload.orientation;
  Object.assign(allowed, pickNetflixMetaPatch(payload, { isSeries: true }));
  if (Array.isArray(payload.episodes)) {
    allowed.episodes = payload.episodes.map((ep) => {
      const matched = existingEpisodes.find(
        (existingEp) =>
          (ep?.episodeId && existingEp?.episodeId === ep.episodeId) ||
          (ep?.epNumber !== undefined && existingEp?.epNumber === ep.epNumber)
      );
      return attachEpisodeDefaults({
        ...(matched ?? {}),
        ...ep,
        episodeId: ep?.episodeId ?? matched?.episodeId,
        createdAt: ep?.createdAt ?? matched?.createdAt,
      });
    });
  }

  const data = {
    ...allowed,
    updatedAt: NOW(),
  };

  if (!isNeonConfigured()) {
    inMemorySeries = inMemorySeries.map((series) => (series.id === id ? { ...series, ...data } : series));
    return { id, ...data };
  }

  if (!existing) throw new Error("Series tidak ditemukan.");
  await ensureNeonSchema();
  const sql = getSql();
  const merged = { ...existing, ...data };
  await sql`
    UPDATE series SET
      title = ${merged.title || "Untitled Series"},
      description = ${merged.description || ""},
      category = ${merged.category || ""},
      thumbnail = ${merged.thumbnail || ""},
      backdrop_url = ${merged.backdropUrl || ""},
      trailer = ${merged.trailer || ""},
      release_year = ${merged.releaseYear ? Number(merged.releaseYear) : null},
      maturity_rating = ${merged.maturityRating || ""},
      status = ${merged.status || "Ongoing"},
      total_seasons = ${Number(merged.totalSeasons) || 1},
      genres = ${JSON.stringify(merged.genres || [])}::jsonb,
      cast_members = ${JSON.stringify(merged.cast || [])}::jsonb,
      director = ${merged.director || ""},
      country = ${merged.country || ""},
      language = ${merged.language || ""},
      tags = ${JSON.stringify(merged.tags || [])}::jsonb,
      subtitles = ${JSON.stringify(merged.subtitles || [])}::jsonb,
      episodes = ${JSON.stringify(merged.episodes || [])}::jsonb,
      orientation = ${merged.orientation || "landscape"},
      rating = ${merged.rating != null ? Number(merged.rating) : null},
      featured = ${Boolean(merged.featured)},
      updated_at = NOW()
    WHERE id = ${id}
  `;
  return merged;
}

export async function deleteSeries(id) {
  if (!id) throw new Error("Series ID wajib diisi.");

  if (!isNeonConfigured()) {
    inMemorySeries = inMemorySeries.filter((series) => series.id !== id);
    return { success: true };
  }

  await ensureNeonSchema();
  const sql = getSql();
  await sql`DELETE FROM series WHERE id = ${id}`;
  return { success: true };
}

export async function addEpisode(seriesId, episode) {
  if (!seriesId) throw new Error("Series ID wajib diisi.");
  const newEpisode = attachEpisodeDefaults(episode);

  if (!isNeonConfigured()) {
    inMemorySeries = inMemorySeries.map((series) =>
      series.id === seriesId
        ? {
            ...series,
            totalSeasons: Math.max(Number(series.totalSeasons || 1), Number(newEpisode.seasonNumber || 1)),
            episodes: [...(series.episodes ?? []), newEpisode],
          }
        : series
    );
    return newEpisode;
  }

  const current = await getSeries(seriesId);
  if (!current) throw new Error("Series tidak ditemukan.");
  const updatedEpisodes = [...(current.episodes ?? []), newEpisode];
  const nextTotalSeasons = Math.max(Number(current.totalSeasons || 1), Number(newEpisode.seasonNumber || 1));
  const sql = getSql();
  await sql`
    UPDATE series
    SET episodes = ${JSON.stringify(updatedEpisodes)}::jsonb, total_seasons = ${nextTotalSeasons}, updated_at = NOW()
    WHERE id = ${seriesId}
  `;
  return newEpisode;
}

function sanitizeEpisodePatch(input = {}) {
  const patch = {};
  if (input.seasonNumber !== undefined) patch.seasonNumber = normalizePositiveNumber(input.seasonNumber, 1);
  if (input.epNumber !== undefined) patch.epNumber = input.epNumber;
  if (input.title !== undefined) patch.title = input.title;
  if (input.description !== undefined) patch.description = input.description;
  if (input.duration !== undefined) patch.duration = normalizePositiveNumber(input.duration, null);
  if (input.releaseDate !== undefined) patch.releaseDate = input.releaseDate ? String(input.releaseDate).trim() : null;
  if (input.mux_asset_id !== undefined) patch.mux_asset_id = input.mux_asset_id;
  if (input.mux_playback_id !== undefined) patch.mux_playback_id = input.mux_playback_id;
  if (input.mux_video_id !== undefined) patch.mux_video_id = input.mux_video_id;
  if (input.mux_upload_id !== undefined) patch.mux_upload_id = input.mux_upload_id;
  if (input.fileHash !== undefined) patch.fileHash = input.fileHash;
  if (input.thumbnail !== undefined) patch.thumbnail = input.thumbnail ? ensureHttps(input.thumbnail) : null;
  if (input.trailer !== undefined) patch.trailer = input.trailer ? ensureHttps(input.trailer) : null;
  if (Array.isArray(input.subtitles)) patch.subtitles = input.subtitles;
  return patch;
}

export async function updateEpisode(seriesId, episodeId, input) {
  if (!seriesId || !episodeId) {
    throw new Error("Series ID dan Episode ID wajib diisi.");
  }

  const sanitized = sanitizeEpisodePatch(input);

  if (!isNeonConfigured()) {
    inMemorySeries = inMemorySeries.map((series) => {
      if (series.id !== seriesId) return series;
      const episodes = (series.episodes ?? []).map((episode) =>
        episode.episodeId === episodeId
          ? {
              ...episode,
              ...sanitized,
              updatedAt: NOW(),
            }
          : episode
      );
      return { ...series, episodes };
    });
    return { success: true };
  }

  const current = await getSeries(seriesId);
  if (!current) throw new Error("Series tidak ditemukan.");
  const episodes = (current.episodes ?? []).map((episode) =>
    episode.episodeId === episodeId
      ? {
          ...episode,
          ...sanitized,
          updatedAt: NOW(),
        }
      : episode
  );
  const sql = getSql();
  await sql`
    UPDATE series
    SET episodes = ${JSON.stringify(episodes)}::jsonb, updated_at = NOW()
    WHERE id = ${seriesId}
  `;
  return { success: true };
}

export async function deleteEpisode(seriesId, episodeId) {
  if (!seriesId || !episodeId) {
    throw new Error("Series ID dan Episode ID wajib diisi.");
  }

  if (!isNeonConfigured()) {
    inMemorySeries = inMemorySeries.map((series) => {
      if (series.id !== seriesId) return series;
      return {
        ...series,
        episodes: (series.episodes ?? []).filter((episode) => episode.episodeId !== episodeId),
      };
    });
    return { success: true };
  }

  const current = await getSeries(seriesId);
  if (!current) throw new Error("Series tidak ditemukan.");
  const episodes = (current.episodes ?? []).filter((episode) => episode.episodeId !== episodeId);
  const sql = getSql();
  await sql`
    UPDATE series
    SET episodes = ${JSON.stringify(episodes)}::jsonb, updated_at = NOW()
    WHERE id = ${seriesId}
  `;
  return { success: true };
}

function applyMovieFilters(movie, { search, category } = {}) {
  if (category && movie.category !== category) return false;
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    movie.title?.toLowerCase().includes(term) ||
    movie.description?.toLowerCase().includes(term) ||
    movie.category?.toLowerCase().includes(term) ||
    movie.tags?.some((tag) => tag.includes(term))
  );
}

function applySeriesFilters(series, { search, category } = {}) {
  if (category && series.category !== category) return false;
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    series.title?.toLowerCase().includes(term) ||
    series.description?.toLowerCase().includes(term) ||
    series.category?.toLowerCase().includes(term) ||
    series.tags?.some((tag) => tag.includes(term)) ||
    (series.episodes ?? []).some(
      (episode) =>
        episode.title?.toLowerCase().includes(term) ||
        episode.description?.toLowerCase().includes(term)
    )
  );
}
