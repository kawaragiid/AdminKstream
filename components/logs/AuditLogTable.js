"use client";

import { useEffect, useMemo, useState } from "react";

const AuditLogTable = ({ initialLogs = [] }) => {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs ?? []).filter((log) => {
      const actionStr = String(log.action ?? "").toLowerCase();
      if (actionFilter !== "all" && !actionStr.includes(actionFilter)) {
        return false;
      }
      if (!q) return true;
      const hay = [
        log.action,
        log.targetType,
        log.targetId,
        log.actor?.displayName,
        log.actor?.email,
        log.metadata ? JSON.stringify(log.metadata) : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [logs, search, actionFilter]);

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/logs?limit=100");
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal memuat log");
      }
      setLogs(result.data ?? []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!logs?.length) {
      refreshLogs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const renderContent = () => {
    if (loading) {
      return <div className="px-4 py-6 text-center text-sm text-slate-400">Memuat audit log...</div>;
    }
    if (error) {
      return <div className="px-4 py-4 text-center text-sm text-rose-300">{error}</div>;
    }
    if (!logs.length) {
      return <div className="px-4 py-6 text-center text-sm text-slate-500">Belum ada aktivitas admin.</div>;
    }
    if (!filteredLogs.length) {
      return <div className="px-4 py-6 text-center text-sm text-slate-500">Tidak ada log yang cocok dengan filter.</div>;
    }

    return (
      <>
        {/* Desktop Table View */}
        <div className="overflow-x-auto">
          <table className="hidden min-w-full divide-y divide-slate-800/60 md:table">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Waktu</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Aksi</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Target</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {filteredLogs.map((log) => (
                <tr key={log.id ?? `${log.action}-${log.createdAt}`}>
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-300">{log.createdAt ? new Date(log.createdAt).toLocaleString("id-ID") : "-"}</td>
                  <td className="max-w-xs truncate px-4 py-4 text-sm text-slate-200">
                    <p className="font-medium">{log.action}</p>
                    {log.metadata && <p className="truncate text-xs text-slate-500" title={JSON.stringify(log.metadata)}>{JSON.stringify(log.metadata)}</p>}
                  </td>
                  <td className="max-w-sm truncate px-4 py-4 text-sm text-slate-300">
                    <p>{log.targetType ?? "-"}</p>
                    {log.targetId && <p className="truncate text-xs text-slate-500">{log.targetId}</p>}
                  </td>
                  <td className="max-w-xs truncate px-4 py-4 text-sm text-slate-300">
                    <p>{log.actor?.displayName ?? log.actor?.email ?? "System"}</p>
                    {log.actor?.email && <p className="truncate text-xs text-slate-500">{log.actor.email}</p>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="space-y-4 p-4 md:hidden">
          {filteredLogs.map((log) => (
            <div key={log.id ?? `${log.action}-${log.createdAt}-mobile`} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <p className="font-semibold text-slate-100 truncate">{log.action}</p>
                <p className="flex-shrink-0 text-xs text-slate-400">{log.createdAt ? new Date(log.createdAt).toLocaleDateString("id-ID") : "-"}</p>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                <p className="truncate"><span className="font-medium text-slate-400">Target:</span> {log.targetType ?? "-"} ({log.targetId ?? "N/A"})</p>
                <p className="truncate"><span className="font-medium text-slate-400">Admin:</span> {log.actor?.displayName ?? log.actor?.email ?? "System"}</p>
                {log.metadata && <p className="max-w-full truncate text-slate-500" title={JSON.stringify(log.metadata)}><span className="font-medium text-slate-400">Detail:</span> {JSON.stringify(log.metadata)}</p>}
              </div>
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Riwayat Aksi Admin</h2>
          <p className="text-sm text-slate-400">Audit trail untuk upload, edit, hapus konten, serta manajemen user.</p>
        </div>
        <button type="button" onClick={refreshLogs} className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200" disabled={loading}>
          {loading ? "Memuat..." : "Refresh"}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/70 p-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cari aksi, target ID, atau admin..."
          className="min-w-[220px] flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:border-primary-500 focus:outline-none"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200"
        >
          <option value="all">Semua Aksi</option>
          <option value="create">Create</option>
          <option value="update">Update</option>
          <option value="delete">Delete</option>
          <option value="user">User / Role</option>
        </select>
        <span className="text-xs text-slate-400">{filteredLogs.length} log</span>
      </div>

      <div className="rounded-3xl border border-slate-800/60 overflow-hidden">
        {renderContent()}
      </div>
    </div>
  );
};

export default AuditLogTable;
