import { formatNumber } from "@/utils/formatters";

const currencyFormatter = new Intl.NumberFormat("id-ID", {
  style: "currency",
  currency: "IDR",
  maximumFractionDigits: 0,
});

const StatCard = ({
  icon,
  label,
  value,
  change = 0,
  helper,
  isCurrency = false,
}) => {
  const parsedChange = Number(change);
  const hasValidChange = change !== null && change !== "" && Number.isFinite(parsedChange);
  const numericChange = hasValidChange ? parsedChange : 0;
  const isPositive = numericChange >= 0;
  const parsedValue = Number(value);
  const safeValue =
    value !== null && value !== undefined && value !== "" && Number.isFinite(parsedValue)
      ? parsedValue
      : null;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/75 p-5 shadow-lg shadow-slate-950/40 transition-colors hover:border-slate-700/80">
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-800 bg-slate-950/80 text-xl">
          {icon}
        </span>
        {hasValidChange && (
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tabular-nums ${
              isPositive
                ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-400"
                : "border-rose-500/25 bg-rose-500/10 text-rose-400"
            }`}
          >
            <span>{isPositive ? "▲" : "▼"}</span>
            <span>{Math.abs(numericChange).toFixed(1)}%</span>
          </span>
        )}
      </div>
      <p className="mt-4 text-xs font-medium uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-50 tabular-nums sm:text-3xl">
        {safeValue === null
          ? "-"
          : isCurrency
          ? currencyFormatter.format(safeValue)
          : formatNumber(safeValue, { compact: true })}
      </p>
      {helper && <p className="mt-2 text-xs text-slate-500">{helper}</p>}
    </div>
  );
};

export default StatCard;


