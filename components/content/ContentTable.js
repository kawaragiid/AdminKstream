"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CONTENT_CATEGORIES, CONTENT_TYPES } from "@/utils/constants";
import MovieForm from "@/components/upload/MovieForm";
import SeriesForm from "@/components/upload/SeriesForm";

const filtersDefault = {
  search: "",
  category: "",
};

export default function ContentTable() {
  const [items, setItems] = useState([]);
  const [filters, setFilters] = useState(filtersDefault);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [editMode, setEditMode] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState(null);
  const [muxDetails, setMuxDetails] = useState(null);
  const [muxLoading, setMuxLoading] = useState(false);
  const [muxError, setMuxError] = useState(null);
  const [typeFilter, setTypeFilter] = useState("all");
  const [viewMode, setViewMode] = useState("list");
  const [activeSeason, setActiveSeason] = useState(1);

  const seriesSeasonData = useMemo(() => {
    if (!selectedItem || selectedItem.type !== CONTENT_TYPES.SERIES) {
      return { seasons: [1], maxSeason: 1, episodesBySeason: { 1: [] } };
    }
    const episodesBySeason = {};
    const seasonSet = new Set();
    const declared = Number(selectedItem.totalSeasons ?? 1);
    for (let s = 1; s <= declared; s += 1) {
      seasonSet.add(s);
      episodesBySeason[s] = [];
    }
    for (const ep of selectedItem.episodes ?? []) {
      const s = Math.max(1, Number(ep.seasonNumber ?? 1));
      seasonSet.add(s);
      if (!episodesBySeason[s]) episodesBySeason[s] = [];
      episodesBySeason[s].push(ep);
    }
    const seasons = Array.from(seasonSet).sort((a, b) => a - b);
    for (const s of seasons) {
      episodesBySeason[s].sort(
        (a, b) => Number(a.epNumber ?? a.episodeNumber ?? 0) - Number(b.epNumber ?? b.episodeNumber ?? 0)
      );
    }
    const maxSeason = seasons[seasons.length - 1] ?? 1;
    return { seasons, maxSeason, episodesBySeason };
  }, [selectedItem]);

  useEffect(() => {
    if (selectedItem?.type === CONTENT_TYPES.SERIES) {
      const firstSeason = (selectedItem.episodes ?? []).reduce(
        (min, ep) => Math.min(min, Math.max(1, Number(ep.seasonNumber ?? 1))),
        Number(selectedItem.totalSeasons ?? 1) || 1
      );
      setActiveSeason(Math.max(1, firstSeason));
    }
  }, [selectedItem]);

  const categories = useMemo(() => ["", ...CONTENT_CATEGORIES], []);

  const filteredItems = useMemo(() => {
    if (typeFilter === "all") return items;
    return items.filter((item) => item.type === typeFilter);
  }, [items, typeFilter]);

  const getMuxStatusBadge = (item) => {
    if (item.type === CONTENT_TYPES.MOVIE) {
      const hasPlayback = Boolean(item.mux_playback_id || item.muxPlaybackId || item.mux_video_id);
      return hasPlayback
        ? { label: "Mux Ready", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" }
        : { label: "Tanpa Asset", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
    }
    const eps = Array.isArray(item.episodes) ? item.episodes : [];
    if (!eps.length) {
      return { label: "0 Episode", cls: "border-slate-700 bg-slate-800/70 text-slate-400" };
    }
    const readyCount = eps.filter((ep) => ep?.mux_playback_id || ep?.muxPlaybackId || ep?.mux_video_id).length;
    if (readyCount === eps.length) {
      return { label: `${eps.length} Ep Ready`, cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" };
    }
    if (readyCount > 0) {
      return { label: `${readyCount}/${eps.length} Ep`, cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" };
    }
    return { label: "Tanpa Asset", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" };
  };

  const fetchData = async (activeFilters = filters) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (activeFilters.search) params.set("search", activeFilters.search);
      if (activeFilters.category) params.set("category", activeFilters.category);
      const response = await fetch(`/api/content${params.toString() ? `?${params.toString()}` : ""}`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal memuat konten");
      }
      setItems(result.data ?? []);
      setError(null);
    } catch (err) {
      setError(err.message ?? "Gagal memuat konten.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyFilters = (event) => {
    event?.preventDefault();
    fetchData(filters);
  };

  const resetFilters = () => {
    setFilters(filtersDefault);
    fetchData(filtersDefault);
  };

  const handleDelete = async (item) => {
    const confirmed = window.confirm(item.type === CONTENT_TYPES.MOVIE ? `Hapus movie "${item.title}"? Tindakan ini tidak bisa dibatalkan.` : `Hapus series "${item.title}" beserta seluruh episode?`);
    if (!confirmed) return;

    try {
      const endpoint = item.type === CONTENT_TYPES.MOVIE ? "/api/movies" : "/api/series";
      const response = await fetch(`${endpoint}/${item.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Gagal menghapus konten.");
      }
      setSelectedItem(null);
      await fetchData();
    } catch (err) {
      setError(err.message ?? "Gagal menghapus konten.");
    }
  };

  const openDetails = async (item) => {
    setSelectedItem(item);
    setEditMode(null);
    setDetailError(null);
    setDetailLoading(true);
    setMuxDetails(null);
    setMuxError(null);

    const targetId = item.id;

    try {
      const endpoint = item.type === CONTENT_TYPES.MOVIE ? `/api/movies/${item.id}` : `/api/series/${item.id}`;
      const response = await fetch(endpoint);
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json?.error ?? "Gagal memuat detail konten.");
      }
      setSelectedItem((prev) => {
        if (!prev || prev.id !== targetId) return prev;
        return { ...prev, ...json.data };
      });
    } catch (err) {
      setDetailError(err?.message ?? "Gagal memuat detail konten.");
    } finally {
      setDetailLoading(false);
    }
  };

  const refreshAfterEdit = () => {
    setEditMode(null);
    fetchData();
  };

  const formatDuration = (seconds) => {
    const numeric = Number(seconds);
    if (!Number.isFinite(numeric) || numeric <= 0) return "-";
    const hours = Math.floor(numeric / 3600);
    const minutes = Math.floor((numeric % 3600) / 60);
    const secs = Math.floor(numeric % 60);
    if (hours > 0) {
      return `${hours}j ${minutes}m ${secs}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    }
    return `${secs}s`;
  };

  useEffect(() => {
    if (!selectedItem) {
      setMuxDetails(null);
      setMuxLoading(false);
      setMuxError(null);
      return;
    }

    if (detailLoading) {
      return;
    }

    const candidate = selectedItem.mux_asset_id ?? selectedItem.mux_playback_id ?? selectedItem.mux_video_id ?? null;

    if (!candidate) {
      setMuxDetails(null);
      setMuxLoading(false);
      setMuxError(null);
      return;
    }

    let cancelled = false;

    const loadMuxDetails = async () => {
      setMuxLoading(true);
      setMuxError(null);
      try {
        let assetId = selectedItem.mux_asset_id ?? null;
        if (!assetId) {
          const resolveRes = await fetch(`/api/mux/resolve-asset?playbackId=${encodeURIComponent(candidate)}`);
          const resolveJson = await resolveRes.json().catch(() => ({}));
          if (!resolveRes.ok) {
            throw new Error(resolveJson?.error ?? "Asset Mux tidak ditemukan.");
          }
          assetId = resolveJson?.data?.assetId ?? null;
        }

        if (!assetId) {
          throw new Error("Asset ID Mux tidak tersedia.");
        }

        const assetRes = await fetch(`/api/mux/assets/${assetId}`);
        const assetJson = await assetRes.json().catch(() => ({}));
        if (!assetRes.ok) {
          throw new Error(assetJson?.error ?? "Gagal memuat detail asset Mux.");
        }

        if (cancelled) return;
        setMuxDetails({ assetId, ...(assetJson?.data ?? {}) });
      } catch (err) {
        if (cancelled) return;
        setMuxDetails(null);
        setMuxError(err?.message ?? "Gagal memuat data Mux.");
      } finally {
        if (!cancelled) {
          setMuxLoading(false);
        }
      }
    };

    loadMuxDetails();

    return () => {
      cancelled = true;
    };
  }, [selectedItem, detailLoading]);

  const closeDrawer = () => {
    setSelectedItem(null);
    setEditMode(null);
    setDetailError(null);
    setDetailLoading(false);
    setMuxDetails(null);
    setMuxError(null);
    setMuxLoading(false);
  };

  return (
    <div className="space-y-6">
      {/* Filter & View Controls */}
      <form
        onSubmit={applyFilters}
        className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-5 space-y-4"
      >
        <div className="grid gap-4 md:grid-cols-12">
          <label className="text-xs font-medium text-slate-300 md:col-span-5">
            Pencarian
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Cari judul, kategori, atau deskripsi..."
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-primary-500 focus:outline-none"
            />
          </label>

          <label className="text-xs font-medium text-slate-300 md:col-span-3">
            Tipe Konten
            <select
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-primary-500 focus:outline-none"
            >
              <option value="all">Semua ({items.length})</option>
              <option value={CONTENT_TYPES.MOVIE}>Movie</option>
              <option value={CONTENT_TYPES.SERIES}>Series</option>
            </select>
          </label>

          <label className="text-xs font-medium text-slate-300 md:col-span-4">
            Kategori
            <select
              value={filters.category}
              onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))}
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-primary-500 focus:outline-none"
            >
              {categories.map((category) => (
                <option key={category || "all"} value={category}>
                  {category || "Semua Kategori"}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-950 p-1">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "list"
                  ? "bg-primary-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ☰ List
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                viewMode === "grid"
                  ? "bg-primary-600 text-white"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⊞ Grid
            </button>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={resetFilters}
              className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
            >
              Reset
            </button>
            <button
              type="submit"
              className="rounded-xl bg-primary-600 px-5 py-2 text-xs font-semibold text-white transition hover:bg-primary-500"
            >
              Terapkan Filter
            </button>
          </div>
        </div>
      </form>

      {/* Catalog Container */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 overflow-hidden">
        {viewMode === "list" ? (
          <>
            {/* Desktop Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-slate-800/70">
                <thead className="bg-slate-950/60">
                  <tr>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Judul
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Tipe
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Kategori
                    </th>
                    <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Status Mux
                    </th>
                    <th className="hidden px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400 lg:table-cell">
                      Tanggal
                    </th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {filteredItems.map((item) => {
                    const badge = getMuxStatusBadge(item);
                    const isSelected = selectedItem?.id === item.id && selectedItem?.type === item.type;
                    return (
                      <tr
                        key={`${item.type}-${item.id}`}
                        onClick={() => openDetails(item)}
                        className={`cursor-pointer transition ${
                          isSelected ? "bg-primary-600/10" : "hover:bg-slate-800/40"
                        }`}
                      >
                        <td className="px-5 py-3.5 text-sm font-medium text-slate-100">
                          <div className="flex items-center gap-3">
                            {item.thumbnail ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.thumbnail}
                                alt={item.title}
                                className="h-10 w-14 shrink-0 rounded-lg border border-slate-800 object-cover"
                              />
                            ) : (
                              <div className="flex h-10 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-800 bg-slate-950 text-xs text-slate-500">
                                🎬
                              </div>
                            )}
                            <span className="line-clamp-1">{item.title}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-300">
                          <span className="rounded-md border border-slate-700/80 bg-slate-950/60 px-2 py-0.5 font-medium">
                            {item.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-300">{item.category}</td>
                        <td className="px-4 py-3.5 text-xs">
                          <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${badge.cls}`}>
                            {badge.label}
                          </span>
                        </td>
                        <td className="hidden px-4 py-3.5 text-right text-xs text-slate-400 tabular-nums lg:table-cell">
                          {item.createdAt ? new Date(item.createdAt).toLocaleDateString("id-ID") : "-"}
                        </td>
                        <td className="px-5 py-3.5 text-right text-xs" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => openDetails(item)}
                              className="rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 transition hover:border-primary-500 hover:text-primary-200"
                            >
                              Kelola
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDelete(item)}
                              className="rounded-lg border border-transparent px-3 py-1.5 font-semibold text-rose-300 transition hover:border-rose-500/40 hover:bg-rose-500/10"
                            >
                              Hapus
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredItems.length && !loading && (
                    <tr>
                      <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                        Tidak ada konten yang cocok.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile List */}
            <div className="space-y-3 p-4 md:hidden">
              {filteredItems.map((item) => {
                const badge = getMuxStatusBadge(item);
                return (
                  <div
                    key={`${item.type}-${item.id}-mobile`}
                    className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-100">{item.title}</p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {item.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"} • {item.category}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => openDetails(item)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200"
                      >
                        Kelola
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-lg px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          /* Grid View */
          <div className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredItems.map((item) => {
              const badge = getMuxStatusBadge(item);
              return (
                <div
                  key={`${item.type}-${item.id}-grid`}
                  onClick={() => openDetails(item)}
                  className="group cursor-pointer overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/60 transition hover:border-primary-500/40"
                >
                  <div className="relative aspect-video w-full bg-slate-900">
                    {item.thumbnail ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.thumbnail}
                        alt={item.title}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-slate-600">
                        🎬
                      </div>
                    )}
                    <span className={`absolute right-2 top-2 rounded-full border px-2 py-0.5 text-[10px] font-semibold backdrop-blur-md ${badge.cls}`}>
                      {badge.label}
                    </span>
                    <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold text-slate-200">
                      {item.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"}
                    </span>
                  </div>
                  <div className="p-3.5 space-y-2">
                    <p className="line-clamp-1 text-sm font-semibold text-slate-100">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.category}</p>
                    <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openDetails(item)}
                        className="rounded-lg border border-slate-700 px-3 py-1 text-xs font-semibold text-slate-200 hover:border-primary-500"
                      >
                        Kelola
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(item)}
                        className="rounded-lg px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10"
                      >
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!filteredItems.length && !loading && (
              <div className="col-span-full py-10 text-center text-sm text-slate-500">
                Tidak ada konten yang cocok.
              </div>
            )}
          </div>
        )}

        {(loading || error) && (
          <div className="border-t border-slate-800/60 px-4 py-6 text-center text-sm text-slate-400">
            {loading ? "Memuat konten..." : error}
          </div>
        )}
      </div>

      {/* Slide-over Drawer Detail & Edit */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          onClick={closeDrawer}
        >
          <div
            className={`relative h-full w-full overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl ${
              editMode ? "max-w-4xl" : "max-w-xl"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {!editMode && (
              <div className="space-y-5">
                <header className="flex items-start justify-between gap-4 border-b border-slate-800/80 pb-4">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-primary-300">
                      {selectedItem.type === CONTENT_TYPES.MOVIE ? "Detail Movie" : "Detail Series"}
                    </p>
                    <h3 className="text-xl font-semibold text-slate-100">{selectedItem.title}</h3>
                    <p className="text-xs text-slate-400">
                      {selectedItem.category}
                      {selectedItem.createdAt
                        ? ` • Dibuat ${new Date(selectedItem.createdAt).toLocaleDateString("id-ID")}`
                        : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDrawer}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:border-slate-600 hover:text-white"
                  >
                    ✕ Tutup
                  </button>
                </header>

                {detailLoading && <p className="text-xs text-slate-400">Memuat detail terbaru...</p>}
                {detailError && <p className="text-xs text-rose-400">{detailError}</p>}

                {selectedItem.thumbnail && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={selectedItem.thumbnail}
                    alt={selectedItem.title}
                    className="aspect-video w-full rounded-xl border border-slate-800 object-cover"
                  />
                )}

                <p className="whitespace-pre-line text-sm leading-relaxed text-slate-300">
                  {selectedItem.description}
                </p>

                {selectedItem.type === CONTENT_TYPES.MOVIE ? (
                  <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-1.5 text-xs text-slate-300">
                    <p className="font-semibold text-slate-200">Metadata Video</p>
                    <p className="break-all text-slate-400">
                      Playback ID: <span className="text-slate-200">{selectedItem.mux_playback_id ?? selectedItem.mux_video_id ?? "-"}</span>
                    </p>
                    <p className="text-slate-400">Subtitle: {(selectedItem.subtitles ?? []).length} track</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                        Daftar Episode ({(selectedItem.episodes ?? []).length})
                      </p>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/upload?tab=episode&seriesId=${encodeURIComponent(selectedItem.id)}&season=${activeSeason}`}
                          className="rounded-lg bg-primary-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition hover:bg-primary-500"
                        >
                          + Tambah Episode
                        </Link>
                        <Link
                          href={`/upload?tab=episode&seriesId=${encodeURIComponent(selectedItem.id)}&season=${seriesSeasonData.maxSeason + 1}`}
                          className="rounded-lg border border-primary-500/40 bg-primary-500/10 px-2.5 py-1.5 text-[11px] font-semibold text-primary-300 transition hover:bg-primary-500/20"
                        >
                          + Season Baru
                        </Link>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {seriesSeasonData.seasons.map((seasonNum) => {
                        const isActive = activeSeason === seasonNum;
                        const count = seriesSeasonData.episodesBySeason[seasonNum]?.length ?? 0;
                        return (
                          <button
                            key={seasonNum}
                            type="button"
                            onClick={() => setActiveSeason(seasonNum)}
                            className={`rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                              isActive
                                ? "border-primary-500 bg-primary-600 text-white"
                                : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
                            }`}
                          >
                            Season {seasonNum} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="max-h-72 space-y-2 overflow-y-auto pr-1 text-xs">
                      {(seriesSeasonData.episodesBySeason[activeSeason] ?? []).map((episode) => {
                        const epNo = episode.epNumber ?? episode.episodeNumber ?? 0;
                        const epPlayback = episode.mux_playback_id || episode.muxPlaybackId || episode.mux_video_id;
                        return (
                          <div
                            key={episode.episodeId ?? episode.id ?? `${activeSeason}-${epNo}`}
                            className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-semibold text-slate-100">
                                S{String(episode.seasonNumber ?? 1).padStart(2, "0")}E{String(epNo).padStart(2, "0")} — {episode.title}
                              </p>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                  epPlayback
                                    ? "bg-emerald-500/15 text-emerald-300"
                                    : "bg-amber-500/15 text-amber-300"
                                }`}
                              >
                                {epPlayback ? "Ready" : "Belum Tersedia"}
                              </span>
                            </div>
                            <p className="break-all text-[11px] text-slate-400">
                              Playback ID: {epPlayback || "-"}
                            </p>
                          </div>
                        );
                      })}
                      {!(seriesSeasonData.episodesBySeason[activeSeason] ?? []).length && (
                        <div className="rounded-xl border border-dashed border-slate-800 p-4 text-center text-slate-500">
                          <p>Belum ada episode di Season {activeSeason}.</p>
                          <Link
                            href={`/upload?tab=episode&seriesId=${encodeURIComponent(selectedItem.id)}&season=${activeSeason}`}
                            className="mt-2 inline-block text-xs font-semibold text-primary-300 hover:underline"
                          >
                            + Upload Episode Pertama di Season {activeSeason}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2 rounded-xl border border-slate-800/80 bg-slate-900/60 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Status Asset Mux</p>
                  {muxLoading ? (
                    <p className="text-xs text-slate-500">Memuat data dari Mux...</p>
                  ) : muxError ? (
                    <p className="text-xs text-rose-400">{muxError}</p>
                  ) : muxDetails ? (
                    <ul className="space-y-1 text-xs text-slate-400">
                      <li className="break-all">Asset ID: <span className="text-slate-200">{muxDetails.assetId ?? muxDetails.id ?? "-"}</span></li>
                      <li>Status: <span className="text-emerald-300">{muxDetails.status ?? "-"}</span></li>
                      <li>Kualitas: <span className="text-slate-200">{muxDetails.video_quality ?? muxDetails.encoding_tier ?? "basic"}</span></li>
                      {muxDetails.duration && <li>Durasi: <span className="text-slate-200">{formatDuration(muxDetails.duration)}</span></li>}
                      {muxDetails.max_stored_resolution && <li>Resolusi: <span className="text-slate-200">{muxDetails.max_stored_resolution}</span></li>}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-500">Belum ada data asset Mux.</p>
                  )}
                </div>

                <div className="flex flex-wrap gap-3 border-t border-slate-800/80 pt-4">
                  <button
                    type="button"
                    onClick={() => setEditMode(selectedItem.type)}
                    className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-500"
                  >
                    Edit {selectedItem.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(selectedItem)}
                    className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                  >
                    Hapus Konten
                  </button>
                </div>
              </div>
            )}

            {editMode === CONTENT_TYPES.MOVIE && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <h3 className="text-lg font-semibold text-slate-100">Edit Movie: {selectedItem.title}</h3>
                  <button
                    type="button"
                    onClick={() => setEditMode(null)}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    ← Kembali ke Detail
                  </button>
                </div>
                <MovieForm
                  initialData={selectedItem}
                  submitLabel="Perbarui Movie"
                  onSuccess={(payload) => {
                    setSelectedItem((prev) => ({ ...(prev ?? {}), ...payload }));
                    setDetailError(null);
                    setMuxError(null);
                    setMuxDetails(null);
                    refreshAfterEdit();
                  }}
                />
              </div>
            )}

            {editMode === CONTENT_TYPES.SERIES && (
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <h3 className="text-lg font-semibold text-slate-100">Edit Series: {selectedItem.title}</h3>
                  <button
                    type="button"
                    onClick={() => setEditMode(null)}
                    className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
                  >
                    ← Kembali ke Detail
                  </button>
                </div>
                <SeriesForm
                  initialData={selectedItem}
                  submitLabel="Perbarui Series"
                  onSuccess={(payload) => {
                    setSelectedItem((prev) => ({ ...(prev ?? {}), ...payload }));
                    setDetailError(null);
                    setMuxError(null);
                    setMuxDetails(null);
                    refreshAfterEdit();
                  }}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
