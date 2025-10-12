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

      <div className="rounded-3xl border border-slate-800/60">
        {/* Desktop Table View */}
        <div className="hidden overflow-x-auto md:block">
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
                  <td className="whitespace-nowrap px-4 py-4 text-sm text-slate-300">
                    {log.createdAt ? new Date(log.createdAt).toLocaleString("id-ID") : "-"}
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-200">
                    <p className="font-medium">{log.action}</p>
                    {log.metadata && (
                      <p className="max-w-xs truncate text-xs text-slate-500" title={JSON.stringify(log.metadata)}>{JSON.stringify(log.metadata)}</p>
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
        </div>

        {/* Mobile Card View */}
        <div className="space-y-4 p-4 md:hidden">
          {logs.map((log) => (
            <div key={log.id ?? `${log.action}-${log.createdAt}-mobile`} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <p className="font-semibold text-slate-100">{log.action}</p>
                <p className="flex-shrink-0 whitespace-nowrap text-xs text-slate-400">
                  {log.createdAt ? new Date(log.createdAt).toLocaleDateString("id-ID") : "-"}
                </p>
              </div>
              <div className="mt-2 space-y-2 text-xs">
                <p><span className="font-medium text-slate-400">Target:</span> {log.targetType ?? "-"} ({log.targetId ?? "N/A"})</p>
                <p><span className="font-medium text-slate-400">Admin:</span> {log.actor?.displayName ?? log.actor?.email ?? "System"}</p>
                {log.metadata && (
                  <p className="max-w-full truncate text-slate-500" title={JSON.stringify(log.metadata)}><span className="font-medium text-slate-400">Detail:</span> {JSON.stringify(log.metadata)}</p>
                )}
              </div>
            </div>
          ))}
        </div>

        {(loading || error || (!logs.length && !loading)) && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            {loading ? "Memuat audit log..." : error ? error : "Belum ada aktivitas admin."}
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLogTable;
