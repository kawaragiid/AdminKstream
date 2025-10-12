import { formatNumber, formatPercentage } from "@/utils/formatters";

const AnalyticsTable = ({ items = [] }) => {
  return (
    <div className="overflow-x-auto rounded-3xl border border-slate-800/60">
      <table className="min-w-full divide-y divide-slate-800/60">
        <thead className="bg-slate-900/80">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400">
              Konten
            </th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400">
              Views
            </th>
            <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400 md:table-cell">
              Watch Time
            </th>
            <th className="hidden px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-slate-400 md:table-cell">
              CTR
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
          {items.map((item) => (
            <tr key={item.id} className="hover:bg-slate-900/80">
              <td className="max-w-[220px] truncate px-4 py-3 text-sm font-medium text-slate-200">
                {item.title}
              </td>
              <td className="whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300">
                {formatNumber(item.views)}
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300 md:table-cell">
                {formatNumber(item.watchTime)} menit
              </td>
              <td className="hidden whitespace-nowrap px-4 py-3 text-right text-sm text-slate-300 md:table-cell">
                {formatPercentage(item.ctr)}
              </td>
            </tr>
          ))}
          {!items.length && (
            <tr>
              <td className="px-4 py-5 text-center text-sm text-slate-500" colSpan={2}>
                Belum ada data analitik konten.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export default AnalyticsTable;
