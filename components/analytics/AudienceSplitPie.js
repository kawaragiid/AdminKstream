"use client";

const AudienceSplitPie = ({ split }) => {
  const freeCount = Math.max(0, Number(split?.free ?? 0) || 0);
  const premiumCount = Math.max(0, Number(split?.premium ?? 0) || 0);
  const total = freeCount + premiumCount;
  const premiumPct = total > 0 ? Math.round((premiumCount / total) * 100) : 0;
  const freePct = total > 0 ? 100 - premiumPct : 0;
  const style = {
    background:
      total === 0
        ? "#1e293b"
        : `conic-gradient(#3b82f6 ${premiumPct * 3.6}deg, #f97316 0)`,
  };

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-slate-100">Free vs Premium</h3>
      <p className="text-xs text-slate-400">Distribusi pengguna berdasarkan langganan.</p>
      <div className="mt-6 flex items-center gap-6">
        <div
          role="img"
          aria-label={`Distribusi pengguna: Premium ${premiumPct}% (${premiumCount.toLocaleString("id-ID")} user), Free ${freePct}% (${freeCount.toLocaleString("id-ID")} user)`}
          className="relative h-32 w-32 shrink-0"
        >
          <div className="absolute inset-0 rounded-full" style={style} />
          <div className="absolute inset-4 rounded-full bg-slate-900" />
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-sm font-semibold text-slate-100 tabular-nums">{premiumPct}%</span>
            <span className="text-[10px] font-medium text-slate-400">Premium</span>
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary-500" />
            <div>
              <p className="font-medium">Premium</p>
              <p className="text-xs text-slate-400 tabular-nums">
                {premiumPct}% ({premiumCount.toLocaleString("id-ID")} user)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-400" />
            <div>
              <p className="font-medium">Free</p>
              <p className="text-xs text-slate-400 tabular-nums">
                {freePct}% ({freeCount.toLocaleString("id-ID")} user)
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudienceSplitPie;
