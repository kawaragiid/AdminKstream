"use client";

const ActiveUsersCard = ({ activeUsers }) => {
  const { daily = 0, weekly = 0, monthly = 0 } = activeUsers ?? {};

  const items = [
    { label: "Harian", value: daily },
    { label: "Mingguan", value: weekly },
    { label: "Bulanan", value: monthly },
  ];

  return (
    <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
      <h3 className="text-lg font-semibold text-slate-100">User Aktif</h3>
      <p className="text-xs text-slate-500">Jumlah user yang menonton konten dalam periode tertentu.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4 text-center"
          >
            <p className="text-xs uppercase tracking-widest text-slate-500">{item.label}</p>
            <p className="mt-3 text-2xl font-semibold text-slate-100">
              {item.value.toLocaleString("id-ID")}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ActiveUsersCard;
