"use client";

import { useMemo, useState } from "react";
import { formatDate, formatNumber } from "@/utils/formatters";

const AnalyticsChart = ({ data = [] }) => {
  const [activeIndex, setActiveIndex] = useState(null);
  const chartData = useMemo(() => data ?? [], [data]);
  const maxValue = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map((item) => item.views ?? 0), 1);
  }, [chartData]);

  const yTicks = useMemo(() => {
    const mid = Math.round(maxValue / 2);
    return [maxValue, mid, 0];
  }, [maxValue]);

  if (!chartData.length) {
    return (
      <div className="flex h-64 w-full items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 text-sm text-slate-400">
        Belum ada data tren tayangan untuk ditampilkan.
      </div>
    );
  }

  return (
    <div className="flex w-full gap-3 pt-12">
      {/* Y-axis reference scale ticks */}
      <div
        aria-hidden="true"
        className="flex h-52 flex-col justify-between pb-6 text-right text-[10px] font-medium text-slate-400 tabular-nums shrink-0"
      >
        {yTicks.map((tick, idx) => (
          <span key={idx} className="leading-none">
            {formatNumber(tick, { compact: true })}
          </span>
        ))}
      </div>

      {/* Bars */}
      <div className="relative flex h-52 flex-1 items-end gap-2 sm:gap-3">
        {/* Subtle horizontal reference lines */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 bottom-6 flex flex-col justify-between"
        >
          <div className="border-t border-dashed border-slate-800/70" />
          <div className="border-t border-dashed border-slate-800/50" />
          <div className="border-t border-slate-800/80" />
        </div>

        {chartData.map((item, index) => {
          const percentage = Math.max(8, Math.round(((item.views ?? 0) / maxValue) * 100));
          const parsedDate = item.date ? new Date(item.date) : null;
          const isValidDate = parsedDate && !Number.isNaN(parsedDate.getTime());
          const dateLabel = isValidDate
            ? parsedDate.toLocaleDateString("id-ID", { day: "numeric", month: "short" })
            : item.date || "-";
          const fullDateLabel = isValidDate ? formatDate(item.date) : dateLabel;
          const tooltipPos =
            index <= 1
              ? "left-0 translate-x-0"
              : index >= chartData.length - 2
              ? "right-0 left-auto translate-x-0"
              : "left-1/2 -translate-x-1/2";
          const isSelected = activeIndex === index;

          return (
            <div key={item.date ?? index} className="group relative flex h-full flex-1 min-w-0 flex-col justify-end">
              <button
                type="button"
                aria-label={`${fullDateLabel}: ${formatNumber(item.views)} views${
                  item.watchTime ? `, ${formatNumber(item.watchTime, { compact: true })} menit nonton` : ""
                }`}
                aria-pressed={isSelected}
                onClick={() => setActiveIndex((prev) => (prev === index ? null : index))}
                className="relative flex h-full w-full flex-col justify-end rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <div className="relative flex h-full w-full items-end overflow-hidden rounded-2xl bg-slate-900/60">
                  <div
                    className={`w-full rounded-2xl bg-gradient-to-t transition-all duration-300 motion-reduce:transition-none ${
                      isSelected
                        ? "from-accent via-accent to-primary-200"
                        : "from-primary-600 via-primary-400 to-primary-300 group-hover:from-accent group-hover:via-accent group-hover:to-primary-200"
                    }`}
                    style={{ height: `${percentage}%` }}
                  />
                </div>
                <span className="mt-2 block w-full truncate text-center text-[11px] font-medium text-slate-400">
                  {dateLabel}
                </span>
              </button>

              <div
                role="tooltip"
                className={`pointer-events-none absolute -top-2 z-30 w-36 -translate-y-full rounded-xl border border-slate-800/70 bg-slate-950/95 p-2.5 text-[11px] shadow-lg shadow-black/40 transition-all motion-reduce:transition-none ${
                  isSelected
                    ? "scale-100 opacity-100"
                    : "scale-95 opacity-0 group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100 group-focus-within:opacity-100"
                } ${tooltipPos}`}
              >
                <p className="font-medium text-slate-100">{fullDateLabel}</p>
                <p className="text-xs text-slate-300">{formatNumber(item.views)} views</p>
                {item.watchTime ? (
                  <p className="text-xs text-slate-400">
                    {formatNumber(item.watchTime, { compact: true })} menit nonton
                  </p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default AnalyticsChart;
