"use client";

import { useEffect, useState } from "react";

const typeStyles = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  info: "border-slate-700 bg-slate-800/70 text-slate-200",
};

const NotificationCenter = ({ initialNotifications = [] }) => {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/notifications");
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal memuat notifikasi");
      }
      setNotifications(result.data ?? []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id) => {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      setNotifications((prev) =>
        prev.map((notif) =>
          notif.id === id
            ? {
                ...notif,
                read: true,
              }
            : notif
        )
      );
    } catch (err) {
      setError("Gagal menandai notifikasi.");
    }
  };

  useEffect(() => {
    if (!notifications?.length) {
      refresh();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Notifikasi & Alert</h2>
          <p className="text-sm text-slate-400">
            Periksa status upload, error API, dan informasi premium user terbaru.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
          disabled={loading}
        >
          Refresh
        </button>
      </div>

      <div className="space-y-4">
        {notifications.map((notif) => (
          <div
            key={notif.id}
            className={`rounded-3xl border px-5 py-4 ${typeStyles[notif.type ?? "info"]}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{notif.title}</p>
                <p className="text-sm opacity-90">{notif.body}</p>
                <p className="mt-2 text-xs text-slate-400">
                  {notif.createdAt ? new Date(notif.createdAt).toLocaleString("id-ID") : ""}
                </p>
              </div>
              {!notif.read && (
                <button
                  type="button"
                  onClick={() => markAsRead(notif.id)}
                  className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200"
                >
                  Tandai dibaca
                </button>
              )}
            </div>
          </div>
        ))}
        {!notifications.length && !loading && (
          <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-5 py-6 text-center text-sm text-slate-400">
            Tidak ada notifikasi saat ini.
          </div>
        )}
        {loading && (
          <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-5 py-6 text-center text-sm text-slate-400">
            Memuat notifikasi...
          </div>
        )}
        {error && (
          <div className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-center text-sm text-rose-200">
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
