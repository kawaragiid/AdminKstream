import { CONTENT_CATEGORIES, CONTENT_TYPES } from "./constants";

export function ensureHttps(url) {
  if (url === null || url === undefined) return null;
  const trimmed = String(url).trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("https://") || trimmed.startsWith("/") || trimmed.startsWith("data:")) return trimmed;
  if (trimmed.startsWith("http://")) return trimmed.replace("http://", "https://");
  return `https://${trimmed}`;
}

export function sanitizeTagsList(rawTags = []) {
  return rawTags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);
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

    if (!item.lang || typeof item.lang !== "string") {
      entryErrors.lang = "Kode bahasa wajib diisi.";
    }

    if (!item.label || item.label.trim().length < 2) {
      entryErrors.label = "Label subtitle minimal 2 karakter.";
    }

    if (!item.url || typeof item.url !== "string") {
      entryErrors.url = "URL subtitle wajib disediakan.";
    }

    if (Object.keys(entryErrors).length) {
      errors[index] = entryErrors;
    }
  });

  return errors.length ? errors : null;
}

export function validateMoviePayload(payload) {
  const errors = {};

  if (!payload.title || payload.title.trim().length < 2) {
    errors.title = "Judul minimal 2 karakter.";
  }

  if (!payload.description || payload.description.trim().length < 10) {
    errors.description = "Deskripsi minimal 10 karakter.";
  }

  if (!payload.category || typeof payload.category !== "string" || payload.category.trim().length < 2) {
    errors.category = "Kategori wajib diisi.";
  }

  const playback = payload.mux_playback_id ?? payload.mux_video_id;
  if (!playback || typeof playback !== "string") {
    errors.mux_playback_id = "Playback ID utama wajib diisi.";
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

export function validateEpisodePayload(episode, index = 0) {
  const errors = {};

  if (episode.seasonNumber !== undefined && (typeof episode.seasonNumber !== "number" || episode.seasonNumber < 1)) {
    errors.seasonNumber = "Nomor season harus berupa angka minimal 1.";
  }

  if (typeof episode.epNumber !== "number" || episode.epNumber < 1) {
    errors.epNumber = "Nomor episode harus berupa angka lebih besar dari 0.";
  }

  if (!episode.title || episode.title.trim().length < 2) {
    errors.title = "Judul episode minimal 2 karakter.";
  }

  if (!episode.description || episode.description.trim().length < 10) {
    errors.description = "Deskripsi episode minimal 10 karakter.";
  }

  const playback = episode.mux_playback_id ?? episode.mux_video_id;
  if (!playback || typeof playback !== "string") {
    errors.mux_playback_id = "Playback ID episode wajib diisi.";
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

  if (!payload.title || payload.title.trim().length < 2) {
    errors.title = "Judul minimal 2 karakter.";
  }

  if (!payload.description || payload.description.trim().length < 10) {
    errors.description = "Deskripsi minimal 10 karakter.";
  }

  if (!payload.category || typeof payload.category !== "string" || payload.category.trim().length < 2) {
    errors.category = "Kategori wajib diisi.";
  }

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
