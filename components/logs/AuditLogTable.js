"use client";

import { useEffect, useState } from "react";

const AuditLogTable = ({ initialLogs = [] }) => {
  const [logs, setLogs] = useState(initialLogs);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refreshLogs = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/logs");
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Riwayat Aksi Admin</h2>
          <p className="text-sm text-slate-400">
            Audit trail untuk upload, edit, hapus konten, serta manajemen user.
          </p>
        </div>
        <button
          type="button"
          onClick={refreshLogs}
          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-800/60">
        <table className="min-w-full divide-y divide-slate-800/60">
          <thead className="bg-slate-900/80">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Waktu
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Aksi
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Target
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                Admin
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
            {logs.map((log) => (
              <tr key={log.id ?? `${log.action}-${log.createdAt}`}
                className="transition hover:bg-slate-900/60"
              >
                <td className="px-4 py-4 text-sm text-slate-300">
                  {log.createdAt ? new Date(log.createdAt).toLocaleString("id-ID") : "-"}
                </td>
                <td className="px-4 py-4 text-sm text-slate-200">
                  <p className="font-medium">{log.action}</p>
                  {log.metadata && (
                    <p className="text-xs text-slate-500">{JSON.stringify(log.metadata)}</p>
                  )}
                </td>
                <td className="px-4 py-4 text-sm text-slate-300">
                  <p>{log.targetType ?? "-"}</p>
                  {log.targetId && <p className="text-xs text-slate-500">{log.targetId}</p>}
                </td>
                <td className="px-4 py-4 text-sm text-slate-300">
                  <p>{log.actor?.displayName ?? log.actor?.email ?? "System"}</p>
                  {log.actor?.email && (
                    <p className="text-xs text-slate-500">{log.actor.email}</p>
                  )}
                </td>
              </tr>
            ))}
            {!logs.length && !loading && (
              <tr>
                <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={4}>
                  Belum ada aktivitas admin.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {loading && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            Memuat audit log...
          </div>
        )}
        {error && (
          <div className="px-4 py-4 text-center text-sm text-rose-300">{error}</div>
        )}
      </div>
    </div>
  );
};

export default AuditLogTable;
