import { redirect } from "next/navigation";
import AnalyticsTabs from "@/components/analytics/AnalyticsTabs";
import {
  fetchAnalyticsSummary,
  fetchTrendingSeries,
  fetchActiveUsers,
  fetchAudienceSplit,
  fetchAverageWatchDuration,
} from "@/lib/analyticsService";
import { getMuxCostReport } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";
import { ADMIN_ROLES } from "@/utils/constants";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  if (![ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN].includes(session.role)) {
    redirect("/");
  }

  const [summary, trending, activeUsers, audienceSplit, averageWatch, muxReport] = await Promise.all([
    fetchAnalyticsSummary(),
    fetchTrendingSeries({ limit: 10 }),
    fetchActiveUsers(),
    fetchAudienceSplit(),
    fetchAverageWatchDuration(),
    getMuxCostReport().catch(() => null),
  ]);

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Statistik &amp; Audit Platform</h2>
        <p className="text-sm text-slate-400">
          Pantau performa konten, audiens, dan rincian lengkap penggunaan &amp; biaya Mux.
        </p>
      </header>

      <AnalyticsTabs
        summary={summary}
        trending={trending}
        activeUsers={activeUsers}
        audienceSplit={audienceSplit}
        averageWatch={averageWatch}
        muxReport={muxReport}
      />
    </div>
  );
}
