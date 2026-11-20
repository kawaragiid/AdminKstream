"use client";

import { useMemo, useState } from "react";

const typeStyles = {
  success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
  error: "border-rose-500/30 bg-rose-500/10 text-rose-200",
  info: "border-slate-700 bg-slate-800/70 text-slate-200",
};

const NotificationCenter = ({ initialNotifications = [] }) => {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const [filterMode, setFilterMode] = useState("all");
  const [error, setError] = useState(null);

  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.read).length,
    [notifications]
  );

  const visibleNotifications = useMemo(
    () => (filterMode === "unread" ? (notifications ?? []).filter((n) => !n.read) : notifications ?? []),
    [notifications, filterMode]
  );

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
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal menandai notifikasi.");
      }
      setError(null);
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
      setError(err.message || "Gagal menandai notifikasi.");
    }
  };

  const markAllAsRead = async () => {
    const unread = (notifications ?? []).filter((n) => !n.read && n.id);
    if (!unread.length) return;
    setMarkingAll(true);
    try {
      const responses = await Promise.all(
        unread.map((n) =>
          fetch("/api/notifications", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: n.id }),
          })
        )
      );
      if (!responses.every((r) => r.ok)) {
        const succeededIds = new Set(
          unread.filter((_, idx) => responses[idx]?.ok).map((n) => n.id)
        );
        if (succeededIds.size > 0) {
          setNotifications((prev) =>
            prev.map((n) => (succeededIds.has(n.id) ? { ...n, read: true } : n))
          );
        }
        throw new Error("Gagal menandai sebagian atau semua notifikasi sebagai dibaca.");
      }
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setError(null);
    } catch (err) {
      setError(err.message || "Gagal menandai semua notifikasi.");
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Notifikasi & Alert</h2>
          <p className="text-sm text-slate-400">Periksa status upload, error API, dan informasi premium user terbaru.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllAsRead}
              disabled={markingAll}
              className="rounded-xl border border-primary-500/40 bg-primary-500/10 px-3.5 py-2 text-xs font-semibold text-primary-300 hover:bg-primary-500/20 disabled:opacity-60"
            >
              {markingAll ? "Memproses..." : `Tandai Semua Dibaca (${unreadCount})`}
            </button>
          )}
          <button
            type="button"
            onClick={refresh}
            className="rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
            disabled={loading}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterMode("all")}
          className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
            filterMode === "all"
              ? "border-primary-500 bg-primary-600 text-white"
              : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
          }`}
        >
          Semua ({notifications.length})
        </button>
        <button
          type="button"
          onClick={() => setFilterMode("unread")}
          className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
            filterMode === "unread"
              ? "border-primary-500 bg-primary-600 text-white"
              : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
          }`}
        >
          Belum Dibaca ({unreadCount})
        </button>
      </div>

      <div className="space-y-4">
        {visibleNotifications.map((notif) => (
          <div key={notif.id} className={`rounded-3xl border px-5 py-4 ${typeStyles[notif.type] ?? typeStyles.info}`}>
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between sm:gap-4">
              <div>
                <p className="text-sm font-semibold">{notif.title}</p>
                <p className="text-sm opacity-90">{notif.body}</p>
                <p className="mt-2 text-xs text-slate-400">{notif.createdAt ? new Date(notif.createdAt).toLocaleString("id-ID") : ""}</p>
              </div>
              {!notif.read && (
                <button type="button" onClick={() => markAsRead(notif.id)} className="self-start rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200 sm:self-auto">
                  Tandai dibaca
                </button>
              )}
            </div>
          </div>
        ))}
        {!visibleNotifications.length && !loading && <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-5 py-6 text-center text-sm text-slate-400">Tidak ada notifikasi {filterMode === "unread" ? "yang belum dibaca" : "saat ini"}.</div>}
        {loading && (
          <div aria-busy="true" aria-label="Memuat notifikasi" className="space-y-4">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="rounded-3xl border border-slate-800/60 bg-slate-900/60 px-5 py-4 animate-pulse"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="h-4 w-48 rounded bg-slate-800" />
                    <div className="h-3.5 w-3/4 rounded bg-slate-800/80" />
                    <div className="h-3 w-32 rounded bg-slate-800/60" />
                  </div>
                  <div className="h-8 w-28 rounded-full bg-slate-800" />
                </div>
              </div>
            ))}
          </div>
        )}
        {error && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-3xl border border-rose-500/30 bg-rose-500/10 px-5 py-4 text-center text-sm text-rose-200"
          >
            {error}
          </div>
        )}
      </div>
    </div>
  );
};

export default NotificationCenter;
