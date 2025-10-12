"use client";

import { useEffect, useMemo, useState } from "react";
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

  const categories = useMemo(() => ["", ...CONTENT_CATEGORIES], []);

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
  }, [selectedItem]);

  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
      <div className="space-y-6">
        <form onSubmit={applyFilters} className="grid gap-4 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6 md:grid-cols-3">
          <label className="text-sm text-slate-300 md:col-span-2">
            Pencarian
            <input
              type="search"
              value={filters.search}
              onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value }))}
              placeholder="Cari judul, kategori, atau deskripsi"
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200"
            />
          </label>
          <label className="text-sm text-slate-300">
            Kategori
            <select value={filters.category} onChange={(event) => setFilters((prev) => ({ ...prev, category: event.target.value }))} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200">
              {categories.map((category) => (
                <option key={category || "all"} value={category}>
                  {category || "Semua"}
                </option>
              ))}
            </select>
          </label>
          <div className="md:col-span-3 flex items-center justify-end gap-3">
            <button type="button" onClick={resetFilters} className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white">
              Reset
            </button>
            <button type="submit" className="rounded-full bg-primary-600 px-5 py-2 text-xs font-semibold text-white hover:bg-primary-500">
              Terapkan Filter
            </button>
          </div>
        </form>

        <div className="overflow-hidden rounded-3xl border border-slate-800/60">
          <table className="hidden min-w-full divide-y divide-slate-800/60 md:table">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Judul</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Type</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">Kategori</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Tanggal</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {items.map((item) => (
                <tr key={`${item.type}-${item.id}`} className="transition hover:bg-slate-900/60">
                  <td className="px-4 py-4 text-sm font-medium text-slate-100">{item.title}</td>
                  <td className="px-4 py-4 text-sm text-slate-300">{item.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"}</td>
                  <td className="px-4 py-4 text-sm text-slate-300">{item.category}</td>
                  <td className="px-4 py-4 text-right text-sm text-slate-300">{item.createdAt ? new Date(item.createdAt).toLocaleDateString("id-ID") : "-"}</td>
                  <td className="px-4 py-4 text-right text-sm text-slate-300">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => openDetails(item)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-primary-500 hover:text-primary-200">
                        Detail
                      </button>
                      <button type="button" onClick={() => handleDelete(item)} className="rounded-full border border-transparent px-3 py-1.5 text-xs font-semibold text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10">
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={5}>
                    Tidak ada konten.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {loading && <div className="px-4 py-6 text-center text-sm text-slate-400">Memuat konten...</div>}
          {error && <div className="px-4 py-6 text-center text-sm text-rose-300">{error}</div>}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        {!selectedItem && <p className="text-sm text-slate-500">Pilih konten untuk melihat detail atau mengedit.</p>}

        {selectedItem && !editMode && (
          <div className="space-y-4">
            <header className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-slate-500">Detail Konten</p>
              <h3 className="text-lg font-semibold text-slate-100">{selectedItem.title}</h3>
              <p className="text-xs text-slate-500">
                {selectedItem.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"} • {selectedItem.category}
              </p>
            </header>
            {detailLoading && <p className="text-xs text-slate-500">Memuat data terbaru dari Firestore...</p>}
            {detailError && <p className="text-xs text-rose-400">{detailError}</p>}
            <p className="text-sm text-slate-300 whitespace-pre-line">{selectedItem.description}</p>
            {selectedItem.type === CONTENT_TYPES.MOVIE ? (
              <ul className="space-y-1 text-xs text-slate-400">
                <li>Playback ID: {selectedItem.mux_playback_id ?? selectedItem.mux_video_id}</li>
                {selectedItem.trailer && <li>Trailer: {selectedItem.trailer}</li>}
                {selectedItem.thumbnail && <li>Thumbnail: {selectedItem.thumbnail}</li>}
                <li>Subtitle: {(selectedItem.subtitles ?? []).length} track</li>
              </ul>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-slate-200">Daftar Episode</p>
                <div className="space-y-2 text-xs text-slate-400">
                  {(selectedItem.episodes ?? []).map((episode) => (
                    <div key={episode.episodeId ?? episode.epNumber} className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3">
                      <p className="text-sm text-slate-200">
                        Ep {episode.epNumber} — {episode.title}
                      </p>
                      <p className="text-xs text-slate-500 line-clamp-3">{episode.description}</p>
                      <p className="text-xs text-slate-500">Playback ID: {episode.mux_playback_id ?? episode.mux_video_id}</p>
                    </div>
                  ))}
                  {!selectedItem.episodes?.length && <p>Belum ada episode.</p>}
                </div>
              </div>
            )}
            <div className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3">
              <p className="text-sm font-semibold text-slate-200">Status Asset Mux</p>
              {muxLoading ? (
                <p className="text-xs text-slate-500">Memuat data dari Mux...</p>
              ) : muxError ? (
                <p className="text-xs text-rose-400">{muxError}</p>
              ) : muxDetails ? (
                <ul className="space-y-1 text-xs text-slate-400">
                  <li>Asset ID: {muxDetails.assetId ?? muxDetails.id ?? "-"}</li>
                  <li>Status: {muxDetails.status ?? "-"}</li>
                  {muxDetails.duration && <li>Durasi: {formatDuration(muxDetails.duration)}</li>}
                  {muxDetails.max_stored_resolution && <li>Resolusi: {muxDetails.max_stored_resolution}</li>}
                  {muxDetails.created_at && <li>Dibuat: {new Date(muxDetails.created_at).toLocaleString("id-ID")}</li>}
                </ul>
              ) : (
                <p className="text-xs text-slate-500">Belum ada data asset Mux.</p>
              )}
            </div>
            <div className="flex flex-wrap gap-3">
              <button type="button" onClick={() => setEditMode(selectedItem.type)} className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-primary-500 hover:text-primary-200">
                Edit {selectedItem.type === CONTENT_TYPES.MOVIE ? "Movie" : "Series"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedItem(null);
                  setEditMode(null);
                  setDetailError(null);
                  setDetailLoading(false);
                  setMuxDetails(null);
                  setMuxError(null);
                  setMuxLoading(false);
                }}
                className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {selectedItem && editMode === CONTENT_TYPES.MOVIE && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Edit Movie</h3>
              <button
                type="button"
                onClick={() => {
                  setEditMode(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Kembali
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

        {selectedItem && editMode === CONTENT_TYPES.SERIES && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-100">Edit Series</h3>
              <button
                type="button"
                onClick={() => {
                  setEditMode(null);
                }}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Kembali
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
  );
}
