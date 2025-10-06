"use client";

const AverageWatchCard = ({ duration }) => {
  const perUser = duration?.perUser ?? 0;
  const perSession = duration?.perSession ?? 0;

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-slate-100">Durasi Rata-rata</h3>
      <p className="text-xs text-slate-500">Durasi tontonan rata-rata per user dan per sesi.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Per User</p>
          <p className="mt-3 text-2xl font-semibold text-slate-100">{perUser} menit</p>
        </div>
        <div className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
          <p className="text-xs uppercase tracking-widest text-slate-500">Per Sesi</p>
          <p className="mt-3 text-2xl font-semibold text-slate-100">{perSession} menit</p>
        </div>
      </div>
    </div>
  );
};

export default AverageWatchCard;
