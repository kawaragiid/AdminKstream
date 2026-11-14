import { getFirestoreClient, isFirebaseConfigured } from "./firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

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
  if (!isFirebaseConfigured) {
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
      const firestore = getFirestoreClient();
      const doc = await firestore
        .collection(FIRESTORE_COLLECTIONS.ANALYTICS)
        .doc("summary")
        .get();

      if (!doc.exists) {
        cachedSummary = ZERO_SUMMARY;
        cacheExpiresAt = Date.now() + ANALYTICS_CACHE_TTL_MS;
        return ZERO_SUMMARY;
      }

      const data = doc.data() || {};
      const resolved = {
        ...ZERO_SUMMARY,
        ...data,
        totals: { ...ZERO_SUMMARY.totals, ...(data.totals || {}) },
        growth: { ...ZERO_SUMMARY.growth, ...(data.growth || {}) },
        activeUsers: { ...ZERO_SUMMARY.activeUsers, ...(data.activeUsers || {}) },
        avgWatchDuration: { ...ZERO_SUMMARY.avgWatchDuration, ...(data.avgWatchDuration || {}) },
        audienceSplit: { ...ZERO_SUMMARY.audienceSplit, ...(data.audienceSplit || {}) },
        trend: Array.isArray(data.trend) ? data.trend : [],
        trending: Array.isArray(data.trending) ? data.trending : [],
        topContent: Array.isArray(data.topContent) ? data.topContent : [],
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
