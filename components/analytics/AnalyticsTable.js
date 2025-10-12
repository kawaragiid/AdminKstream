import { formatNumber, formatPercentage } from "@/utils/formatters";

const AnalyticsTable = ({ items = [] }) => {
  if (!items.length) {
    return (
      <div className="px-4 py-5 text-center text-sm text-slate-500 rounded-3xl border border-slate-800/60">
        Belum ada data analitik konten.
      </div>
    );
  }

  return (
    <div>
      {/* Desktop Table View */}
      <div className="hidden overflow-x-auto rounded-3xl border border-slate-800/60 md:block">
        <table className="min-w-full divide-y divide-slate-800/60">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">Konten</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Views</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">Watch Time</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">CTR</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {items.map((item) => (
              <tr key={item.id} className="hover:bg-slate-900/80">
                <td className="max-w-[220px] truncate px-4 py-3 text-sm font-medium text-slate-200">{item.title}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">{formatNumber(item.views)}</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">{formatNumber(item.watchTime)} menit</td>
                <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">{formatPercentage(item.ctr)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="space-y-4 md:hidden">
        {items.map((item) => (
          <div key={`${item.id}-mobile`} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
            <p className="truncate font-semibold text-slate-100">{item.title}</p>
            <div className="mt-2 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-400">Views</p>
                <p className="text-sm font-medium text-slate-200">{formatNumber(item.views)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Watch Time</p>
                <p className="text-sm font-medium text-slate-200">{formatNumber(item.watchTime)}m</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">CTR</p>
                <p className="text-sm font-medium text-slate-200">{formatPercentage(item.ctr)}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default AnalyticsTable;
