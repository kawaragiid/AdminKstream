"use client";

import { useState } from "react";

const USD_TO_IDR = 16000;

function formatUsd(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "$0.00";
  return `$${num.toFixed(num > 0 && num < 0.01 ? 4 : 2)}`;
}

function formatIdr(usdValue) {
  const idr = Math.round(Number(usdValue ?? 0) * USD_TO_IDR);
  return `Rp ${idr.toLocaleString("id-ID")}`;
}

function formatMinutes(value) {
  const num = Number(value ?? 0);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("id-ID", { maximumFractionDigits: 2 });
}

function formatCount(value) {
  return Number(value ?? 0).toLocaleString("id-ID");
}

export default function MuxCostMonitor({ initialReport, mode = "summary" }) {
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

  const m720 = s?.basic720p?.minutes ?? 0;
  const m1080 = s?.basic1080p?.minutes ?? 0;
  const mOther = s?.basicOther?.minutes ?? 0;
  const mPlus = plusOrPremium.minutes ?? 0;

  const cost720 = m720 * 0.0024;
  const cost1080 = m1080 * 0.003;
  const costOther = mOther * 0.0024;
  const costPlus = mPlus * 0.003;

  const deliveryQuotaPct = Math.min(
    100,
    Math.round(((delivery.totalMinutes ?? 0) / (delivery.freeQuotaMinutes || 100000)) * 1000) / 10
  );
  const creditTotal = s?.creditTotalUsd ?? 20;
  const totalUsage = s?.totalEstimatedUsageUsd ?? 0;
  const creditUsedPct = Math.min(100, Math.round((Math.min(creditTotal, totalUsage) / creditTotal) * 1000) / 10);

  const calculationSteps = [
    {
      title: "1. Encoding (Input Video Baru)",
      formula: `${formatMinutes(s?.totalStoredMinutes)} menit × $0.00 (Basic Quality)`,
      usd: 0,
      badge: "GRATIS",
      badgeTone: "emerald",
    },
    {
      title: "2. Storage 720p",
      formula: `${formatMinutes(m720)} menit × $0.0024 / mnt / bln`,
      usd: cost720,
    },
    {
      title: "3. Storage 1080p",
      formula: `${formatMinutes(m1080)} menit × $0.0030 / mnt / bln`,
      usd: cost1080,
    },
    ...(mOther > 0 || mPlus > 0
      ? [
          {
            title: "4. Storage Lainnya / Plus-Premium",
            formula: `${formatMinutes(mOther + mPlus)} menit × tarif resolusi`,
            usd: costOther + costPlus,
          },
        ]
      : []),
    {
      title: "5. Delivery Streaming (Kuota Gratis 100.000 mnt)",
      formula:
        (delivery.billableMinutes ?? 0) > 0
          ? `${formatMinutes(delivery.billableMinutes)} mnt berbayar × ~$0.0008–$0.0010`
          : `${formatMinutes(delivery.totalMinutes)} / 100.000 menit gratis terpakai`,
      usd: delivery.estimatedCostUsd ?? 0,
      badge: (delivery.billableMinutes ?? 0) === 0 ? "MASIH GRATIS" : undefined,
      badgeTone: "emerald",
    },
  ];

  const tableRows = [
    { label: "Total assets", value: `${formatCount(s?.totalAssets)} video` },
    { label: "Total stored minutes", value: `${formatMinutes(s?.totalStoredMinutes)} menit` },
    {
      label: "Basic 720p",
      value: `${formatCount(s?.basic720p?.count)} asset (${formatMinutes(m720)} menit)`,
    },
    {
      label: "Basic 1080p",
      value: `${formatCount(s?.basic1080p?.count)} asset (${formatMinutes(m1080)} menit)`,
    },
    {
      label: "Basic Lainnya (<720p / >1080p)",
      value: `${formatCount(s?.basicOther?.count)} asset (${formatMinutes(mOther)} menit)`,
    },
    {
      label: "Plus / Premium",
      value: `${formatCount(plusOrPremium.count)} asset (${formatMinutes(mPlus)} menit)`,
      highlight: plusOrPremium.count > 0 ? "warning" : "ok",
    },
    {
      label: "Cold Storage (60% off, >90 hari)",
      value: storageTiers.availableFromApi
        ? `${formatCount(storageTiers.cold?.count)} asset (${formatMinutes(storageTiers.cold?.minutes)} menit)`
        : "Cek manual di Mux Dashboard (API tidak menyertakan tier)",
    },
    {
      label: "Infrequent Storage (40% off, >30 hari)",
      value: storageTiers.availableFromApi
        ? `${formatCount(storageTiers.infrequent?.count)} asset (${formatMinutes(storageTiers.infrequent?.minutes)} menit)`
        : "Cek manual di Mux Dashboard",
    },
    {
      label: "Monthly storage estimate",
      value: `${formatUsd(s?.storageEstimateUsd)} (${formatIdr(s?.storageEstimateUsd)})`,
    },
    {
      label: "Delivery usage (bulan berjalan)",
      value: `${formatMinutes(delivery.totalMinutes)} / ${formatMinutes(delivery.freeQuotaMinutes)} menit gratis`,
    },
    {
      label: "Delivery cost (overage)",
      value: `${formatUsd(delivery.estimatedCostUsd)} (${formatMinutes(delivery.billableMinutes)} mnt berbayar)`,
    },
    {
      label: "Remaining credit ($20 PAYG)",
      value: `${formatUsd(s?.remainingCreditUsd)} (${formatIdr(s?.remainingCreditUsd)})`,
    },
    {
      label: "Estimated invoice",
      value: `${formatUsd(s?.estimatedInvoiceUsd)} (${formatIdr(s?.estimatedInvoiceUsd)})`,
      highlight: (s?.estimatedInvoiceUsd ?? 0) > 0 ? "warning" : "ok",
    },
  ];

  return (
    <section className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6 shadow-lg shadow-slate-950/30 space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-lg font-semibold tracking-tight text-slate-100">
              Estimasi &amp; Perhitungan Biaya Mux (PAYG)
            </h2>
            <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              Basic Quality • Max 1080p
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Kurs acuan estimasi: 1 USD = Rp {USD_TO_IDR.toLocaleString("id-ID")} • Kuota gratis 100.000 mnt delivery &amp; kredit $20/bulan.
            {report?.generatedAt && (
              <span className="ml-2 text-slate-500">
                • Update {new Date(report.generatedAt).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
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
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-200">
          Kredensial Mux (`MUX_TOKEN_ID` &amp; `MUX_TOKEN_SECRET`) belum dikonfigurasi di server.
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 p-4 text-xs text-rose-200">{error}</div>
      )}

      {plusOrPremium.count > 0 && (
        <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 p-4 text-xs text-amber-200 space-y-1">
          <p className="font-semibold">
            Terdeteksi {formatCount(plusOrPremium.count)} asset lama berstatus Plus/Premium ({formatMinutes(mPlus)} menit).
          </p>
          <p className="text-amber-200/80">
            Upload baru sudah terkunci ke Basic Quality. Asset lama dipertahankan agar Playback ID tidak berubah.
          </p>
        </div>
      )}

      {/* 4 Ringkasan Utama */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Total Video Tersimpan</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">
            {formatMinutes(s?.totalStoredMinutes)} <span className="text-sm font-normal text-slate-400">menit</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {formatCount(s?.totalAssets)} asset ({formatCount(s?.basic720p?.count)} 720p • {formatCount(s?.basic1080p?.count)} 1080p)
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Total Biaya Kotor (Sebelum Kredit)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-100 tabular-nums">{formatUsd(totalUsage)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatIdr(totalUsage)} / bulan</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Sisa Kredit $20 PAYG</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-400 tabular-nums">{formatUsd(s?.remainingCreditUsd)}</p>
          <p className="mt-1 text-xs text-slate-500">
            Terpakai {creditUsedPct}% ({formatIdr(s?.remainingCreditUsd)} tersisa)
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4">
          <p className="text-xs text-slate-400">Estimasi Tagihan Akhir</p>
          <p
            className={`mt-1 text-2xl font-semibold tabular-nums ${
              (s?.estimatedInvoiceUsd ?? 0) > 0 ? "text-amber-400" : "text-emerald-400"
            }`}
          >
            {formatUsd(s?.estimatedInvoiceUsd)}
          </p>
          <p className="mt-1 text-xs text-slate-500">{formatIdr(s?.estimatedInvoiceUsd)} setelah kredit $20</p>
        </div>
      </div>

      {/* Rincian Perhitungan Setiap Cost */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Rincian Perhitungan Biaya Bulan Ini
          </h3>
          <span className="text-[11px] text-slate-500">Otomatis dari data Mux API</span>
        </div>

        <div className="divide-y divide-slate-800/60">
          {calculationSteps.map((step) => (
            <div key={step.title} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-slate-200">{step.title}</span>
                  {step.badge && (
                    <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                      {step.badge}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 tabular-nums">{step.formula}</p>
              </div>
              <div className="text-right tabular-nums">
                <p className="font-semibold text-slate-100">{formatUsd(step.usd)}</p>
                <p className="text-[11px] text-slate-500">{formatIdr(step.usd)}</p>
              </div>
            </div>
          ))}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 text-xs">
            <div>
              <span className="font-semibold text-emerald-300">Potongan Kredit PAYG ($20.00 / bulan)</span>
              <p className="text-[11px] text-slate-400">
                Total Biaya ({formatUsd(totalUsage)}) - Kredit ($20.00)
              </p>
            </div>
            <div className="text-right tabular-nums">
              <p className="text-sm font-bold text-emerald-400">
                Tagihan: {formatUsd(s?.estimatedInvoiceUsd)}
              </p>
              <p className="text-[11px] text-slate-400">{formatIdr(s?.estimatedInvoiceUsd)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Bars */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">Kuota Delivery Gratis (100.000 mnt/bln)</span>
            <span className="text-slate-400 tabular-nums">
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
          <p className="text-[11px] text-slate-500 tabular-nums">
            720p/Audio: {formatMinutes(delivery.tier720pMinutes)} mnt • 1080p: {formatMinutes(delivery.tier1080pMinutes)} mnt
          </p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-200">Pemakaian Kredit PAYG ($20 / bln)</span>
            <span className="text-slate-400 tabular-nums">
              {formatUsd(totalUsage)} / $20.00 ({creditUsedPct}%)
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
          <p className="text-[11px] text-slate-500 tabular-nums">
            Storage {formatUsd(s?.storageEstimateUsd)} + Delivery {formatUsd(delivery.estimatedCostUsd)}
          </p>
        </div>
      </div>

      {/* Tabel Audit Lengkap hanya di mode full (/analytics) */}
      {mode === "full" && (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800/80 bg-slate-900/70 text-slate-400">
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
                      className={`px-4 py-2.5 font-medium tabular-nums ${
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

          {plusOrPremium.assets?.length > 0 && (
            <div className="rounded-xl border border-amber-500/30 bg-slate-950/60 p-4 space-y-2">
              <p className="text-xs font-semibold text-amber-300">
                Daftar Asset Plus/Premium (maks. 25 ditampilkan):
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {plusOrPremium.assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-900/60 px-3 py-2 text-[11px]"
                  >
                    <span className="truncate text-slate-200">{asset.title || asset.id}</span>
                    <span className="ml-2 shrink-0 text-amber-300 tabular-nums">
                      {asset.quality} • {asset.resolutionTier} • {asset.minutes} mnt
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
