"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { SUBTITLE_LANGUAGES } from "@/utils/constants";
import { convertSrtToVtt } from "@/utils/subtitles";
import MuxThumbnail, { resolveMuxSignedUrl } from "@/components/mux/MuxThumbnail";

const createUid = () =>
  typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `uid-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const emptySubtitle = { lang: "id", label: "Indonesia", url: "" };

function normalizePlaybackValue(raw) {
  if (!raw) return "";
  let v = String(raw).trim();
  try {
    if (v.includes("stream.mux.com")) {
      const m = v.match(/stream\.mux\.com\/([^\/?#\.]+)/i);
      if (m?.[1]) v = m[1];
    } else if (v.includes("image.mux.com")) {
      const m = v.match(/image\.mux\.com\/([^\/?#]+)/i);
      if (m?.[1]) v = m[1];
    }
  } catch {}
  return v;
}

async function computeFileHash(file) {
  if (!file) return null;
  const MAX_FULL_HASH = 64 * 1024 * 1024;
  const SAMPLE_SIZE = 2 * 1024 * 1024;
  try {
    if (file.size <= MAX_FULL_HASH) {
      const buffer = await file.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", buffer);
      const sha256 = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      return { sha256, size: file.size };
    }
    const first = file.slice(0, SAMPLE_SIZE);
    const middleStart = Math.max(0, Math.floor(file.size / 2) - Math.floor(SAMPLE_SIZE / 2));
    const middle = file.slice(middleStart, middleStart + SAMPLE_SIZE);
    const lastStart = Math.max(0, file.size - SAMPLE_SIZE);
    const last = file.slice(lastStart, lastStart + SAMPLE_SIZE);
    const [b1, b2, b3] = await Promise.all([first.arrayBuffer(), middle.arrayBuffer(), last.arrayBuffer()]);
    const combined = new Uint8Array(b1.byteLength + b2.byteLength + b3.byteLength);
    combined.set(new Uint8Array(b1), 0);
    combined.set(new Uint8Array(b2), b1.byteLength);
    combined.set(new Uint8Array(b3), b1.byteLength + b2.byteLength);
    const digest = await crypto.subtle.digest("SHA-256", combined.buffer);
    const sha256 = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { sha256, size: file.size };
  } catch {
    return { sha256: String(file.size), size: file.size };
  }
}

export default function EpisodeUploadForm({ initialSeriesId = "", initialSeason = null, onSuccess, onDirtyChange }) {
  const [seriesList, setSeriesList] = useState([]);
  const [loadingSeries, setLoadingSeries] = useState(true);
  const [selectedSeriesId, setSelectedSeriesId] = useState(initialSeriesId || "");
  const [seasonNumber, setSeasonNumber] = useState(initialSeason ? Math.max(1, Number(initialSeason)) : 1);
  const [epNumber, setEpNumber] = useState(1);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState("");
  const [thumbnail, setThumbnail] = useState("");
  const [muxAssetId, setMuxAssetId] = useState("");
  const [muxPlaybackId, setMuxPlaybackId] = useState("");
  const [muxUploadId, setMuxUploadId] = useState("");
  const [fileHash, setFileHash] = useState(null);
  const [subtitles, setSubtitles] = useState([]);

  const [uploadStatus, setUploadStatus] = useState("idle");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentVideoFile, setCurrentVideoFile] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastSavedEpisode, setLastSavedEpisode] = useState(null);
  const xhrRef = useRef(null);
  const abortControllerRef = useRef(null);
  const videoInputRef = useRef(null);
  const epNumberEditedRef = useRef(false);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadSeriesList = async () => {
    setLoadingSeries(true);
    try {
      const res = await fetch("/api/series");
      const json = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(json?.data)) {
        setSeriesList(json.data);
      }
    } catch (err) {
      console.error("Gagal memuat daftar series:", err);
    } finally {
      setLoadingSeries(false);
    }
  };

  useEffect(() => {
    loadSeriesList();
  }, []);

  useEffect(() => {
    if (initialSeriesId) setSelectedSeriesId(initialSeriesId);
  }, [initialSeriesId]);

  useEffect(() => {
    if (initialSeason && Number(initialSeason) >= 1) {
      setSeasonNumber(Number(initialSeason));
    }
  }, [initialSeason]);

  const selectedSeries = useMemo(
    () => seriesList.find((item) => item.id === selectedSeriesId) ?? null,
    [seriesList, selectedSeriesId]
  );

  // Hitung daftar season yang ada pada series terpilih
  const availableSeasons = useMemo(() => {
    if (!selectedSeries) return [1];
    const set = new Set();
    const declared = Number(selectedSeries.totalSeasons ?? 1);
    for (let s = 1; s <= declared; s += 1) set.add(s);
    for (const ep of selectedSeries.episodes ?? []) {
      set.add(Math.max(1, Number(ep.seasonNumber ?? 1)));
    }
    if (seasonNumber >= 1) set.add(Number(seasonNumber));
    return Array.from(set).sort((a, b) => a - b);
  }, [selectedSeries, seasonNumber]);

  const maxExistingSeason = useMemo(() => {
    if (!selectedSeries) return 1;
    let maxS = Number(selectedSeries.totalSeasons ?? 1);
    for (const ep of selectedSeries.episodes ?? []) {
      maxS = Math.max(maxS, Number(ep.seasonNumber ?? 1));
    }
    return maxS;
  }, [selectedSeries]);

  const episodesInSelectedSeason = useMemo(() => {
    if (!selectedSeries) return [];
    return (selectedSeries.episodes ?? [])
      .filter((ep) => Number(ep.seasonNumber ?? 1) === Number(seasonNumber))
      .sort((a, b) => Number(a.epNumber ?? 0) - Number(b.epNumber ?? 0));
  }, [selectedSeries, seasonNumber]);

  // Auto-hitung nomor episode berikutnya ketika Series atau Season berubah
  useEffect(() => {
    if (!selectedSeries || epNumberEditedRef.current) return;
    const maxEp = episodesInSelectedSeason.reduce((max, ep) => Math.max(max, Number(ep.epNumber ?? 0)), 0);
    setEpNumber(maxEp + 1);
  }, [selectedSeriesId, seasonNumber, selectedSeries, episodesInSelectedSeason]);

  const isDuplicateEpNumber = useMemo(() => {
    return episodesInSelectedSeason.some((ep) => Number(ep.epNumber) === Number(epNumber));
  }, [episodesInSelectedSeason, epNumber]);

  const handleVideoFileSelect = async (file) => {
    if (!file) return;
    xhrRef.current?.abort();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    onDirtyChange?.(true);
    setLastSavedEpisode(null);
    setCurrentVideoFile(file);
    setUploadStatus("uploading");
    setUploadProgress(0);
    setMessage({ type: "info", text: "Menyiapkan upload video episode ke Mux (Basic • Max 1080p)..." });

    try {
      const fingerprint = await computeFileHash(file);
      if (controller.signal.aborted) return;
      if (fingerprint) {
        setFileHash(fingerprint);
        try {
          const lookupRes = await fetch("/api/uploads/lookup", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ fingerprint, type: "episode" }),
            signal: controller.signal,
          });
          if (lookupRes.ok) {
            const lookupJson = await lookupRes.json().catch(() => ({}));
            const existing = lookupJson?.data;
            if (existing?.mux_playback_id) {
              setMuxPlaybackId(existing.mux_playback_id);
              setMuxAssetId(existing.mux_asset_id ?? "");
              setUploadProgress(100);
              setUploadStatus("success");
              setMessage({
                type: "success",
                text: "Video identik ditemukan di database! Playback ID otomatis digunakan tanpa upload ulang (hemat kuota Mux).",
              });
              return;
            }
          }
        } catch (err) {
          if (err?.name === "AbortError" || controller.signal.aborted) return;
        }
      }

      const initRes = await fetch("/api/mux/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ corsOrigin: window.location.origin }),
        signal: controller.signal,
      });
      const initJson = await initRes.json().catch(() => ({}));
      if (!initRes.ok) throw new Error(initJson?.error ?? "Gagal membuat URL upload Mux.");

      const uploadUrl = initJson?.data?.url || initJson?.data?.uploadUrl;
      const uploadId = initJson?.data?.id || initJson?.data?.uploadId;
      if (!uploadUrl || !uploadId) throw new Error("Response upload Mux tidak lengkap.");
      setMuxUploadId(uploadId);

      // Upload via XHR untuk progress bar, dengan fallback proxy-upload
      let ok = false;
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open("PUT", uploadUrl, true);
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setUploadProgress(Math.round((ev.loaded / ev.total) * 100));
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload Mux gagal (HTTP ${xhr.status}).`));
          };
          xhr.onerror = () => reject(new Error("Koneksi upload ke Mux terputus."));
          xhr.onabort = () => reject(new DOMException("Aborted", "AbortError"));
          xhr.send(file);
        });
        ok = true;
      } catch (xhrErr) {
        if (xhrErr?.name === "AbortError" || controller.signal.aborted) return;
      }

      if (!ok) {
        const proxyUrl = `/api/mux/proxy-upload?method=PUT&url=${encodeURIComponent(uploadUrl)}`;
        setUploadProgress((prev) => (prev < 90 ? 90 : prev));
        const proxyRes = await fetch(proxyUrl, {
          method: "POST",
          body: file,
          signal: controller.signal,
        });
        ok = proxyRes.ok;
      }

      if (!ok) {
        throw new Error("Upload ke Mux gagal (CORS atau jaringan).");
      }

      setUploadProgress(100);
      setMessage({ type: "info", text: "Video terkirim! Menunggu Mux memproses Playback ID..." });

      // Polling status upload Mux hingga siap atau errored
      let resolvedPlayback = "";
      let resolvedAssetId = "";
      let resolvedDuration = null;
      let assetReady = false;

      for (let i = 0; i < 48; i += 1) {
        if (controller.signal.aborted) return;
        await new Promise((r) => setTimeout(r, 2500));
        if (controller.signal.aborted) return;

        const stRes = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(uploadId)}`, {
          signal: controller.signal,
        });
        const stJson = await stRes.json().catch(() => ({}));
        const asset = stJson?.data?.asset;
        const statusObj = stJson?.data?.status;
        const currentAssetStatus = asset?.status ?? statusObj?.status;
        if (currentAssetStatus === "errored" || statusObj?.status === "errored") {
          throw new Error("Pemrosesan video episode di Mux gagal (errored).");
        }
        const pb = asset?.playback_ids?.[0]?.id || statusObj?.playback_ids?.[0]?.id || "";
        const aid = statusObj?.asset_id || asset?.id || "";
        if (pb) resolvedPlayback = pb;
        if (aid) resolvedAssetId = aid;
        if (asset?.duration) resolvedDuration = Math.round(asset.duration);
        if (currentAssetStatus === "ready" && resolvedPlayback) {
          assetReady = true;
          break;
        }
      }

      if (controller.signal.aborted) return;

      if (resolvedPlayback && assetReady) {
        setMuxPlaybackId(resolvedPlayback);
        setMuxAssetId(resolvedAssetId);
        if (resolvedDuration && !duration) setDuration(String(resolvedDuration));
        setUploadStatus("success");
        setMessage({ type: "success", text: `Video siap! Playback ID: ${resolvedPlayback}` });
      } else if (resolvedPlayback) {
        setMuxPlaybackId(resolvedPlayback);
        setMuxAssetId(resolvedAssetId);
        if (resolvedDuration && !duration) setDuration(String(resolvedDuration));
        setUploadStatus("error");
        setMessage({
          type: "warning",
          text: "Video masih diproses di Mux. Klik 'Cek Status Mux' beberapa saat lagi.",
        });
      } else {
        setUploadStatus("error");
        setMessage({
          type: "warning",
          text: "Video sudah terunggah, tetapi Playback ID belum muncul. Tunggu beberapa detik lalu klik 'Cek Status Mux'.",
        });
      }
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) return;
      setUploadStatus("error");
      setMessage({ type: "error", text: err?.message ?? "Gagal mengunggah video ke Mux." });
    }
  };

  const handleCancelUpload = () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setUploadStatus("idle");
    setUploadProgress(0);
    setCurrentVideoFile(null);
    if (videoInputRef.current) videoInputRef.current.value = "";
    setMessage({ type: "info", text: "Upload video dibatalkan." });
  };

  const handleCheckUploadStatus = async () => {
    if (!muxUploadId) return;
    try {
      const stRes = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(muxUploadId)}`);
      const stJson = await stRes.json().catch(() => ({}));
      const asset = stJson?.data?.asset;
      const statusObj = stJson?.data?.status;
      const pb = asset?.playback_ids?.[0]?.id || statusObj?.playback_ids?.[0]?.id || "";
      const aid = statusObj?.asset_id || asset?.id || "";
      if (pb) {
        setMuxPlaybackId(pb);
        setMuxAssetId(aid);
        if (asset?.duration && !duration) setDuration(String(Math.round(asset.duration)));
        setUploadStatus("success");
        setMessage({ type: "success", text: `Playback ID ditemukan: ${pb}` });
      } else {
        setMessage({ type: "warning", text: "Mux masih memproses video. Coba lagi sebentar lagi." });
      }
    } catch (err) {
      setMessage({ type: "error", text: err?.message ?? "Gagal memeriksa status Mux." });
    }
  };

  const resolveAssetIdFromPlayback = async (playbackId) => {
    const clean = normalizePlaybackValue(playbackId);
    if (!clean) return "";
    try {
      const res = await fetch(`/api/mux/resolve-asset?playbackId=${encodeURIComponent(clean)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return "";
      const resolvedId = json?.data?.assetId ?? "";
      if (resolvedId) {
        setMuxAssetId(resolvedId);
      }
      return resolvedId;
    } catch {
      return "";
    }
  };

  const handleSubtitleFile = async (index, file) => {
    if (!file) return;
    const targetSub = subtitles?.[index];
    const targetUid = targetSub?._uid;
    try {
      const text = await file.text();
      const isSrt = file.type === "application/x-subrip" || file.name.toLowerCase().endsWith(".srt");
      const vttContent = isSrt ? convertSrtToVtt(text) : text;
      const vttFile = new File([new Blob([vttContent], { type: "text/vtt" })], file.name.replace(/\.srt$/i, ".vtt"), {
        type: "text/vtt",
      });
      const fd = new FormData();
      fd.append("file", vttFile, vttFile.name);
      fd.append("lang", targetSub?.lang || "id");
      fd.append("label", targetSub?.label || "Bahasa Indonesia");
      const res = await fetch("/api/uploads/subtitle", { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.data?.url) throw new Error(json?.error ?? "Gagal mengunggah subtitle.");
      setSubtitles((prev) => {
        const next = [...prev];
        const targetIndex = targetUid ? next.findIndex((item) => item?._uid === targetUid) : index;
        if (targetIndex === -1) return prev;
        next[targetIndex] = { ...next[targetIndex], url: json.data.url };
        return next;
      });
      onDirtyChange?.(true);
      setMessage({ type: "success", text: "Subtitle berhasil dikonversi & diunggah." });
    } catch (err) {
      setMessage({ type: "error", text: err?.message ?? "Gagal mengunggah subtitle." });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedSeriesId) {
      setMessage({ type: "error", text: "Pilih Series tujuan terlebih dahulu." });
      return;
    }
    const cleanPlayback = normalizePlaybackValue(muxPlaybackId);
    if (!cleanPlayback) {
      setMessage({ type: "error", text: "Upload video ke Mux atau isi Playback ID terlebih dahulu." });
      return;
    }
    if (!title.trim()) {
      setMessage({ type: "error", text: "Judul episode wajib diisi." });
      return;
    }
    if (description.trim().length < 10) {
      setMessage({ type: "error", text: "Deskripsi episode minimal 10 karakter." });
      return;
    }
    setIsSubmitting(true);
    setMessage(null);

    try {
      const cleanSubtitles = subtitles
        .filter((s) => /^https?:\/\//i.test(s.url || ""))
        .map(({ _uid, ...rest }) => rest);
      let resolvedAssetId = muxAssetId;
      if (!resolvedAssetId && cleanPlayback) {
        resolvedAssetId = await resolveAssetIdFromPlayback(cleanPlayback);
      }
      if (cleanSubtitles.length && resolvedAssetId) {
        const trackRes = await fetch("/api/mux/text-tracks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            assetId: resolvedAssetId,
            tracks: cleanSubtitles.map((s) => ({
              url: s.url,
              language_code: s.lang || "id",
              name: s.label || s.lang || "Subtitle",
            })),
          }),
        });
        const trackJson = await trackRes.json().catch(() => ({}));
        const failedTracks = Array.isArray(trackJson?.data)
          ? trackJson.data.filter((item) => item?.ok === false)
          : [];
        if (!trackRes.ok || failedTracks.length > 0) {
          throw new Error(trackJson?.error ?? "Gagal mengirim subtitle ke Mux. Periksa URL subtitle dan coba lagi.");
        }
      }

      const resolvedThumb =
        thumbnail.trim() ||
        (cleanPlayback ? await resolveMuxSignedUrl({ playbackId: cleanPlayback, type: "thumbnail", time: 5 }) : null);

      const payload = {
        seasonNumber: Number(seasonNumber) || 1,
        epNumber: Number(epNumber) || 1,
        title: title.trim(),
        description: description.trim(),
        duration: duration ? Number(duration) : null,
        thumbnail: resolvedThumb,
        mux_asset_id: resolvedAssetId || null,
        mux_playback_id: cleanPlayback,
        mux_video_id: cleanPlayback,
        mux_upload_id: muxUploadId || null,
        fileHash: fileHash || null,
        subtitles: cleanSubtitles,
      };

      const res = await fetch(`/api/series/${selectedSeriesId}/episodes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error ?? "Gagal menambahkan episode.");
      }

      setLastSavedEpisode({
        seriesTitle: selectedSeries?.title ?? "Series",
        seasonNumber: payload.seasonNumber,
        epNumber: payload.epNumber,
        title: payload.title,
      });
      setMessage({
        type: "success",
        text: `Episode S${String(payload.seasonNumber).padStart(2, "0")}E${String(payload.epNumber).padStart(2, "0")} "${payload.title}" berhasil ditambahkan ke ${selectedSeries?.title ?? "Series"}!`,
      });
      epNumberEditedRef.current = false;
      await loadSeriesList();
      onDirtyChange?.(false);
      onSuccess?.(json?.data ?? payload);

      // Siapkan form untuk episode berikutnya
      setTitle("");
      setDescription("");
      setDuration("");
      setThumbnail("");
      setMuxAssetId("");
      setMuxPlaybackId("");
      setMuxUploadId("");
      setFileHash(null);
      setSubtitles([]);
      setCurrentVideoFile(null);
      if (videoInputRef.current) videoInputRef.current.value = "";
      setUploadStatus("idle");
      setUploadProgress(0);
    } catch (err) {
      setMessage({ type: "error", text: err?.message ?? "Gagal menyimpan episode." });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Langkah 1: Pilih Series & Season */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">1. Pilih Series & Season</h3>
            <p className="text-xs text-slate-400">
              Pilih series yang sudah ada, lalu tentukan season atau buat season baru.
            </p>
          </div>
          {selectedSeries && (
            <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-[11px] text-slate-300">
              {(selectedSeries.episodes ?? []).length} episode tersimpan
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-xs font-medium text-slate-300">
            Series Tujuan
            <select
              value={selectedSeriesId}
              onChange={(e) => {
                epNumberEditedRef.current = false;
                setSelectedSeriesId(e.target.value);
                setSeasonNumber(1);
                setLastSavedEpisode(null);
              }}
              disabled={loadingSeries}
              required
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 focus:border-primary-500 focus:outline-none"
            >
              <option value="">{loadingSeries ? "Memuat daftar series..." : "-- Pilih Series --"}</option>
              {seriesList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title} ({s.totalSeasons ?? 1} Season • {(s.episodes ?? []).length} Ep)
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-300">Season</span>
              {selectedSeries && (
                <button
                  type="button"
                  onClick={() => setSeasonNumber(maxExistingSeason + 1)}
                  className="rounded-lg border border-primary-500/40 bg-primary-500/10 px-2.5 py-1 text-[11px] font-semibold text-primary-300 hover:bg-primary-500/20"
                >
                  + Season Baru (S{String(maxExistingSeason + 1).padStart(2, "0")})
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-0.5">
              {availableSeasons.map((sNum) => {
                const active = Number(seasonNumber) === sNum;
                const count = (selectedSeries?.episodes ?? []).filter(
                  (ep) => Number(ep.seasonNumber ?? 1) === sNum
                ).length;
                return (
                  <button
                    key={sNum}
                    type="button"
                    onClick={() => {
                      epNumberEditedRef.current = false;
                      setSeasonNumber(sNum);
                    }}
                    className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                      active
                        ? "border-primary-500 bg-primary-600 text-white"
                        : "border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700"
                    }`}
                  >
                    Season {sNum} <span className="opacity-75">({count})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {selectedSeries && episodesInSelectedSeason.length > 0 && (
          <div className="rounded-xl border border-slate-800/70 bg-slate-900/50 px-3.5 py-2.5 text-xs text-slate-400">
            Episode terakhir di Season {seasonNumber}:{" "}
            <span className="font-semibold text-slate-200">
              E{String(episodesInSelectedSeason[episodesInSelectedSeason.length - 1]?.epNumber ?? 0).padStart(2, "0")} —{" "}
              {episodesInSelectedSeason[episodesInSelectedSeason.length - 1]?.title}
            </span>
          </div>
        )}
      </div>

      {/* Langkah 2: Upload Video Mux */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">2. Upload Video Episode (Mux Basic • Max 1080p)</h3>
            <p className="text-xs text-slate-400">
              Pilih file video atau tempel Playback ID jika sudah pernah diunggah.
            </p>
          </div>
          {uploadStatus === "success" && (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
              Video Siap
            </span>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="flex flex-col justify-center rounded-xl border border-dashed border-slate-700 bg-slate-900/50 px-4 py-5 text-center cursor-pointer hover:border-primary-500/60">
            <span className="text-xs font-semibold text-slate-200">
              {currentVideoFile ? currentVideoFile.name : "Klik untuk pilih file video (.mp4 / .mkv / .mov)"}
            </span>
            <span className="mt-1 text-[11px] text-slate-400">Otomatis cek duplikat & encoding Basic $0</span>
            <input
              ref={videoInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleVideoFileSelect(file);
              }}
              className="hidden"
            />
          </label>

          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-300">
              Mux Playback ID
              <input
                value={muxPlaybackId}
                onChange={(e) => {
                  setMuxPlaybackId(e.target.value);
                  if (muxAssetId) setMuxAssetId("");
                }}
                onBlur={async (e) => {
                  const clean = normalizePlaybackValue(e.target.value);
                  if (clean !== e.target.value) {
                    setMuxPlaybackId(clean);
                  }
                  if (clean && !muxAssetId) {
                    await resolveAssetIdFromPlayback(clean);
                  }
                }}
                placeholder="Otomatis terisi setelah upload, atau tempel manual"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
              />
            </label>
            {uploadStatus === "uploading" && (
              <div className="space-y-2">
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div
                    className="h-full bg-primary-500 transition-all"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] text-slate-400">Mengunggah ke Mux... {uploadProgress}%</p>
                  <button
                    type="button"
                    onClick={handleCancelUpload}
                    className="min-h-[44px] rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20"
                  >
                    Batalkan Upload
                  </button>
                </div>
              </div>
            )}
            {muxUploadId && !muxPlaybackId && uploadStatus !== "uploading" && (
              <button
                type="button"
                onClick={handleCheckUploadStatus}
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                Cek Status Mux
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Langkah 3: Detail Episode & Subtitle */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-100">3. Detail Episode & Subtitle</h3>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-medium text-slate-300">
            Season
            <input
              type="number"
              min={1}
              value={seasonNumber}
              onChange={(e) => {
                epNumberEditedRef.current = false;
                setSeasonNumber(Math.max(1, Number(e.target.value) || 1));
              }}
              required
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
            />
          </label>
          <label className="text-xs font-medium text-slate-300">
            Nomor Episode
            <input
              type="number"
              min={1}
              value={epNumber}
              onChange={(e) => {
                epNumberEditedRef.current = true;
                onDirtyChange?.(true);
                setEpNumber(Math.max(1, Number(e.target.value) || 1));
              }}
              required
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
            />
            {isDuplicateEpNumber && (
              <span className="mt-1 block text-[11px] text-amber-300">
                Peringatan: S{String(seasonNumber).padStart(2, "0")}E{String(epNumber).padStart(2, "0")} sudah ada.
              </span>
            )}
          </label>
          <label className="text-xs font-medium text-slate-300">
            Durasi (detik)
            <input
              type="number"
              min={0}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="Opsional (otomatis dari Mux)"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
            />
          </label>
        </div>

        <label className="block text-xs font-medium text-slate-300">
          Judul Episode
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`Misal: Episode ${epNumber} — Awal Pertarungan`}
            required
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
          />
        </label>

        <label className="block text-xs font-medium text-slate-300">
          Deskripsi Episode
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Ringkasan singkat episode (minimal 10 karakter)..."
            required
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
          />
        </label>

        <div className="grid gap-4 md:grid-cols-2 items-start">
          <label className="block text-xs font-medium text-slate-300">
            URL Thumbnail Episode (Opsional)
            <input
              value={thumbnail}
              onChange={(e) => setThumbnail(e.target.value)}
              placeholder="https://... (kosongkan untuk thumbnail otomatis Mux)"
              className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100"
            />
          </label>
          {(thumbnail.trim() || normalizePlaybackValue(muxPlaybackId)) && (
            <div className="space-y-1.5">
              <span className="block text-xs font-medium text-slate-300">Preview Thumbnail</span>
              <div className="h-28 overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
                <MuxThumbnail
                  src={thumbnail.trim()}
                  playbackId={normalizePlaybackValue(muxPlaybackId)}
                  alt="Preview thumbnail episode"
                  className="h-28 w-full object-cover"
                />
              </div>
            </div>
          )}
        </div>

        {/* Subtitles */}
        <div className="space-y-2.5 border-t border-slate-800/80 pt-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-300">Subtitle Episode (Opsional)</span>
            <button
              type="button"
              onClick={() => setSubtitles((prev) => [...prev, { ...emptySubtitle, _uid: createUid() }])}
              className="rounded-lg border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary-500"
            >
              + Tambah Subtitle
            </button>
          </div>
          {subtitles.map((sub, idx) => (
            <div key={sub._uid ?? idx} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={sub.lang}
                  onChange={(e) => {
                    const next = [...subtitles];
                    next[idx] = { ...next[idx], lang: e.target.value };
                    setSubtitles(next);
                  }}
                  className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
                >
                  {SUBTITLE_LANGUAGES.map((l) => (
                    <option key={l.code} value={l.code}>
                      {l.label}
                    </option>
                  ))}
                </select>
                <input
                  value={sub.label}
                  onChange={(e) => {
                    const next = [...subtitles];
                    next[idx] = { ...next[idx], label: e.target.value };
                    setSubtitles(next);
                  }}
                  placeholder="Label"
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
                />
                <button
                  type="button"
                  onClick={() => setSubtitles((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-rose-400 hover:text-rose-300"
                >
                  Hapus
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={sub.url}
                  onChange={(e) => {
                    const next = [...subtitles];
                    next[idx] = { ...next[idx], url: e.target.value };
                    setSubtitles(next);
                  }}
                  placeholder="https://... atau upload .srt/.vtt"
                  className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
                />
                <input
                  type="file"
                  accept=".vtt,.srt,text/vtt,application/x-subrip"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (file) handleSubtitleFile(idx, file);
                  }}
                  className="text-xs text-slate-400"
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {message && (
        <div
          role={message.type === "error" ? "alert" : "status"}
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : message.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
              : message.type === "warning"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-slate-700 bg-slate-800/60 text-slate-200"
          }`}
        >
          <p>{message.text}</p>
          {lastSavedEpisode && message.type === "success" && (
            <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
              <Link href="/content" className="font-semibold text-emerald-300 underline hover:text-emerald-200">
                Lihat di Kelola Konten →
              </Link>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting || uploadStatus === "uploading"}
          className="rounded-xl bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:bg-slate-700"
        >
          {isSubmitting ? "Menyimpan Episode..." : "Simpan & Tambahkan Episode"}
        </button>
      </div>
    </form>
  );
}
