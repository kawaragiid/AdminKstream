import { CONTENT_CATEGORIES, CONTENT_TYPES } from "./constants";

export function ensureHttps(url) {
  if (!url) return url;
  if (url.startsWith("https://")) return url;
  if (url.startsWith("http://")) return url.replace("http://", "https://");
  return `https://${url}`;
}

export function sanitizeTagsList(rawTags = []) {
  return rawTags
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
    .filter((tag, index, arr) => arr.indexOf(tag) === index);
}

export function validateSubtitleEntries(subtitles = []) {
  const errors = [];

  subtitles.forEach((item, index) => {
    const entryErrors = {};

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

  if (!payload.category || !CONTENT_CATEGORIES.includes(payload.category)) {
    errors.category = "Kategori tidak valid.";
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

  if (!payload.category || !CONTENT_CATEGORIES.includes(payload.category)) {
    errors.category = "Kategori tidak valid.";
  }

  if (!Array.isArray(payload.episodes) || !payload.episodes.length) {
    errors.episodes = "Series wajib memiliki minimal 1 episode.";
  } else {
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
