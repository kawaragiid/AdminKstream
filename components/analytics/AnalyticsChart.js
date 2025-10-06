"use client";

import { useMemo } from "react";
import { formatDate, formatNumber } from "@/utils/formatters";

const AnalyticsChart = ({ data = [] }) => {
  const chartData = useMemo(() => data ?? [], [data]);
  const maxValue = useMemo(() => {
    if (!chartData.length) return 1;
    return Math.max(...chartData.map((item) => item.views ?? 0), 1);
  }, [chartData]);

  return (
    <div className="flex h-64 w-full items-end gap-3">
      {chartData.map((item) => {
        const percentage = Math.max(8, Math.round(((item.views ?? 0) / maxValue) * 100));
        return (
          <div key={item.date} className="group relative flex-1">
            <div
              className="relative flex h-full w-full items-end overflow-hidden rounded-2xl bg-slate-900/60"
            >
              <div
                className="w-full rounded-2xl bg-gradient-to-t from-primary-600 via-primary-400 to-primary-300 transition-all duration-300 group-hover:from-accent group-hover:via-accent group-hover:to-primary-200"
                style={{ height: `${percentage}%` }}
              />
            </div>
            <div className="mt-3 text-center text-[11px] font-medium text-slate-400">
              {new Date(item.date).getDate()}
            </div>
            <div className="pointer-events-none absolute bottom-20 left-1/2 w-32 -translate-x-1/2 -translate-y-2 scale-95 rounded-xl border border-slate-800/70 bg-slate-950/95 p-2 text-[11px] opacity-0 shadow-lg shadow-black/40 transition-all group-hover:translate-y-0 group-hover:scale-100 group-hover:opacity-100">
              <p className="font-medium text-slate-100">{formatDate(item.date)}</p>
              <p className="text-xs text-slate-300">{formatNumber(item.views)} views</p>
              {item.watchTime && (
                <p className="text-xs text-slate-500">
                  {formatNumber(item.watchTime, { compact: true })} menit nonton
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default AnalyticsChart;
