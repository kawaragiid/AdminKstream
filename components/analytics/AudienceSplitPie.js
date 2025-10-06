"use client";

const AudienceSplitPie = ({ split }) => {
  const free = Math.round((split?.free ?? 0) * 100);
  const premium = Math.round((split?.premium ?? 0) * 100);
  const style = {
    background: `conic-gradient(#3b82f6 ${premium * 3.6}deg, #f97316 0)`
  };

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-slate-100">Free vs Premium</h3>
      <p className="text-xs text-slate-500">Distribusi pengguna berdasarkan langganan.</p>
      <div className="mt-6 flex items-center gap-6">
        <div className="relative h-32 w-32">
          <div className="absolute inset-0 rounded-full" style={style} />
          <div className="absolute inset-4 rounded-full bg-slate-900"></div>
          <div className="absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-100">
            {premium}%
          </div>
        </div>
        <div className="space-y-3 text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-primary-500"></span>
            <div>
              <p className="font-medium">Premium</p>
              <p className="text-xs text-slate-500">{premium}% dari total user</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-orange-400"></span>
            <div>
              <p className="font-medium">Free</p>
              <p className="text-xs text-slate-500">{free}% dari total user</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AudienceSplitPie;
