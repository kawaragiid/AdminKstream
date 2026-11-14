"use client";

import { useState } from "react";
import AnalyticsChart from "@/components/analytics/AnalyticsChart";
import AnalyticsTable from "@/components/analytics/AnalyticsTable";
import ActiveUsersCard from "@/components/analytics/ActiveUsersCard";
import AudienceSplitPie from "@/components/analytics/AudienceSplitPie";
import AverageWatchCard from "@/components/analytics/AverageWatchCard";
import MuxCostMonitor from "@/components/analytics/MuxCostMonitor";
import { formatNumber, formatPercentage } from "@/utils/formatters";

const TABS = [
  { id: "performance", label: "Performa Konten & Penonton" },
  { id: "mux-audit", label: "Audit & Biaya Mux Lengkap" },
];

export default function AnalyticsTabs({
  summary,
  trending,
  activeUsers,
  audienceSplit,
  averageWatch,
  muxReport,
}) {
  const [activeTab, setActiveTab] = useState("performance");

  const ctrAverage = summary?.topContent?.length
    ? summary.topContent.reduce((total, item) => total + (item?.ctr ?? 0), 0) /
      summary.topContent.length
    : 0;

  return (
    <div className="space-y-6">
      <div className="inline-flex flex-wrap gap-2 rounded-2xl border border-slate-800/80 bg-slate-900/75 p-1.5">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-primary-600 text-white shadow-sm shadow-primary-600/30"
                  : "text-slate-300 hover:bg-slate-800/70"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === "performance" ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-slate-400">Total Views 14 hari</p>
                <p className="mt-1 text-3xl font-semibold text-slate-100 tabular-nums">
                  {formatNumber(summary?.totals?.views ?? 0, { compact: true })}
                </p>
              </div>
              <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 tabular-nums">
                Growth {formatPercentage(summary?.growth?.views ?? 0)}
              </span>
            </div>
            <div className="mt-6">
              <AnalyticsChart data={summary?.trend ?? []} />
            </div>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6">
              <h3 className="text-lg font-semibold text-slate-100">Kinerja Utama</h3>
              <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4">
                  <dt className="text-xs uppercase tracking-wider text-slate-500">Watch Time</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-100 tabular-nums">
                    {formatNumber(summary?.totals?.watchTime ?? 0, { compact: true })} menit
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPercentage(summary?.growth?.watchTime ?? 0)} dari periode sebelumnya
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4">
                  <dt className="text-xs uppercase tracking-wider text-slate-500">Subscribers</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-100 tabular-nums">
                    {formatNumber(summary?.totals?.subscribers ?? 0, { compact: true })}
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPercentage(summary?.growth?.subscribers ?? 0)} dari periode sebelumnya
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4">
                  <dt className="text-xs uppercase tracking-wider text-slate-500">Revenue (IDR)</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-100 tabular-nums">
                    Rp {formatNumber(summary?.totals?.revenue ?? 0, { compact: true })}
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatPercentage(summary?.growth?.revenue ?? 0)} dari periode sebelumnya
                  </p>
                </div>
                <div className="rounded-xl border border-slate-800/70 bg-slate-950/50 p-4">
                  <dt className="text-xs uppercase tracking-wider text-slate-500">CTR rata-rata</dt>
                  <dd className="mt-1 text-xl font-semibold text-slate-100 tabular-nums">
                    {formatPercentage(ctrAverage)}
                  </dd>
                  <p className="mt-1 text-xs text-slate-500">Rata-rata dari top 10 konten</p>
                </div>
              </dl>
            </div>
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6">
              <h3 className="text-lg font-semibold text-slate-100">Top Konten</h3>
              <p className="text-xs text-slate-400">
                5 konten dengan performa terbaik berdasarkan views dan watch time.
              </p>
              <div className="mt-4">
                <AnalyticsTable items={(summary?.topContent ?? []).slice(0, 5)} />
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
              <p className="text-xs text-slate-400">Top 10 konten dengan pertumbuhan views tertinggi.</p>
              <div className="mt-4 space-y-2.5">
                {(trending ?? []).map((item, index) => (
                  <div
                    key={item?.id ?? index}
                    className="flex items-center justify-between rounded-xl border border-slate-800/80 bg-slate-950/60 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        #{index + 1} {item?.title ?? "-"}
                      </p>
                      <p className="text-xs text-slate-500 tabular-nums">{formatNumber(item?.views ?? 0)} views</p>
                    </div>
                    <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 tabular-nums">
                      {formatPercentage(item?.growth ?? 0)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      ) : (
        <div className="space-y-6">
          {muxReport ? (
            <MuxCostMonitor initialReport={muxReport} mode="full" />
          ) : (
            <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6 text-sm text-slate-400">
              Data laporan Mux belum tersedia.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
