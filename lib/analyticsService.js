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

async function fetchAnalyticsDocument() {
  if (!isFirebaseConfigured) {
    return ZERO_SUMMARY;
  }

  const firestore = getFirestoreClient();
  const doc = await firestore
    .collection(FIRESTORE_COLLECTIONS.ANALYTICS)
    .doc("summary")
    .get();

  if (!doc.exists) {
    return ZERO_SUMMARY;
  }

  const data = doc.data() || {};
  // Ensure all numeric fields present default to 0
  return {
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
