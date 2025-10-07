import { randomUUID } from "node:crypto";
import {
  getFirestoreClient,
  isFirebaseConfigured,
} from "./firebase";
import {
  CONTENT_TYPES,
  FIRESTORE_COLLECTIONS,
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

function withCommonMovieFields(payload, actor) {
  return {
    type: CONTENT_TYPES.MOVIE,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    // New schema fields
    mux_asset_id: payload.mux_asset_id ?? null,
    mux_playback_id: payload.mux_playback_id ?? payload.mux_video_id ?? null,
    // Backward-compatibility field
    mux_video_id: payload.mux_playback_id ?? payload.mux_video_id ?? null,
    fileHash: payload.fileHash ?? null,
    thumbnail: payload.thumbnail ? ensureHttps(payload.thumbnail) : null,
    trailer: payload.trailer ? ensureHttps(payload.trailer) : null,
    subtitles: Array.isArray(payload.subtitles) ? payload.subtitles : [],
    tags: sanitizeTagsList(payload.tags ?? []),
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
  return {
    type: CONTENT_TYPES.SERIES,
    title: payload.title,
    description: payload.description,
    category: payload.category,
    thumbnail: payload.thumbnail ? ensureHttps(payload.thumbnail) : null,
    trailer: payload.trailer ? ensureHttps(payload.trailer) : null,
    tags: sanitizeTagsList(payload.tags ?? []),
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
  return {
    episodeId: episode.episodeId ?? randomUUID(),
    epNumber: episode.epNumber,
    title: episode.title,
    description: episode.description,
    mux_asset_id: episode.mux_asset_id ?? null,
    mux_playback_id: episode.mux_playback_id ?? episode.mux_video_id ?? null,
    mux_video_id: episode.mux_playback_id ?? episode.mux_video_id ?? null,
    mux_upload_id: episode.mux_upload_id ?? null,
    fileHash: episode.fileHash ?? null,
    thumbnail: episode.thumbnail ? ensureHttps(episode.thumbnail) : null,
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

function mapSeriesDoc(doc) {
  const data = doc.data();
  return { id: doc.id, ...data };
}

export async function listMovies(filters = {}) {
  if (!isFirebaseConfigured) {
    return inMemoryMovies.filter((item) => applyMovieFilters(item, filters));
  }

  const firestore = getFirestoreClient();
  let query = firestore.collection(FIRESTORE_COLLECTIONS.MOVIES).orderBy("createdAt", "desc");

  if (filters.category) {
    query = query.where("category", "==", filters.category);
  }

  const snapshot = await query.get();
  const items = snapshot.docs.map(mapMovieDoc);
  return filters.search ? items.filter((item) => applyMovieFilters(item, filters)) : items;
}

export async function listSeries(filters = {}) {
  if (!isFirebaseConfigured) {
    return inMemorySeries.filter((item) => applySeriesFilters(item, filters));
  }

  const firestore = getFirestoreClient();
  let query = firestore.collection(FIRESTORE_COLLECTIONS.SERIES).orderBy("createdAt", "desc");

  if (filters.category) {
    query = query.where("category", "==", filters.category);
  }

  const snapshot = await query.get();
  const items = snapshot.docs.map(mapSeriesDoc);
  return filters.search ? items.filter((item) => applySeriesFilters(item, filters)) : items;
}

export async function listAllMedia(filters = {}) {
  const [movies, series] = await Promise.all([listMovies(filters), listSeries(filters)]);
  return [...movies, ...series].sort(
    (a, b) => new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime()
  );
}

export async function getMovie(id) {
  if (!isFirebaseConfigured) {
    return inMemoryMovies.find((movie) => movie.id === id) ?? null;
  }

  const firestore = getFirestoreClient();
  const doc = await firestore.collection(FIRESTORE_COLLECTIONS.MOVIES).doc(id).get();
  return doc.exists ? mapMovieDoc(doc) : null;
}

export async function getSeries(id) {
  if (!isFirebaseConfigured) {
    return inMemorySeries.find((series) => series.id === id) ?? null;
  }

  const firestore = getFirestoreClient();
  const doc = await firestore.collection(FIRESTORE_COLLECTIONS.SERIES).doc(id).get();
  return doc.exists ? mapSeriesDoc(doc) : null;
}

export async function createMovie(payload, actor) {
  const data = withCommonMovieFields(payload, actor);

  if (!isFirebaseConfigured) {
    const movie = { id: randomUUID(), ...data };
    inMemoryMovies = [movie, ...inMemoryMovies];
    return movie;
  }

  const firestore = getFirestoreClient();
  const ref = await firestore.collection(FIRESTORE_COLLECTIONS.MOVIES).add(data);
  return { id: ref.id, ...data };
}

export async function updateMovie(id, payload) {
  if (!id) throw new Error("Movie ID wajib diisi.");
  const data = {
    ...payload,
    updatedAt: NOW(),
  };

  if (!isFirebaseConfigured) {
    inMemoryMovies = inMemoryMovies.map((movie) => (movie.id === id ? { ...movie, ...data } : movie));
    return { id, ...data };
  }

  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.MOVIES).doc(id).update(data);
  return { id, ...data };
}

export async function deleteMovie(id) {
  if (!id) throw new Error("Movie ID wajib diisi.");

  if (!isFirebaseConfigured) {
    inMemoryMovies = inMemoryMovies.filter((movie) => movie.id !== id);
    return { success: true };
  }

  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.MOVIES).doc(id).delete();
  return { success: true };
}

export async function createSeries(payload, actor) {
  const episodes = (payload.episodes ?? []).map(attachEpisodeDefaults);
  const data = {
    ...withCommonSeriesFields({ ...payload, episodes }, actor),
  };

  if (!isFirebaseConfigured) {
    const series = { id: randomUUID(), ...data };
    inMemorySeries = [series, ...inMemorySeries];
    return series;
  }

  const firestore = getFirestoreClient();
  const ref = await firestore.collection(FIRESTORE_COLLECTIONS.SERIES).add(data);
  return { id: ref.id, ...data };
}

export async function updateSeries(id, payload) {
  if (!id) throw new Error("Series ID wajib diisi.");

  const data = {
    ...payload,
    updatedAt: NOW(),
  };

  if (Array.isArray(payload.episodes)) {
    data.episodes = payload.episodes.map(attachEpisodeDefaults);
  }

  if (!isFirebaseConfigured) {
    inMemorySeries = inMemorySeries.map((series) => (series.id === id ? { ...series, ...data } : series));
    return { id, ...data };
  }

  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.SERIES).doc(id).update(data);
  return { id, ...data };
}

export async function deleteSeries(id) {
  if (!id) throw new Error("Series ID wajib diisi.");

  if (!isFirebaseConfigured) {
    inMemorySeries = inMemorySeries.filter((series) => series.id !== id);
    return { success: true };
  }

  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.SERIES).doc(id).delete();
  return { success: true };
}

export async function addEpisode(seriesId, episode) {
  if (!seriesId) throw new Error("Series ID wajib diisi.");
  const newEpisode = attachEpisodeDefaults(episode);

  if (!isFirebaseConfigured) {
    inMemorySeries = inMemorySeries.map((series) =>
      series.id === seriesId
        ? {
            ...series,
            episodes: [...(series.episodes ?? []), newEpisode],
          }
        : series
    );
    return newEpisode;
  }

  const firestore = getFirestoreClient();
  const docRef = firestore.collection(FIRESTORE_COLLECTIONS.SERIES).doc(seriesId);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error("Series tidak ditemukan.");
  const current = doc.data();
  const updatedEpisodes = [...(current.episodes ?? []), newEpisode];
  await docRef.update({ episodes: updatedEpisodes, updatedAt: NOW() });
  return newEpisode;
}

export async function updateEpisode(seriesId, episodeId, input) {
  if (!seriesId || !episodeId) {
    throw new Error("Series ID dan Episode ID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    inMemorySeries = inMemorySeries.map((series) => {
      if (series.id !== seriesId) return series;
      const episodes = (series.episodes ?? []).map((episode) =>
        episode.episodeId === episodeId
          ? {
              ...episode,
              ...input,
              updatedAt: NOW(),
            }
          : episode
      );
      return { ...series, episodes };
    });
    return { success: true };
  }

  const firestore = getFirestoreClient();
  const docRef = firestore.collection(FIRESTORE_COLLECTIONS.SERIES).doc(seriesId);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error("Series tidak ditemukan.");

  const current = doc.data();
  const episodes = (current.episodes ?? []).map((episode) =>
    episode.episodeId === episodeId
      ? {
          ...episode,
          ...input,
          updatedAt: NOW(),
        }
      : episode
  );

  await docRef.update({ episodes, updatedAt: NOW() });
  return { success: true };
}

