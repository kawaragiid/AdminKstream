import StatCard from "@/components/dashboard/StatCard";
import AnalyticsChart from "@/components/analytics/AnalyticsChart";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ActiveUsersCard from "@/components/analytics/ActiveUsersCard";
import AudienceSplitPie from "@/components/analytics/AudienceSplitPie";
import AverageWatchCard from "@/components/analytics/AverageWatchCard";
import MuxCostMonitor from "@/components/analytics/MuxCostMonitor";
import { getMuxCostReport } from "@/lib/muxService";
import {
  fetchAnalyticsSummary,
  fetchTrendingSeries,
  fetchActiveUsers,
  fetchAudienceSplit,
  fetchAverageWatchDuration,
} from "@/lib/analyticsService";
import { formatNumber, formatPercentage } from "@/utils/formatters";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [summary, trending, activeUsers, audienceSplit, averageWatch, muxReport] = await Promise.all([
    fetchAnalyticsSummary(),
    fetchTrendingSeries({ limit: 5 }),
    fetchActiveUsers(),
    fetchAudienceSplit(),
    fetchAverageWatchDuration(),
    getMuxCostReport().catch(() => null),
  ]);

  const stats = [
    {
      icon: "🎬",
      label: "Total Views",
      value: summary.totals.views,
      change: summary.growth.views,
      helper: `${formatNumber(summary.totals.views, { compact: true })} tayangan total`,
    },
    {
      icon: "⏱️",
      label: "Watch Time (menit)",
      value: summary.totals.watchTime,
      change: summary.growth.watchTime,
      helper: "Watch time akumulatif",
    },
    {
      icon: "👥",
      label: "Subscribers",
      value: summary.totals.subscribers,
      change: summary.growth.subscribers,
      helper: "Subscriber terbaru 30 hari",
    },
    {
      icon: "💳",
      label: "Revenue (IDR)",
      value: summary.totals.revenue,
      change: summary.growth.revenue,
      helper: "Estimasi pendapatan",
      isCurrency: true,
    },
  ];

  return (
    <div className="space-y-8">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      {muxReport && <MuxCostMonitor initialReport={muxReport} />}

      <section className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-100">Trend penayangan</h2>
              <p className="text-xs text-slate-400">14 hari terakhir</p>
            </div>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
              Live
            </span>
          </div>
          <div className="mt-6">
            <AnalyticsChart data={summary.trend} />
          </div>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6">
          <h2 className="text-lg font-semibold text-slate-100">Top konten</h2>
          <p className="text-xs text-slate-400">Konten dengan performa terbaik saat ini.</p>
          <div className="mt-4">
            <AnalyticsTable items={summary.topContent.slice(0, 5)} />
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <ActiveUsersCard activeUsers={activeUsers} />
        <AverageWatchCard duration={averageWatch} />
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr_3fr]">
        <AudienceSplitPie split={audienceSplit} />
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6">
          <h3 className="text-lg font-semibold text-slate-100">Trending Film/Series</h3>
          <p className="text-xs text-slate-400">Top 5 konten dengan pertumbuhan views tertinggi.</p>
          <div className="mt-4 space-y-3">
            {trending.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 transition-colors hover:border-slate-700"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    #{index + 1} {item.title}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatNumber(item.views)} views total
                  </p>
                </div>
                <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 tabular-nums">
                  {formatPercentage(item.growth)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
