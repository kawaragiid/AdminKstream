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
  const numericChange = Number(change || 0);
  const isPositive = numericChange >= 0;
  const changeColor = isPositive ? "text-emerald-400" : "text-rose-400";

  return (
    <div className="relative overflow-hidden rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6 shadow-lg shadow-slate-950/30">
      <div className="absolute right-6 top-6 h-16 w-16 rounded-full bg-primary-500/10 blur-3xl" aria-hidden="true" />
      <div className="flex items-start justify-between">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/10 text-2xl">
          {icon}
        </span>
        <span className={`flex items-center gap-1 text-xs font-medium ${changeColor}`}>
          {isPositive ? "â–²" : "â–¼"}
          {Math.abs(numericChange).toFixed(1)}%
        </span>
      </div>
      <p className="mt-6 text-sm font-medium text-slate-400">{label}</p>
      <p className="text-3xl font-semibold text-slate-50">
        {isCurrency ? currencyFormatter.format(value) : formatNumber(value, { compact: true })}
      </p>
      {helper && <p className="mt-3 text-xs text-slate-500">{helper}</p>}
    </div>
  );
};

export default StatCard;


