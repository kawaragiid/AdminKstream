"use client";

import { useMemo } from "react";
import { formatDate, formatNumber } from "@/utils/formatters";

const AnalyticsChart = ({ data = [] }) => {
  const chartData = useMemo(() => data ?? [], [data]);
  const maxValue = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map((item) => item.views ?? 0), 1);
  }, [chartData]);

  if (!chartData.length) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-sm text-slate-500">
        Belum ada data tren tayangan untuk ditampilkan.
      </div>
    );
  }

  return (
    <div className="flex h-64 w-full items-end gap-3">
      {chartData.map((item, index) => {
        const percentage = Math.max(8, Math.round(((item.views ?? 0) / maxValue) * 100));
        const parsedDate = item.date ? new Date(item.date) : null;
        const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
        const dateLabel = isValidDate
          ? parsedDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" })
          : item.date || "-";
        const tooltipPos =
          index === 0
            ? "left-0 translate-x-0"
            : index === chartData.length - 1
            ? "right-0 left-auto translate-x-0"
            : "left-1/2 -translate-x-1/2";

        return (
          <div key={item.date ?? index} className="group relative flex-1 min-w-0">
            <div
              className="relative flex h-full w-full items-end overflow-hidden rounded-2xl bg-slate-900/60"
            >
              <div
                className="w-full rounded-2xl bg-gradient-to-t from-primary-600 via-primary-400 to-primary-300 transition-all duration-300 group-hover:from-accent group-hover:via-accent group-hover:to-primary-200"
                style={{ height: `${percentage}%` }}
              />
            </div>
            <div className="mt-3 truncate text-center text-[11px] font-medium text-slate-400">
              {dateLabel}
            </div>
            <div
              className={`pointer-events-none absolute bottom-20 z-30 w-36 -translate-y-2 scale-95 rounded-xl border border-slate-800/70 bg-slate-950/95 p-2.5 text-[11px] opacity-0 shadow-lg shadow-black/40 transition-all group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100 ${tooltipPos}`}
            >
              <p className="font-medium text-slate-100">{isValidDate ? formatDate(item.date) : dateLabel}</p>
              <p className="text-xs text-slate-300">{formatNumber(item.views)} views</p>
              {item.watchTime ? (
                <p className="text-xs text-slate-500">
                  {formatNumber(item.watchTime, { compact: true })} menit nonton
                </p>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AnalyticsChart;
