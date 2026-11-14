import Link from "next/link";
import StatCard from "@/components/dashboard/StatCard";
import MuxCostMonitor from "@/components/analytics/MuxCostMonitor";
import { fetchAnalyticsSummary } from "@/lib/analyticsService";
import { getMuxCostReport } from "@/lib/muxService";
import { formatNumber } from "@/utils/formatters";

export const metadata = {
  title: "Dashboard",
};

export default async function DashboardPage() {
  const [summaryResult, muxReport] = await Promise.all([
    fetchAnalyticsSummary().catch((err) => {
      console.error("Gagal memuat ringkasan analitik:", err);
      return null;
    }),
    getMuxCostReport().catch(() => null),
  ]);

  const summaryError = summaryResult === null;
  const summary = summaryResult ?? {
    totals: {
      views: null,
      watchTime: null,
      subscribers: null,
      revenue: null,
    },
    growth: {
      views: null,
      watchTime: null,
      subscribers: null,
      revenue: null,
    },
  };

  const stats = [
    {
      icon: "🎬",
      label: "Total Views",
      value: summary.totals.views,
      change: summary.growth.views,
      helper:
        summary.totals.views !== null
          ? `${formatNumber(summary.totals.views, { compact: true })} tayangan total`
          : "Data tidak tersedia",
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
    <div className="space-y-6">
      {summaryError && (
        <div
          role="alert"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200"
        >
          Ringkasan analitik gagal dimuat dari database. Menampilkan status fallback.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <StatCard key={stat.label} {...stat} />
        ))}
      </section>

      {muxReport ? (
        <MuxCostMonitor initialReport={muxReport} mode="summary" />
      ) : (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 px-5 py-4 text-xs text-slate-400">
          Laporan biaya &amp; kuota Mux saat ini tidak tersedia. Periksa konfigurasi Mux atau coba muat ulang nanti.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/upload"
          className="group rounded-2xl border border-slate-800/80 bg-slate-900/75 p-5 transition hover:border-primary-500/40 hover:bg-slate-900"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-primary-300">Aksi Cepat</p>
          <p className="mt-1 text-base font-semibold text-slate-100 group-hover:text-white">
            + Upload Movie / Series
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Upload langsung ke Mux dengan Basic Quality &amp; Max 1080p.
          </p>
        </Link>

        <Link
          href="/content"
          className="group rounded-2xl border border-slate-800/80 bg-slate-900/75 p-5 transition hover:border-slate-700 hover:bg-slate-900"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Katalog</p>
          <p className="mt-1 text-base font-semibold text-slate-100 group-hover:text-white">
            Kelola Konten &amp; Episode
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Cek status Mux, edit metadata, subtitle, dan playback ID.
          </p>
        </Link>

        <Link
          href="/analytics"
          className="group rounded-2xl border border-slate-800/80 bg-slate-900/75 p-5 transition hover:border-slate-700 hover:bg-slate-900"
        >
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Analitik Mendalam</p>
          <p className="mt-1 text-base font-semibold text-slate-100 group-hover:text-white">
            Lihat Chart &amp; Audit Mux
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Trend 14 hari, Top Konten, Active Users, dan rincian asset Mux.
          </p>
        </Link>
      </section>
    </div>
  );
}
