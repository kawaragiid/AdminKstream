"use client";

import { useState } from "react";

function formatUsd(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "$0.00";
  return `$${num.toFixed(num > 0 && num < 0.01 ? 4 : 2)}`;
}

function formatMinutes(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString("id-ID");
}

export default function MuxCostMonitor({ initialReport }) {
  const [report, setReport] = useState(initialReport);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleRefresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/mux/usage", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || "Gagal memuat data Mux.");
      }
      if (json?.data) {
        setReport(json.data);
      }
    } catch (err) {
      setError(err?.message || "Gagal memperbarui data Mux.");
    } finally {
      setLoading(false);
    }
  };

  const s = report?.summary;
  const delivery = s?.delivery ?? {};
  const storageTiers = s?.storageTiers ?? {};
  const plusOrPremium = s?.plusOrPremium ?? { count: 0, minutes: 0, assets: [] };

  const deliveryQuotaPct = Math.min(
    100,
    Math.round(((delivery.totalMinutes ?? 0) / (delivery.freeQuotaMinutes || 100000)) * 1000) / 10
  );
  const creditUsed = Math.min(s?.creditTotalUsd ?? 20, s?.totalEstimatedUsageUsd ?? 0);
  const creditUsedPct = Math.min(
    100,
    Math.round((creditUsed / (s?.creditTotalUsd || 20)) * 1000) / 10
  );

  const tableRows = [
    { label: "Total assets", value: `${formatCount(s?.totalAssets)} video` },
    { label: "Total stored minutes", value: `${formatMinutes(s?.totalStoredMinutes)} menit` },
    {
      label: "Basic 720p",
      value: `${formatCount(s?.basic720p?.count)} asset (${formatMinutes(s?.basic720p?.minutes)} menit)`,
    },
    {
      label: "Basic 1080p",
      value: `${formatCount(s?.basic1080p?.count)} asset (${formatMinutes(s?.basic1080p?.minutes)} menit)`,
    },
    {
      label: "Basic Lainnya (<720p / >1080p)",
      value: `${formatCount(s?.basicOther?.count)} asset (${formatMinutes(s?.basicOther?.minutes)} menit)`,
    },
    {
      label: "Plus / Premium",
      value: `${formatCount(plusOrPremium.count)} asset (${formatMinutes(plusOrPremium.minutes)} menit)`,
      highlight: plusOrPremium.count > 0 ? "warning" : "ok",
    },
    {
      label: "Cold Storage (60% off, >90 hari)",
      value: storageTiers.availableFromApi
        ? `${formatCount(storageTiers.cold?.count)} asset (${formatMinutes(storageTiers.cold?.minutes)} menit)`
        : "Perlu cek manual di Mux Dashboard (API asset tidak menyertakan tier)",
    },
    {
      label: "Infrequent Storage (40% off, >30 hari)",
      value: storageTiers.availableFromApi
        ? `${formatCount(storageTiers.infrequent?.count)} asset (${formatMinutes(storageTiers.infrequent?.minutes)} menit)`
        : "Perlu cek manual di Mux Dashboard",
    },
    { label: "Monthly storage estimate", value: `${formatUsd(s?.storageEstimateUsd)} / bulan` },
    {
      label: "Delivery usage (bulan berjalan)",
      value: `${formatMinutes(delivery.totalMinutes)} / ${formatMinutes(delivery.freeQuotaMinutes)} menit gratis (sisa ${formatMinutes(delivery.remainingFreeMinutes)} menit)`,
    },
    {
      label: "Delivery cost (overage)",
      value: `${formatUsd(delivery.estimatedCostUsd)} (${formatMinutes(delivery.billableMinutes)} menit berbayar)`,
    },
    {
      label: "Remaining credit ($20 PAYG)",
      value: `${formatUsd(s?.remainingCreditUsd)} dari ${formatUsd(s?.creditTotalUsd)}`,
    },
    {
      label: "Estimated invoice",
      value: formatUsd(s?.estimatedInvoiceUsd),
      highlight: (s?.estimatedInvoiceUsd ?? 0) > 0 ? "warning" : "ok",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6 shadow-lg shadow-slate-950/30 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">
              Mux Cost &amp; Quota Monitoring (PAYG)
            </h2>
            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              Basic Quality • Max 1080p
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Pemantauan kapasitas simpan, kualitas encoding, kuota gratis 100.000 menit delivery, dan kredit $20/bulan.
            {report?.generatedAt && (
              <span className="ml-2 text-slate-500">
                • Diperbarui {new Date(report.generatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </p>
        </div>

        <button
          type="button"
          onClick={handleRefresh}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-700/80 bg-slate-800/80 px-3.5 py-2 text-xs font-medium text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
        >
          <span>{loading ? "Memuat..." : "↻ Refresh Data Mux"}</span>
        </button>
      </div>

      {!report?.configured && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
          Kredensial Mux (`MUX_TOKEN_ID` &amp; `MUX_TOKEN_SECRET`) belum dikonfigurasi di server. Data di bawah bernilai 0.
        </div>
      )}

      {error && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-xs text-rose-200">
          {error}
        </div>
      )}

      {report?.deliveryError && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200">
          Peringatan API Delivery Usage: {report.deliveryError}
        </div>
      )}

      {plusOrPremium.count > 0 && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-1">
          <p className="font-semibold">
            Terdeteksi {formatCount(plusOrPremium.count)} asset menggunakan tier Plus/Premium ({formatMinutes(plusOrPremium.minutes)} menit).
          </p>
          <p className="text-amber-200/80">
            Upload baru kini terkunci ke Basic Quality. Asset lama tidak diubah otomatis untuk menjaga Playback ID &amp; menghindari biaya re-encoding.
          </p>
        </div>
      )}

      {/* Ringkasan Kartu Utama */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Total Tersimpan</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">
            {formatMinutes(s?.totalStoredMinutes)} <span className="text-sm font-normal text-slate-400">menit</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatCount(s?.totalAssets)} total Mux asset</p>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Estimasi Storage / Bulan</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100">{formatUsd(s?.storageEstimateUsd)}</p>
          <p className="mt-1 text-xs text-slate-500">
            720p: {formatCount(s?.basic720p?.count)} • 1080p: {formatCount(s?.basic1080p?.count)}
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Sisa Kredit $20 PAYG</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400">{formatUsd(s?.remainingCreditUsd)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Terpakai est. {formatUsd(s?.totalEstimatedUsageUsd)} ({creditUsedPct}%)
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Estimasi Tagihan Akhir</p>
          <p
            className={`mt-1 text-2xl font-semibold ${
              (s?.estimatedInvoiceUsd ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {formatUsd(s?.estimatedInvoiceUsd)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Setelah kredit $20 &amp; 100rb mnt gratis</p>
        </div>
      </div>

      {/* Progress Bars Kuota Gratis & Kredit $20 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">Kuota Delivery Gratis (100.000 menit/bln)</span>
            <span className="text-slate-400">
              {formatMinutes(delivery.totalMinutes)} / 100.000 mnt ({deliveryQuotaPct}%)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                deliveryQuotaPct >= 90 ? "bg-amber-400" : "bg-emerald-400"
              }`}
              style={{ width: `${Math.min(100, deliveryQuotaPct)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Rincian: 720p/Audio {formatMinutes(delivery.tier720pMinutes)} mnt • 1080p {formatMinutes(delivery.tier1080pMinutes)} mnt
          </p>
        </div>

        <div className="rounded-2xl border border-slate-800/70 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">Pemakaian Kredit PAYG ($20 / bulan)</span>
            <span className="text-slate-400">
              {formatUsd(s?.totalEstimatedUsageUsd)} / $20.00 ({creditUsedPct}%)
            </span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all ${
                creditUsedPct >= 85 ? "bg-amber-400" : "bg-sky-400"
              }`}
              style={{ width: `${Math.min(100, creditUsedPct)}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-500">
            Storage est. {formatUsd(s?.storageEstimateUsd)} + Delivery est. {formatUsd(delivery.estimatedCostUsd)}
          </p>
        </div>
      </div>

      {/* Tabel Detail Metrik */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/40">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800/70 bg-slate-900/70 text-slate-400">
            <tr>
              <th className="px-4 py-3 font-medium">Informasi</th>
              <th className="px-4 py-3 font-medium">Nilai</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50">
            {tableRows.map((row) => (
              <tr key={row.label} className="hover:bg-slate-900/40">
                <td className="px-4 py-2.5 text-slate-300">{row.label}</td>
                <td
                  className={`px-4 py-2.5 font-medium ${
                    row.highlight === "warning"
                      ? "text-amber-300"
                      : row.highlight === "ok"
                        ? "text-emerald-300"
                        : "text-slate-100"
                  }`}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-slate-500">
        Catatan: Angka biaya dihitung berdasarkan tarif dasar PAYG Mux (Basic encoding $0, storage 720p $0.0024/mnt, 1080p $0.0030/mnt, delivery overage $0.0008–$0.0010/mnt). Data API `delivery-usage` diproses per batas jam sehingga bersifat estimasi; selalu cocokkan dengan invoice resmi di Mux Dashboard.
      </p>
    </section>
  );
}
