import { ensureNeonSchema, getSql, isNeonConfigured } from "./neonDb";
import { CONTENT_CATEGORIES } from "@/utils/constants";

const FALLBACK_SETTINGS = {
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

export async function fetchPlatformSettings() {
  if (!isNeonConfigured()) {
    return FALLBACK_SETTINGS;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT data FROM platform_settings WHERE id = 'platform' LIMIT 1`;
  if (!rows.length) {
    return FALLBACK_SETTINGS;
  }

  return {
    ...FALLBACK_SETTINGS,
    ...(rows[0].data || {}),
  };
}

export async function updatePlatformSettings(payload) {
  const data = {
    categories: payload.categories ?? CONTENT_CATEGORIES,
    hero: payload.hero ?? FALLBACK_SETTINGS.hero,
    theme: payload.theme ?? FALLBACK_SETTINGS.theme,
    updatedAt: new Date().toISOString(),
  };

  if (!isNeonConfigured()) {
    Object.assign(FALLBACK_SETTINGS, data);
    return FALLBACK_SETTINGS;
  }

  await ensureNeonSchema();
  const sql = getSql();
  const existing = await sql`SELECT data FROM platform_settings WHERE id = 'platform' LIMIT 1`;
  const merged = { ...(existing[0]?.data || {}), ...data };
  await sql`
    INSERT INTO platform_settings (id, data, updated_at)
    VALUES ('platform', ${JSON.stringify(merged)}::jsonb, NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
  `;

  return merged;
}
