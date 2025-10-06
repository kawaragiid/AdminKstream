import AnalyticsChart from "@/components/analytics/AnalyticsChart";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ActiveUsersCard from "@/components/analytics/ActiveUsersCard";
import AudienceSplitPie from "@/components/analytics/AudienceSplitPie";
import AverageWatchCard from "@/components/analytics/AverageWatchCard";
import {
  fetchAnalyticsSummary,
  fetchTrendingSeries,
  fetchActiveUsers,
  fetchAudienceSplit,
  fetchAverageWatchDuration,
} from "@/lib/analyticsService";
import { formatNumber, formatPercentage } from "@/utils/formatters";

export const metadata = {
  title: "Analytics",
};

export default async function AnalyticsPage() {
  const [summary, trending, activeUsers, audienceSplit, averageWatch] = await Promise.all([
    fetchAnalyticsSummary(),
    fetchTrendingSeries({ limit: 10 }),
    fetchActiveUsers(),
    fetchAudienceSplit(),
    fetchAverageWatchDuration(),
  ]);

  const ctrAverage = summary.topContent.length
    ? summary.topContent.reduce((total, item) => total + (item.ctr ?? 0), 0) /
      summary.topContent.length
    : 0;

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Statistik & Analitik</h2>
        <p className="text-sm text-slate-400">
          Pantau metrik kunci untuk memaksimalkan performa konten dan kepuasan pengguna.
        </p>
      </header>

      <section className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-sm text-slate-400">Total Views 14 hari</p>
            <p className="text-3xl font-semibold text-slate-100">
              {formatNumber(summary.totals.views, { compact: true })}
            </p>
          </div>
          <div className="flex items-center gap-3 text-sm text-emerald-400">
            <span>Growth</span>
            <span>{formatPercentage(summary.growth.views)}</span>
          </div>
        </div>
        <div className="mt-6">
          <AnalyticsChart data={summary.trend} />
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-slate-100">Kinerja Utama</h3>
          <dl className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Watch Time</dt>
              <dd className="text-xl font-semibold text-slate-100">
                {formatNumber(summary.totals.watchTime, { compact: true })} menit
              </dd>
              <p className="text-xs text-slate-500">
                {formatPercentage(summary.growth.watchTime)} dari periode sebelumnya
              </p>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Subscribers</dt>
              <dd className="text-xl font-semibold text-slate-100">
                {formatNumber(summary.totals.subscribers, { compact: true })}
              </dd>
              <p className="text-xs text-slate-500">
                {formatPercentage(summary.growth.subscribers)} dari periode sebelumnya
              </p>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">Revenue (IDR)</dt>
              <dd className="text-xl font-semibold text-slate-100">
                Rp {formatNumber(summary.totals.revenue, { compact: true })}
              </dd>
              <p className="text-xs text-slate-500">
                {formatPercentage(summary.growth.revenue)} dari periode sebelumnya
              </p>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-slate-500">CTR rata-rata</dt>
              <dd className="text-xl font-semibold text-slate-100">
                {formatPercentage(ctrAverage)}
              </dd>
              <p className="text-xs text-slate-500">Rata-rata dari top 10 konten</p>
            </div>
          </dl>
        </div>
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-slate-100">Top Konten</h3>
          <p className="text-xs text-slate-500">
            5 konten dengan performa terbaik berdasarkan views dan watch time.
          </p>
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
        <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
          <h3 className="text-lg font-semibold text-slate-100">Trending Film/Series</h3>
          <p className="text-xs text-slate-500">Top 10 konten dengan pertumbuhan views tertinggi.</p>
          <div className="mt-4 space-y-3">
            {trending.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/60 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-100">
                    #{index + 1} {item.title}
                  </p>
                  <p className="text-xs text-slate-500">{formatNumber(item.views)} views</p>
                </div>
                <span className="text-xs font-semibold text-emerald-400">
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
