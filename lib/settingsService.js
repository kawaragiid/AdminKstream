import { ensureNeonSchema, getSql, isNeonConfigured, withTransaction } from "./neonDb";
import { CONTENT_CATEGORIES } from "@/utils/constants";
import { ensureHttps } from "@/utils/validators";

const DEFAULT_SETTINGS = {
  categories: CONTENT_CATEGORIES,
  hero: {
    contentId: "demo-1",
    title: "Final Tournament Stream",
    subtitle: "Tonton pertandingan final yang paling epic minggu ini!",
    backgroundUrl: "https://images.unsplash.com/photo-1525182008055-f88b95ff7980",
  },
  theme: {
    mode: "dark",
  },
};

let inMemorySettings = structuredClone(DEFAULT_SETTINGS);

const VALID_THEME_MODES = new Set(["dark", "light", "system"]);

function validateAndNormalizeSettingsPatch(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    const err = new Error("Payload pengaturan tidak valid.");
    err.statusCode = 400;
    throw err;
  }

  const patch = {};

  if (payload.categories !== undefined) {
    if (!Array.isArray(payload.categories) || payload.categories.some((c) => typeof c !== "string" || !c.trim())) {
      const err = new Error("categories harus berupa array string non-kosong.");
      err.statusCode = 400;
      throw err;
    }
    patch.categories = [...new Set(payload.categories.map((c) => c.trim()))];
  }

  if (payload.hero !== undefined) {
    if (!payload.hero || typeof payload.hero !== "object" || Array.isArray(payload.hero)) {
      const err = new Error("hero harus berupa objek.");
      err.statusCode = 400;
      throw err;
    }
    const heroPatch = {};
    if (payload.hero.contentId !== undefined) {
      heroPatch.contentId = typeof payload.hero.contentId === "string" ? payload.hero.contentId.trim() : "";
    }
    if (payload.hero.title !== undefined) {
      heroPatch.title = typeof payload.hero.title === "string" ? payload.hero.title.trim().slice(0, 200) : "";
    }
    if (payload.hero.subtitle !== undefined) {
      heroPatch.subtitle = typeof payload.hero.subtitle === "string" ? payload.hero.subtitle.trim().slice(0, 400) : "";
    }
    if (payload.hero.backgroundUrl !== undefined) {
      const rawBg = payload.hero.backgroundUrl;
      const safeBg = rawBg ? ensureHttps(rawBg) : "";
      if (rawBg && !safeBg) {
        const err = new Error("URL background hero tidak valid.");
        err.statusCode = 400;
        throw err;
      }
      heroPatch.backgroundUrl = safeBg || "";
    }
    if (payload.hero.mode !== undefined) {
      heroPatch.mode = typeof payload.hero.mode === "string" ? payload.hero.mode.trim().slice(0, 40) : "";
    }
    if (payload.hero.badge !== undefined) {
      heroPatch.badge = typeof payload.hero.badge === "string" ? payload.hero.badge.trim().slice(0, 80) : "";
    }
    patch.hero = heroPatch;
  }

  if (payload.theme !== undefined) {
    if (!payload.theme || typeof payload.theme !== "object" || Array.isArray(payload.theme)) {
      const err = new Error("theme harus berupa objek.");
      err.statusCode = 400;
      throw err;
    }
    const mode = String(payload.theme.mode || "dark").toLowerCase();
    if (!VALID_THEME_MODES.has(mode)) {
      const err = new Error("Mode tema tidak valid (gunakan dark, light, atau system).");
      err.statusCode = 400;
      throw err;
    }
    patch.theme = { mode };
  }

  return patch;
}

export async function fetchPlatformSettings() {
  if (!isNeonConfigured()) {
    return structuredClone(inMemorySettings);
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT data FROM platform_settings WHERE id = 'platform' LIMIT 1`;
  if (!rows.length) {
    return structuredClone(DEFAULT_SETTINGS);
  }

  return {
    ...structuredClone(DEFAULT_SETTINGS),
    ...(rows[0].data || {}),
  };
}

export async function updatePlatformSettings(payload = {}) {
  const patch = validateAndNormalizeSettingsPatch(payload);
  const updatedAt = new Date().toISOString();

  if (!isNeonConfigured()) {
    inMemorySettings = {
      ...inMemorySettings,
      ...patch,
      ...(patch.hero ? { hero: { ...(inMemorySettings.hero || {}), ...patch.hero } } : {}),
      ...(patch.theme ? { theme: { ...(inMemorySettings.theme || {}), ...patch.theme } } : {}),
      updatedAt,
    };
    return structuredClone(inMemorySettings);
  }

  await ensureNeonSchema();
  return withTransaction(async (tx) => {
    const existing = await tx`SELECT data FROM platform_settings WHERE id = 'platform' FOR UPDATE`;
    const current = existing[0]?.data || {};
    const defaults = structuredClone(DEFAULT_SETTINGS);
    const merged = {
      ...defaults,
      ...current,
      ...patch,
      ...(patch.hero
        ? {
            hero: {
              ...defaults.hero,
              ...(current.hero || {}),
              ...patch.hero,
            },
          }
        : {}),
      ...(patch.theme
        ? {
            theme: {
              ...defaults.theme,
              ...(current.theme || {}),
              ...patch.theme,
            },
          }
        : {}),
      updatedAt,
    };
    await tx`
      INSERT INTO platform_settings (id, data, updated_at)
      VALUES ('platform', ${JSON.stringify(merged)}::jsonb, NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
    `;
    return merged;
  });
}
