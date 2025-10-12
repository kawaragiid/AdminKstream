"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_CATEGORIES, SUBTITLE_LANGUAGES } from "@/utils/constants";
import { convertSrtToVtt } from "@/utils/subtitles";

const defaultMovie = {
  title: "",
  description: "",
  category: CONTENT_CATEGORIES[0],
  mux_playback_id: "",
  mux_asset_id: "",
  mux_video_id: "", // legacy for compatibility
  thumbnail: "",
  trailer: "",
  subtitles: [],
  tags: [],
};

const emptySubtitle = { lang: "en", label: "English", url: "" };

export default function MovieForm({ initialData, onSuccess, submitLabel = "Simpan Movie" }) {
  const [formData, setFormData] = useState({ ...defaultMovie, ...initialData });
  const [message, setMessage] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [trailerStart, setTrailerStart] = useState("");
  const [trailerEnd, setTrailerEnd] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [currentVideoFile, setCurrentVideoFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState("upload");
  const [uploadStatus, setUploadStatus] = useState(initialData?.mux_playback_id || initialData?.mux_video_id ? "success" : "idle");
  const [subtitleUploadStatus, setSubtitleUploadStatus] = useState((initialData?.subtitles ?? []).some((item) => item?.url && /^https?:\/\//i.test(item.url)) ? "success" : "idle");
  const [subtitleSyncStatus, setSubtitleSyncStatus] = useState("idle");
  const [isSyncingSubtitles, setIsSyncingSubtitles] = useState(false);

  const categoryOptions = useMemo(() => CONTENT_CATEGORIES, []);
  const lastFetchedPlaybackRef = useRef(null);

  useEffect(() => {
    setFormData({ ...defaultMovie, ...initialData });
    setUploadStatus(initialData?.mux_playback_id || initialData?.mux_video_id ? "success" : "idle");
    const hasInitialSubtitles = (initialData?.subtitles ?? []).some((item) => item?.url && /^https?:\/\//i.test(item.url));
    setSubtitleUploadStatus(hasInitialSubtitles ? "success" : "idle");
    setSubtitleSyncStatus(hasInitialSubtitles ? "success" : "idle");
    setCurrentVideoFile(null);
    setUploadProgress(0);
    setThumbnailFile(null);
    setIsSyncingSubtitles(false);
  }, [initialData]);
  useEffect(() => {
    const hasValidSubtitle = (formData.subtitles ?? []).some((item) => item?.url && /^https?:\/\//i.test(item.url));
    if (hasValidSubtitle) {
      setSubtitleUploadStatus((prev) => (prev === "success" ? prev : "success"));
    } else if (!(formData.subtitles ?? []).length) {
      setSubtitleUploadStatus("idle");
    }
  }, [formData.subtitles]);

  useEffect(() => {
    if ((formData.mux_playback_id || formData.mux_video_id) && !["uploading", "hashing"].includes(uploadStatus)) {
      setUploadStatus("success");
    }
  }, [formData.mux_playback_id, formData.mux_video_id, uploadStatus]);

  useEffect(() => {
    if (!initialData?.id) return;
    const playback = formData.mux_playback_id ?? formData.mux_video_id ?? "";
    const assetId = formData.mux_asset_id ?? null;
    if (!playback && !assetId) return;
    if (assetId && lastFetchedPlaybackRef.current === playback) return;
    let cancelled = false;

    const ensureMuxMetadata = async () => {
      let targetAssetId = assetId;
      if (!targetAssetId && playback) {
        targetAssetId = await fetchAssetIdFromPlayback(playback);
      }
      if (!targetAssetId || cancelled) return;

      try {
        const res = await fetch(`/api/mux/assets/${targetAssetId}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const playbackFromAsset = json?.data?.playback_ids?.find((pb) => pb?.policy === "public")?.id ?? json?.data?.playback_ids?.[0]?.id ?? playback ?? null;

        setFormData((prev) => {
          const nextPlayback = playbackFromAsset ?? prev.mux_playback_id ?? prev.mux_video_id ?? "";
          if (prev.mux_asset_id === targetAssetId && prev.mux_playback_id === nextPlayback) {
            return prev;
          }
          lastFetchedPlaybackRef.current = nextPlayback || playback || null;
          return {
            ...prev,
            mux_asset_id: targetAssetId,
            mux_playback_id: nextPlayback,
            mux_video_id: nextPlayback || prev.mux_video_id || prev.mux_playback_id || "",
          };
        });
        setUploadStatus("success");
      } catch (error) {
        console.warn("[MUX DEBUG] Failed refreshing movie metadata from Mux", error?.message ?? error);
      }
    };

    ensureMuxMetadata();

    return () => {
      cancelled = true;
    };
  }, [initialData?.id, formData.mux_asset_id, formData.mux_playback_id, formData.mux_video_id]);

  async function computeFileHash(file) {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hashArray = Array.from(new Uint8Array(digest));
    const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
    return { sha256, size: file.size };
  }

  const handleSubtitleSync = async () => {
    const validTracks = (formData.subtitles ?? []).filter((item) => item?.url && /^https?:\/\//i.test(item.url));
    if (!validTracks.length) {
      setSubtitleSyncStatus("error");
      setMessage({ type: "warning", text: "Tambahkan subtitle dengan URL publik sebelum mengirim ke Mux." });
      return;
    }

    const assetId = formData.mux_asset_id || formData.mux_video_id || formData.mux_playback_id;
    if (!assetId) {
      setSubtitleSyncStatus("error");
      setMessage({ type: "warning", text: "Asset ID Mux belum tersedia. Unggah video terlebih dahulu." });
      return;
    }

    setSubtitleSyncStatus("loading");
    setIsSyncingSubtitles(true);
    try {
      const ok = await syncSubtitlesToMux({
        assetId,
        playbackId: formData.mux_playback_id,
        subtitles: formData.subtitles ?? [],
      });
      if (!ok) {
        setSubtitleSyncStatus("error");
        setMessage({ type: "error", text: "Gagal mengirim subtitle ke Mux." });
        return;
      }
      setSubtitleSyncStatus("success");
      setMessage({ type: "success", text: "Subtitle berhasil dikirim ke Mux." });
    } catch (error) {
      setSubtitleSyncStatus("error");
      setMessage({ type: "error", text: error?.message ?? "Gagal mengirim subtitle ke Mux." });
    } finally {
      setIsSyncingSubtitles(false);
    }
  };

  const subtitleEntries = formData.subtitles ?? [];
  const subtitlesConfigured = subtitleEntries.some((item) => item?.url || item?.label || item?.lang);
  const hasValidSubtitleUrl = subtitleEntries.some((item) => item?.url && /^https?:\/\//i.test(item.url));
  const videoReady = uploadStatus === "success" || Boolean(formData.mux_playback_id ?? formData.mux_video_id);
  const subtitlesUploadReady = !subtitlesConfigured || (hasValidSubtitleUrl && subtitleUploadStatus === "success");
  const subtitlesSyncReady = !subtitlesConfigured || subtitleSyncStatus === "success";
  const canSyncSubtitles = hasValidSubtitleUrl && Boolean(formData.mux_asset_id || formData.mux_video_id || formData.mux_playback_id);
  const canSaveMovie = videoReady && subtitlesUploadReady && subtitlesSyncReady;

  const handleDirectUpload = async (file) => {
    if (!file) return;
    setMessage({ type: "info", text: "Memproses video sebelum diunggah ke Mux..." });
    setUploadStatus("hashing");
    setUploadProgress(1);
    setCurrentVideoFile(file);

    try {
      const fp = await computeFileHash(file);

      try {
        const foundRes = await fetch("/api/uploads/lookup", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fingerprint: fp, type: "movie" }),
        });
        if (foundRes.ok) {
          const found = await foundRes.json();
          const match = found?.data;
          if (match?.mux_playback_id) {
            setFormData((prev) => ({
              ...prev,
              mux_playback_id: match.mux_playback_id,
              mux_video_id: match.mux_playback_id,
              mux_asset_id: match.mux_asset_id ?? prev.mux_asset_id ?? null,
              fileHash: fp,
              thumbnail: prev.thumbnail || match.thumbnail || "",
              trailer: prev.trailer || match.trailer || "",
            }));
            setUploadStatus("success");
            setUploadProgress(0);
            setCurrentVideoFile(null);
            setSubtitleSyncStatus("idle");
            setMessage({ type: "info", text: "Video sudah ada di Mux. Playback ID terisi otomatis." });
            return;
          }
        }
      } catch {
        /* ignore lookup errors */
      }

      const response = await fetch("/api/mux/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "movie" }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal membuat direct upload.");
      }

      if (result.warning) {
        const fallbackPlayback = result.data?.playback_ids?.[0]?.id ?? "";
        if (fallbackPlayback) {
          setFormData((prev) => ({
            ...prev,
            mux_playback_id: fallbackPlayback,
            mux_video_id: fallbackPlayback,
          }));
          setUploadStatus("success");
          setSubtitleSyncStatus("idle");
        } else {
          setUploadStatus("error");
        }
        setUploadProgress(0);
        setCurrentVideoFile(null);
        setMessage({ type: "info", text: "MUX belum dikonfigurasi. Playback ID mock digunakan." });
        return;
      }

      const uploadUrl = result.data?.url;
      const uploadId = result.data?.id;
      if (!uploadUrl) {
        setUploadStatus("error");
        setUploadProgress(0);
        setMessage({
          type: "warning",
          text: "Tidak mendapatkan upload URL dari Mux. Coba ulang atau unggah via dashboard Mux.",
        });
        return;
      }

      setUploadStatus("uploading");
      setMessage({ type: "info", text: "Mengunggah video ke Mux..." });

      try {
        let ok = false;
        try {
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", uploadUrl);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                setUploadProgress(percent);
              }
            };
            xhr.onload = () => {
              setUploadProgress(100);
              xhr.status >= 200 && xhr.status < 300 ? resolve(true) : reject(new Error("Upload gagal"));
            };
            xhr.onerror = () => reject(new Error("Network error"));
            xhr.send(file);
          });
          ok = true;
        } catch {}

        if (!ok) {
          try {
            const postRes = await fetch(uploadUrl, { method: "POST", body: file });
            ok = postRes.ok;
          } catch {}
        }

        if (!ok) {
          const proxyUrl = `/api/mux/proxy-upload?method=PUT&url=${encodeURIComponent(uploadUrl)}`;
          setUploadProgress((prev) => (prev < 90 ? 90 : prev));
          const proxyRes = await fetch(proxyUrl, { method: "POST", body: file });
          ok = proxyRes.ok;
          setUploadProgress(100);
        }

        if (!ok) {
          throw new Error("Upload ke Mux gagal (CORS atau jaringan).");
        }
      } catch (uploadError) {
        console.error(uploadError);
        setUploadStatus("error");
        setUploadProgress(0);
        setCurrentVideoFile(null);
        setMessage({
          type: "warning",
          text: "Upload Mux gagal. Anda bisa mengisi playback ID manual dari dashboard Mux.",
        });
        return;
      }

      let playbackId = result.data?.playback_ids?.[0]?.id ?? null;
      let assetId = result.data?.asset_id ?? null;
      const startTime = Date.now();
      const pollTimeout = 120000;
      while (Date.now() - startTime < pollTimeout) {
        if (playbackId && assetId) break;
        try {
          const statusRes = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(uploadId)}`);
          const statusJson = await statusRes.json().catch(() => ({}));
          if (statusRes.ok) {
            playbackId = playbackId ?? statusJson?.data?.asset?.playback_ids?.[0]?.id ?? statusJson?.data?.status?.playback_ids?.[0]?.id ?? null;
            assetId = assetId ?? statusJson?.data?.asset?.id ?? statusJson?.data?.status?.asset_id ?? null;
          } else {
            console.warn("[MUX DEBUG] Upload status error", uploadId, statusRes.status, statusJson);
          }
        } catch (pollErr) {
          console.warn("[MUX DEBUG] Upload status fetch failed", uploadId, pollErr?.message ?? pollErr);
        }
        await muxWait(2000);
      }

      if (playbackId && !assetId) {
        assetId = await fetchAssetIdFromPlayback(playbackId);
      }

      if (!playbackId || !assetId) {
        throw new Error("Gagal mendapatkan playbackId / assetId dari Mux.");
      }

      if (thumbnailFile) {
        try {
          const fd = new FormData();
          fd.append("file", thumbnailFile);
          const imgRes = await fetch("/api/uploads/image", { method: "POST", body: fd });
          if (imgRes.ok) {
            const imgJson = await imgRes.json();
            if (imgJson?.data?.url) {
              setFormData((prev) => ({ ...prev, thumbnail: imgJson.data.url }));
            }
          }
        } catch (thumbErr) {
          console.warn("[MUX DEBUG] Thumbnail upload failed", thumbErr?.message ?? thumbErr);
        }
      }

      setFormData((prev) => ({
        ...prev,
        mux_playback_id: playbackId,
        mux_video_id: playbackId,
        mux_asset_id: assetId,
        fileHash: fp,
      }));

      const start = parseFloat(trailerStart);
      const end = parseFloat(trailerEnd);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        const trailerUrl = `https://stream.mux.com/${playbackId}.m3u8?start=${start}&end=${end}`;
        setFormData((prev) => ({ ...prev, trailer: trailerUrl }));
      }

      setUploadStatus("success");
      setUploadProgress(0);
      setCurrentVideoFile(null);
      setSubtitleSyncStatus("idle");
      setMessage({ type: "success", text: "Upload video berhasil. Playback ID terisi otomatis." });
    } catch (error) {
      console.error(error);
      setUploadStatus("error");
      setUploadProgress(0);
      setCurrentVideoFile(null);
      setMessage({ type: "error", text: error.message });
    }
  };

  const addSubtitle = () => {
    setFormData((prev) => ({
      ...prev,
      subtitles: [...(prev.subtitles ?? []), emptySubtitle],
    }));
    setSubtitleUploadStatus("idle");
    setSubtitleSyncStatus("idle");
  };

  const updateSubtitle = (index, field, value) => {
    setFormData((prev) => {
      const subtitles = [...(prev.subtitles ?? [])];
      subtitles[index] = {
        ...subtitles[index],
        [field]: value,
      };
      return { ...prev, subtitles };
    });
    setSubtitleSyncStatus("idle");
  };

  const removeSubtitle = (index) => {
    setFormData((prev) => {
      const subtitles = [...(prev.subtitles ?? [])];
      subtitles.splice(index, 1);
      return { ...prev, subtitles };
    });
    setSubtitleSyncStatus("idle");
  };

  const handleSubtitleFile = async (index, file) => {
    if (!file) return;

    try {
      setSubtitleUploadStatus("processing");
      const text = await file.text();
      const mimeType = file.type || (file.name.endsWith(".srt") ? "application/x-subrip" : undefined);
      let converted = text;

      if (mimeType === "application/x-subrip" || file.name.endsWith(".srt")) {
        converted = convertSrtToVtt(text);
      }

      const vttBlob = new Blob([converted], { type: "text/vtt" });
      const vttFile = new File([vttBlob], file.name.replace(/\.srt$/i, ".vtt"), { type: "text/vtt" });
      const fd = new FormData();
      fd.append("file", vttFile, vttFile.name);
      const lang = formData.subtitles?.[index]?.lang || "en";
      const label = formData.subtitles?.[index]?.label || lang;
      fd.append("lang", lang);
      fd.append("label", label);

      const res = await fetch("/api/uploads/subtitle", { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? "Gagal mengunggah subtitle.");
      }
      const json = await res.json().catch(() => ({}));
      const url = json?.data?.url ?? "";
      updateSubtitle(index, "url", url);
      setSubtitleUploadStatus("success");
      setSubtitleSyncStatus("idle");
      setMessage({ type: "success", text: "Subtitle berhasil diunggah. Segera kirim ke Mux." });
    } catch (error) {
      console.error(error);
      setSubtitleUploadStatus("error");
      setMessage({ type: "error", text: error?.message ?? "Gagal mengunggah subtitle." });
    }
  };

  const muxWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function fetchAssetIdFromPlayback(playbackId) {
    if (!playbackId) return null;
    try {
      const res = await fetch(`/api/mux/resolve-asset?playbackId=${encodeURIComponent(playbackId)}`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("[MUX DEBUG] resolve-asset failed", playbackId, res.status, body?.error ?? body);
        return null;
      }
      return body?.data?.assetId ?? null;
    } catch (error) {
      console.warn("[MUX DEBUG] resolve-asset error", playbackId, error?.message ?? error);
      return null;
    }
  }

  async function syncSubtitlesToMux({ assetId, playbackId, subtitles = [] } = {}) {
    if (!Array.isArray(subtitles) || !subtitles.length) return false;
    let targetAssetId = assetId ?? null;
    if (!targetAssetId && playbackId) {
      targetAssetId = await fetchAssetIdFromPlayback(playbackId);
    }
    if (!targetAssetId) {
      console.warn("[MUX DEBUG] Subtitle sync skipped - assetId unresolved", { playbackId });
      return false;
    }
    try {
      const validTracks = subtitles
        .filter((s) => /^https?:\/\//i.test(s.url))
        .map((s) => ({
          url: s.url,
          language_code: s.lang || "en",
          name: s.label || s.lang || "Subtitle",
        }));

      if (!validTracks.length) return false;

      const res = await fetch("/api/mux/text-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: targetAssetId, tracks: validTracks }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("[MUX DEBUG] Subtitle sync failed", targetAssetId, res.status, json);
        return false;
      }
      console.log("[MUX DEBUG] Subtitle sync success", targetAssetId, json);
      return true;
    } catch (err) {
      console.warn("[MUX DEBUG] Subtitle sync error", err?.message ?? err);
      return false;
    }
  }

  // Form submit handler
  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage(null);
    setErrors({});
    try {
      // Validate required fields
      const newErrors = {};
      if (!formData.title?.trim()) newErrors.title = "Judul wajib diisi.";
      if (!formData.description?.trim()) newErrors.description = "Deskripsi wajib diisi.";
      if (!formData.category?.trim()) newErrors.category = "Kategori wajib diisi.";
      if (!(formData.mux_playback_id?.trim() || formData.mux_video_id?.trim())) {
        newErrors.mux_playback_id = "Playback ID wajib diisi.";
      }
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
        setIsSubmitting(false);
        setMessage({ type: "error", text: "Mohon lengkapi semua field yang wajib diisi." });
        return;
      }

      if (!videoReady) {
        setIsSubmitting(false);
        setMessage({ type: "warning", text: "Selesaikan upload video ke Mux terlebih dahulu." });
        return;
      }

      if (!subtitlesUploadReady) {
        setIsSubmitting(false);
        setMessage({ type: "warning", text: "Pastikan semua subtitle memiliki URL publik sebelum menyimpan." });
        return;
      }

      if (!subtitlesSyncReady) {
        setIsSubmitting(false);
        setMessage({ type: "warning", text: "Kirim subtitle ke Mux terlebih dahulu sebelum menyimpan." });
        return;
      }

      // Simpan movie ke backend
      const response = await fetch("/api/movies/save", {
        method: initialData?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal menyimpan movie.");
      }

      setMessage({ type: "success", text: "Movie berhasil disimpan." });

      if (!initialData?.id) {
        setFormData(defaultMovie);
        setUploadStatus("idle");
        setSubtitleUploadStatus("idle");
        setSubtitleSyncStatus("idle");
        setUploadProgress(0);
        setCurrentVideoFile(null);
      }
      onSuccess?.(result.data ?? formData);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      <div className="grid gap-4 sm:grid-cols-1 md:grid-cols-2">
        <label className="block text-sm text-slate-300">
          Judul Movie
          <input
            value={formData.title ?? ""}
            onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
            disabled={!videoReady}
            className="mt-2 w-full rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-950 px-3 sm:px-4 py-2 sm:py-3 text-sm text-slate-200 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-60"
            required
          />
          {errors.title && <p className="mt-1 text-xs text-rose-400">{errors.title}</p>}
        </label>
        <label className="block text-sm text-slate-300">
          Kategori
          <select
            value={formData.category ?? categoryOptions[0]}
            onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
            disabled={!videoReady}
            className="mt-2 w-full rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-950 px-3 sm:px-4 py-2 sm:py-3 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {categoryOptions.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
          {errors.category && <p className="mt-1 text-xs text-rose-400">{errors.category}</p>}
        </label>
      </div>
      <label className="block text-sm text-slate-300">
        <span className="inline-block mb-1">Deskripsi / Sinopsis</span>
        <textarea
          value={formData.description ?? ""}
          onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
          rows={4}
          disabled={!videoReady}
          className="mt-1 w-full rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-950 px-3 sm:px-4 py-2 sm:py-3 text-sm text-slate-200 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40 disabled:cursor-not-allowed disabled:opacity-60"
          required
        />
        {errors.description && <p className="mt-1 text-xs text-rose-400">{errors.description}</p>}
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">
          Thumbnail URL (opsional)
          <input
            value={formData.thumbnail ?? ""}
            onChange={(event) => setFormData((prev) => ({ ...prev, thumbnail: event.target.value }))}
            placeholder="https://..."
            disabled={!videoReady}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
            <label className="text-primary-200 hover:text-primary-100">
              <input type="file" accept="image/*" onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)} disabled={!videoReady} className="hidden" />
              <span className="cursor-pointer">Pilih file thumbnail</span>
            </label>
            {thumbnailFile && <span>{thumbnailFile.name}</span>}
          </span>
        </label>
        <label className="text-sm text-slate-300">
          Trailer URL / Playback ID (opsional)
          <input
            value={formData.trailer ?? ""}
            onChange={(event) => setFormData((prev) => ({ ...prev, trailer: event.target.value }))}
            placeholder="https://stream.mux.com/..."
            disabled={!videoReady}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>
      <div className="space-y-3 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Playback ID Mux</p>
            <p className="text-xs text-slate-500">Isi manual atau upload video untuk mendapatkan playback ID.</p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => setUploadMode("upload")}
              className={`rounded-full px-3 py-1 ${uploadMode === "upload" ? "bg-primary-600 text-white" : "border border-slate-700 text-slate-300 hover:border-primary-500 hover:text-primary-200"}`}
            >
              Upload
            </button>
            <button
              type="button"
              onClick={() => setUploadMode("manual")}
              className={`rounded-full px-3 py-1 ${uploadMode === "manual" ? "bg-primary-600 text-white" : "border border-slate-700 text-slate-300 hover:border-primary-500 hover:text-primary-200"}`}
            >
              Manual
            </button>
          </div>
        </div>

        {uploadMode === "upload" && (
          <div className="flex items-center gap-3 text-xs">
            <label className="text-primary-200 hover:text-primary-100">
              <input type="file" accept="video/*" onChange={(event) => setCurrentVideoFile(event.target.files?.[0] ?? null)} disabled={["uploading", "hashing"].includes(uploadStatus)} className="hidden" />
              <span className="cursor-pointer">Pilih video</span>
            </label>
            <button
              type="button"
              onClick={() => currentVideoFile && handleDirectUpload(currentVideoFile)}
              disabled={["uploading", "hashing"].includes(uploadStatus) || !currentVideoFile}
              className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {["uploading", "hashing"].includes(uploadStatus) ? "Mengunggah..." : "Upload ke Mux"}
            </button>
            {currentVideoFile && <span className="text-slate-500">{currentVideoFile.name}</span>}
          </div>
        )}
        {uploadMode === "upload" && ["uploading", "hashing"].includes(uploadStatus) && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
            <div className="h-2 bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
          </div>
        )}
        <input
          value={formData.mux_playback_id ?? formData.mux_video_id ?? ""}
          onChange={(event) => {
            const value = event.target.value?.trim();
            setFormData((prev) => ({
              ...prev,
              mux_playback_id: value,
              mux_video_id: value,
              mux_asset_id: null, // Reset asset ID when manually changing playback ID
            }));
            if (value) {
              setUploadStatus("success");
            }
          }}
          placeholder="Playback ID dari Mux"
          className="w-full rounded-xl sm:rounded-2xl border border-slate-800 bg-slate-950 px-3 sm:px-4 py-2 sm:py-3 text-sm text-slate-200"
          required
        />
        {(errors.mux_playback_id || errors.mux_video_id) && <p className="text-xs text-rose-400">{errors.mux_playback_id || errors.mux_video_id}</p>}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">
          Trailer Start (detik)
          <input
            type="number"
            min={0}
            step="0.1"
            value={trailerStart}
            onChange={(e) => setTrailerStart(e.target.value)}
            placeholder="mis: 0"
            disabled={!videoReady}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
        <label className="text-sm text-slate-300">
          Trailer End (detik)
          <input
            type="number"
            min={0}
            step="0.1"
            value={trailerEnd}
            onChange={(e) => setTrailerEnd(e.target.value)}
            placeholder="mis: 10"
            disabled={!videoReady}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>
      </div>
      {!videoReady && <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">Unggah video ke Mux terlebih dahulu untuk membuka pengisian metadata dan subtitle.</div>}
      <div className="space-y-3 rounded-xl sm:rounded-3xl border border-slate-800/60 bg-slate-900/60 p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Subtitle Multi Bahasa</p>
            <p className="text-xs text-slate-500">Tambahkan URL subtitle (VTT). File SRT akan otomatis dikonversi.</p>
          </div>
          <button
            type="button"
            onClick={addSubtitle}
            disabled={!videoReady}
            className="w-full sm:w-auto rounded-lg sm:rounded-full border border-slate-700 px-3 py-2 sm:py-1.5 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Tambah Subtitle
          </button>
        </div>

        {(formData.subtitles ?? []).map((subtitle, index) => (
          <div key={index} className="space-y-2 rounded-xl sm:rounded-2xl border border-slate-800/60 bg-slate-950/60 p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <select
                value={subtitle.lang ?? "en"}
                onChange={(event) => updateSubtitle(index, "lang", event.target.value)}
                disabled={!videoReady}
                className="w-full sm:w-32 rounded-lg sm:rounded-xl border border-slate-800 bg-slate-950 px-2 sm:px-3 py-1.5 sm:py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {SUBTITLE_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
              <input
                value={subtitle.label ?? ""}
                onChange={(event) => updateSubtitle(index, "label", event.target.value)}
                placeholder="Label ditampilkan"
                disabled={!videoReady}
                className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              />
              <button
                type="button"
                onClick={() => removeSubtitle(index)}
                disabled={!videoReady}
                className="rounded-full border border-transparent px-3 py-1 text-xs text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Hapus
              </button>
            </div>
            <input
              value={subtitle.url ?? ""}
              onChange={(event) => updateSubtitle(index, "url", event.target.value)}
              placeholder="https://..."
              disabled={!videoReady}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
            />
            <label className="flex items-center justify-between text-xs text-slate-400">
              <span>Upload file .vtt / .srt</span>
              <input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" onChange={(event) => handleSubtitleFile(index, event.target.files?.[0])} className="text-xs" disabled={!videoReady} />
            </label>
          </div>
        ))}
        {errors.subtitles && Array.isArray(errors.subtitles) && <p className="text-xs text-rose-400">Periksa kembali data subtitle.</p>}

        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-xs text-slate-400 gap-3">
          <div>
            <p className="font-medium text-slate-200">Sinkronisasi Subtitle</p>
            <p className="text-[11px] text-slate-500">Pastikan URL subtitle publik sebelum mengirim ke Mux. Subtitle lama akan tetap tersedia.</p>
          </div>
          <button
            type="button"
            onClick={handleSubtitleSync}
            disabled={!canSyncSubtitles || isSyncingSubtitles}
            className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSyncingSubtitles ? "Mengirim..." : "Kirim Subtitle ke Mux"}
          </button>
        </div>
      </div>
      {message && (
        <div
          className={`rounded-xl sm:rounded-2xl border px-3 sm:px-4 py-2.5 sm:py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : message.type === "error"
              ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
              : message.type === "warning"
              ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
              : "border-slate-700 bg-slate-800/60 text-slate-200"
          } sticky bottom-0 z-10 backdrop-blur-sm`}
        >
          {message.text}
        </div>
      )}{" "}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <button
          type="submit"
          disabled={isSubmitting || !canSaveMovie}
          title={!canSaveMovie ? "Selesaikan tahap upload video dan sinkronisasi subtitle terlebih dahulu." : undefined}
          className="rounded-xl sm:rounded-full bg-primary-600 px-4 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700 w-full sm:w-auto"
        >
          {isSubmitting ? "Menyimpan..." : submitLabel}
        </button>
        {initialData?.id && (
          <button
            type="button"
            onClick={() => {
              setFormData({ ...defaultMovie, ...initialData });
              setErrors({});
              setMessage(null);
              setUploadStatus(initialData?.mux_playback_id || initialData?.mux_video_id ? "success" : "idle");
              setSubtitleUploadStatus((initialData?.subtitles ?? []).some((item) => item?.url && /^https?:\/\//i.test(item.url)) ? "success" : "idle");
              setSubtitleSyncStatus("idle");
            }}
            className="rounded-full border border-slate-700 px-5 py-3 text-sm text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Reset perubahan
          </button>
        )}
      </div>
    </form>
  );
}
