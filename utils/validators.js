import { CONTENT_TYPES } from "./constants";

function isBlockedHost(hostname) {
  const host = String(hostname || "").toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) return true;
  if (host === "localhost" || host === "0.0.0.0" || host === "::1" || host.endsWith(".local")) {
    return true;
  }
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  return false;
}

export function ensureHttps(url) {
  if (url === null || url === undefined || typeof url !== "string") return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) return trimmed;
  if (trimmed.startsWith("//")) return null;

  let candidate = trimmed;
  if (/^http:\/\//i.test(candidate)) {
    candidate = candidate.replace(/^http:\/\//i, "https://");
  } else if (!/^https:\/\//i.test(candidate)) {
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/i.test(candidate)) {
      return null;
    }
    candidate = `https://${candidate}`;
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:") return null;
    if (isBlockedHost(parsed.hostname)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function sanitizeTagsList(rawTags = []) {
  if (!Array.isArray(rawTags)) return [];
  return rawTags
    .filter((tag) => typeof tag === "string")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index)
    .slice(0, 30);
}

export function validateSubtitleEntries(subtitles = []) {
  if (!Array.isArray(subtitles)) {
    return [{ _error: "Daftar subtitle harus berupa array." }];
  }

  const errors = [];

  subtitles.forEach((item, index) => {
    const entryErrors = {};

    if (!item || typeof item !== "object") {
      errors[index] = { _error: "Format subtitle tidak valid." };
      return;
    }

    if (typeof item.lang !== "string" || !item.lang.trim()) {
      entryErrors.lang = "Kode bahasa wajib diisi.";
    }

    if (typeof item.label !== "string" || item.label.trim().length < 2) {
      entryErrors.label = "Label subtitle minimal 2 karakter.";
    }

    if (!item.url || typeof item.url !== "string" || !ensureHttps(item.url)) {
      entryErrors.url = "URL subtitle tidak valid.";
    }

    if (Object.keys(entryErrors).length) {
      errors[index] = entryErrors;
    }
  });

  return errors.length ? errors : null;
}

function validateCommonMediaFields(payload, errors) {
  if (payload.rating !== undefined && payload.rating !== null && payload.rating !== "") {
    const num = Number(payload.rating);
    if (!Number.isFinite(num) || num < 0 || num > 10) {
      errors.rating = "Rating harus berupa angka antara 0 hingga 10.";
    }
  }

  if (payload.releaseYear !== undefined && payload.releaseYear !== null && payload.releaseYear !== "") {
    const year = Number(payload.releaseYear);
    const maxYear = new Date().getFullYear() + 5;
    if (!Number.isInteger(year) || year < 1888 || year > maxYear) {
      errors.releaseYear = `Tahun rilis harus antara 1888 dan ${maxYear}.`;
    }
  }

  if (payload.duration !== undefined && payload.duration !== null && payload.duration !== "") {
    const dur = Number(payload.duration);
    if (!Number.isFinite(dur) || dur < 0) {
      errors.duration = "Durasi harus berupa angka non-negatif.";
    }
  }

  if (payload.slug !== undefined && payload.slug !== null && payload.slug !== "") {
    if (typeof payload.slug !== "string" || payload.slug.trim().length > 150) {
      errors.slug = "Slug harus berupa string maksimal 150 karakter.";
    }
  }

  if (payload.tags !== undefined && payload.tags !== null) {
    if (!Array.isArray(payload.tags) || payload.tags.length > 30 || payload.tags.some((t) => typeof t !== "string" || t.trim().length > 50)) {
      errors.tags = "Tags maksimal 30 item (masing-masing maksimal 50 karakter).";
    }
  }

  if (payload.genres !== undefined && payload.genres !== null) {
    if (Array.isArray(payload.genres)) {
      if (payload.genres.length > 20 || payload.genres.some((g) => typeof g !== "string" || g.trim().length > 50)) {
        errors.genres = "Genres maksimal 20 item (masing-masing maksimal 50 karakter).";
      }
    } else if (typeof payload.genres !== "string" || payload.genres.length > 500) {
      errors.genres = "Genres tidak valid.";
    }
  }

  if (payload.cast !== undefined && payload.cast !== null) {
    if (Array.isArray(payload.cast)) {
      if (payload.cast.length > 50 || payload.cast.some((c) => typeof c !== "string" || c.trim().length > 100)) {
        errors.cast = "Cast maksimal 50 item (masing-masing maksimal 100 karakter).";
      }
    } else if (typeof payload.cast !== "string" || payload.cast.length > 2000) {
      errors.cast = "Cast tidak valid.";
    }
  }

  if (typeof payload.thumbnail === "string" && payload.thumbnail.trim() && !ensureHttps(payload.thumbnail)) {
    errors.thumbnail = "URL thumbnail tidak valid.";
  }

  if (typeof payload.backdropUrl === "string" && payload.backdropUrl.trim() && !ensureHttps(payload.backdropUrl)) {
    errors.backdropUrl = "URL backdrop tidak valid.";
  }

  if (typeof payload.trailer === "string" && payload.trailer.trim() && !ensureHttps(payload.trailer)) {
    errors.trailer = "URL trailer tidak valid.";
  }
}

export function validateMoviePayload(payload) {
  const errors = {};

  if (typeof payload.title !== "string" || payload.title.trim().length < 2) {
    errors.title = "Judul minimal 2 karakter.";
  }

  if (typeof payload.description !== "string" || payload.description.trim().length < 10) {
    errors.description = "Deskripsi minimal 10 karakter.";
  }

  if (!payload.category || typeof payload.category !== "string" || payload.category.trim().length < 2) {
    errors.category = "Kategori wajib diisi.";
  }

  const playback = payload.mux_playback_id ?? payload.mux_video_id;
  if (!playback || typeof playback !== "string" || !playback.trim()) {
    errors.mux_playback_id = "Playback ID utama wajib diisi.";
  }

  validateCommonMediaFields(payload, errors);

  if (payload.subtitles) {
    const subtitleErrors = validateSubtitleEntries(payload.subtitles);
    if (subtitleErrors) {
      errors.subtitles = subtitleErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function validateEpisodePayload(episode, index = 0) {
  const errors = {};

  if (
    episode.seasonNumber !== undefined &&
    (!Number.isInteger(episode.seasonNumber) || !Number.isFinite(episode.seasonNumber) || episode.seasonNumber < 1)
  ) {
    errors.seasonNumber = "Nomor season harus berupa angka bulat minimal 1.";
  }

  if (!Number.isInteger(episode.epNumber) || !Number.isFinite(episode.epNumber) || episode.epNumber < 1) {
    errors.epNumber = "Nomor episode harus berupa angka bulat lebih besar dari 0.";
  }

  if (typeof episode.title !== "string" || episode.title.trim().length < 2) {
    errors.title = "Judul episode minimal 2 karakter.";
  }

  if (typeof episode.description !== "string" || episode.description.trim().length < 10) {
    errors.description = "Deskripsi episode minimal 10 karakter.";
  }

  const playback = episode.mux_playback_id ?? episode.mux_video_id;
  if (!playback || typeof playback !== "string" || !playback.trim()) {
    errors.mux_playback_id = "Playback ID episode wajib diisi.";
  }

  if (episode.duration !== undefined && episode.duration !== null && episode.duration !== "") {
    const dur = Number(episode.duration);
    if (!Number.isFinite(dur) || dur < 0) {
      errors.duration = "Durasi episode harus berupa angka non-negatif.";
    }
  }

  if (typeof episode.thumbnail === "string" && episode.thumbnail.trim() && !ensureHttps(episode.thumbnail)) {
    errors.thumbnail = "URL thumbnail episode tidak valid.";
  }

  if (episode.subtitles) {
    const subtitleErrors = validateSubtitleEntries(episode.subtitles);
    if (subtitleErrors) {
      errors.subtitles = subtitleErrors;
    }
  }

  return Object.keys(errors).length ? { index, errors } : null;
}

export function validateSeriesPayload(payload) {
  const errors = {};

  if (typeof payload.title !== "string" || payload.title.trim().length < 2) {
    errors.title = "Judul minimal 2 karakter.";
  }

  if (typeof payload.description !== "string" || payload.description.trim().length < 10) {
    errors.description = "Deskripsi minimal 10 karakter.";
  }

  if (!payload.category || typeof payload.category !== "string" || payload.category.trim().length < 2) {
    errors.category = "Kategori wajib diisi.";
  }

  validateCommonMediaFields(payload, errors);

  if (payload.episodes !== undefined && !Array.isArray(payload.episodes)) {
    errors.episodes = "Daftar episode harus berupa array.";
  } else if (Array.isArray(payload.episodes) && payload.episodes.length > 0) {
    const episodeErrors = payload.episodes
      .map((episode, index) => validateEpisodePayload(episode, index))
      .filter(Boolean);

    if (episodeErrors.length) {
      errors.episodes = episodeErrors;
    }
  }

  if (payload.subtitles) {
    const subtitleErrors = validateSubtitleEntries(payload.subtitles);
    if (subtitleErrors) {
      errors.subtitles = subtitleErrors;
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function assertContentType(type) {
  return [CONTENT_TYPES.MOVIE, CONTENT_TYPES.SERIES].includes(type);
}

export function validateEpisode(episode) {
  const result = validateEpisodePayload(episode, 0);
  if (!result) {
    return { valid: true, errors: {} };
  }
  return { valid: false, errors: result.errors };
}