export async function deleteEpisode(seriesId, episodeId) {
  if (!seriesId || !episodeId) {
    throw new Error("Series ID dan Episode ID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    inMemorySeries = inMemorySeries.map((series) => {
      if (series.id !== seriesId) return series;
      return {
        ...series,
        episodes: (series.episodes ?? []).filter((episode) => episode.episodeId !== episodeId),
      };
    });
    return { success: true };
  }

  const firestore = getFirestoreClient();
  const docRef = firestore.collection(FIRESTORE_COLLECTIONS.SERIES).doc(seriesId);
  const doc = await docRef.get();
  if (!doc.exists) throw new Error("Series tidak ditemukan.");

  const current = doc.data();
  const episodes = (current.episodes ?? []).filter((episode) => episode.episodeId !== episodeId);
  await docRef.update({ episodes, updatedAt: NOW() });
  return { success: true };
}

function applyMovieFilters(movie, { search }) {
  if (!search) return true;
  const term = search.toLowerCase();
  return (
    movie.title?.toLowerCase().includes(term) ||
    movie.description?.toLowerCase().includes(term) ||
    movie.category?.toLowerCase().includes(term) ||
    movie.tags?.some((tag) => tag.includes(term))
  );
}

function applySeriesFilters(series, { search }) {
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
