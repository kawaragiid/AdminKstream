import { ensureNeonSchema, getSql, isNeonConfigured } from "./neonDb";

const ZERO_SUMMARY = {
  totals: { views: 0, watchTime: 0, subscribers: 0, revenue: 0 },
  growth: { views: 0, watchTime: 0, subscribers: 0, revenue: 0 },
  trend: [],
  trending: [],
  topContent: [],
  activeUsers: { daily: 0, weekly: 0, monthly: 0 },
  avgWatchDuration: { perUser: 0, perSession: 0 },
  audienceSplit: { free: 0, premium: 0 },
};

const ANALYTICS_CACHE_TTL_MS = 60_000;
let cachedSummary = null;
let cacheExpiresAt = 0;
let inflightSummaryPromise = null;

async function fetchAnalyticsDocument() {
  if (!isNeonConfigured()) {
    return ZERO_SUMMARY;
  }

  const now = Date.now();
  if (cachedSummary && now < cacheExpiresAt) {
    return cachedSummary;
  }

  if (inflightSummaryPromise) {
    return inflightSummaryPromise;
  }

  inflightSummaryPromise = (async () => {
    try {
      await ensureNeonSchema();
      const sql = getSql();
      const rows = await sql`SELECT data FROM analytics_snapshots WHERE id = 'summary' LIMIT 1`;
      const data = rows[0]?.data || {};

      let fallbackTop = [];
      let fallbackAudience = null;
      let fallbackSubscribers = 0;

      if (!Array.isArray(data.topContent) || data.topContent.length === 0) {
        const [topMovies, topSeries, userStats] = await Promise.all([
          sql`SELECT id, title, views, duration FROM movies ORDER BY views DESC NULLS LAST LIMIT 10`,
          sql`SELECT id, title, views FROM series ORDER BY views DESC NULLS LAST LIMIT 10`,
          sql`
            SELECT
              COUNT(*)::int AS total_users,
              COUNT(*) FILTER (WHERE LOWER(COALESCE(plan, 'free')) = 'premium')::int AS premium_users
            FROM users
          `,
        ]);
        fallbackTop = [
          ...topMovies.map((m) => ({
            id: m.id,
            title: m.title,
            type: "movie",
            views: Number(m.views || 0),
            watchTime: Math.round(Number(m.views || 0) * Math.max(1, Math.round((Number(m.duration || 0) || 1800) / 60) * 0.6)),
            ctr: 0,
          })),
          ...topSeries.map((s) => ({
            id: s.id,
            title: s.title,
            type: "series",
            views: Number(s.views || 0),
            watchTime: Math.round(Number(s.views || 0) * 18),
            ctr: 0,
          })),
        ]
          .sort((a, b) => b.views - a.views)
          .slice(0, 10);

        const totalUsers = Number(userStats[0]?.total_users || 0);
        fallbackSubscribers = Number(userStats[0]?.premium_users || 0);
        fallbackAudience = {
          free: Math.max(0, totalUsers - fallbackSubscribers),
          premium: fallbackSubscribers,
        };
      }

      const resolved = {
        ...ZERO_SUMMARY,
        ...data,
        totals: {
          ...ZERO_SUMMARY.totals,
          ...(data.totals || {}),
          ...(fallbackSubscribers && !data.totals?.subscribers ? { subscribers: fallbackSubscribers } : {}),
        },
        growth: { ...ZERO_SUMMARY.growth, ...(data.growth || {}) },
        activeUsers: { ...ZERO_SUMMARY.activeUsers, ...(data.activeUsers || {}) },
        avgWatchDuration: { ...ZERO_SUMMARY.avgWatchDuration, ...(data.avgWatchDuration || {}) },
        audienceSplit: {
          ...ZERO_SUMMARY.audienceSplit,
          ...(fallbackAudience || {}),
          ...(data.audienceSplit || {}),
        },
        trend: Array.isArray(data.trend) ? data.trend : [],
        trending: Array.isArray(data.trending) && data.trending.length
          ? data.trending
          : fallbackTop.filter((item) => item.type === "series").slice(0, 10),
        topContent: Array.isArray(data.topContent) && data.topContent.length
          ? data.topContent
          : fallbackTop,
      };
      cachedSummary = resolved;
      cacheExpiresAt = Date.now() + ANALYTICS_CACHE_TTL_MS;
      return resolved;
    } catch (error) {
      console.warn("[analyticsService] Gagal memuat analytics/summary (fallback ke cache/zero):", error?.message || error);
      return cachedSummary ?? ZERO_SUMMARY;
    } finally {
      inflightSummaryPromise = null;
    }
  })();

  return inflightSummaryPromise;
}

export async function fetchAnalyticsSummary() {
  return fetchAnalyticsDocument();
}

export async function fetchTrendData({ limit = 30 } = {}) {
  const summary = await fetchAnalyticsDocument();
  return summary.trend.slice(-limit);
}

export async function fetchTopContent({ limit = 5 } = {}) {
  const summary = await fetchAnalyticsDocument();
  return summary.topContent.slice(0, limit);
}

export async function fetchTrendingSeries({ limit = 10 } = {}) {
  const summary = await fetchAnalyticsDocument();
  return summary.trending.slice(0, limit);
}

export async function fetchAudienceSplit() {
  const summary = await fetchAnalyticsDocument();
  return summary.audienceSplit;
}

export async function fetchActiveUsers() {
  const summary = await fetchAnalyticsDocument();
  return summary.activeUsers;
}

export async function fetchAverageWatchDuration() {
  const summary = await fetchAnalyticsDocument();
  return summary.avgWatchDuration;
}
