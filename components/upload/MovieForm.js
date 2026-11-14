"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_CATEGORIES, SUBTITLE_LANGUAGES } from "@/utils/constants";
import { convertSrtToVtt } from "@/utils/subtitles";

const isValidSubtitleEntry = (item) =>
  Boolean(item && (item.source === "mux" || item.muxTrackId || (item.url && /^https?:\/\//i.test(item.url))));

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
  const [currentVideoFile, setCurrentVideoFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState("upload");
  const [uploadStatus, setUploadStatus] = useState(initialData?.mux_playback_id || initialData?.mux_video_id ? "success" : "idle");
  const [subtitleUploadStatus, setSubtitleUploadStatus] = useState((initialData?.subtitles ?? []).some(isValidSubtitleEntry) ? "success" : "idle");
  const [subtitleSyncStatus, setSubtitleSyncStatus] = useState((initialData?.subtitles ?? []).some(isValidSubtitleEntry) ? "success" : "idle");
  const [isSyncingSubtitles, setIsSyncingSubtitles] = useState(false);
  const [studioStep, setStudioStep] = useState(1);
  const [isDragging, setIsDragging] = useState(false);

  const categoryOptions = useMemo(() => CONTENT_CATEGORIES, []);
  const lastFetchedPlaybackRef = useRef(null);

  useEffect(() => {
    setFormData({ ...defaultMovie, ...initialData });
    setUploadStatus(initialData?.mux_playback_id || initialData?.mux_video_id ? "success" : "idle");
    const hasInitialSubtitles = (initialData?.subtitles ?? []).some(isValidSubtitleEntry);
    setSubtitleUploadStatus(hasInitialSubtitles ? "success" : "idle");
    setSubtitleSyncStatus(hasInitialSubtitles ? "success" : "idle");
    setCurrentVideoFile(null);
    setUploadProgress(0);
    setIsSyncingSubtitles(false);
  }, [initialData]);
  useEffect(() => {
    const hasValidSubtitle = (formData.subtitles ?? []).some(isValidSubtitleEntry);
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
    if (!file) return null;
    const MAX_FULL_HASH = 64 * 1024 * 1024; // 64MB threshold for full hashing
    const SAMPLE_SIZE = 2 * 1024 * 1024; // 2MB per sample for large files

    try {
      if (file.size <= MAX_FULL_HASH) {
        const buf = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buf);
        const hashArray = Array.from(new Uint8Array(digest));
        const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return { sha256, size: file.size };
      }

      // Sampled hashing: first, middle, last chunks to avoid huge memory usage
      const first = file.slice(0, SAMPLE_SIZE);
      const middleStart = Math.max(0, Math.floor(file.size / 2) - Math.floor(SAMPLE_SIZE / 2));
      const middle = file.slice(middleStart, middleStart + SAMPLE_SIZE);
      const lastStart = Math.max(0, file.size - SAMPLE_SIZE);
      const last = file.slice(lastStart, lastStart + SAMPLE_SIZE);
      const [b1, b2, b3] = await Promise.all([
        first.arrayBuffer(),
        middle.arrayBuffer(),
        last.arrayBuffer(),
      ]);
      const totalLen = b1.byteLength + b2.byteLength + b3.byteLength;
      const combined = new Uint8Array(totalLen);
      combined.set(new Uint8Array(b1), 0);
      combined.set(new Uint8Array(b2), b1.byteLength);
      combined.set(new Uint8Array(b3), b1.byteLength + b2.byteLength);
      const digest = await crypto.subtle.digest("SHA-256", combined);
      const hashArray = Array.from(new Uint8Array(digest));
      const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
      return { sha256, size: file.size };
    } catch (_e) {
      // Final fallback: hash lightweight metadata to keep flow unblocked
      try {
        const encoder = new TextEncoder();
        const meta = `${file.name}:${file.size}:${file.lastModified ?? 0}`;
        const digest = await crypto.subtle.digest("SHA-256", encoder.encode(meta));
        const hashArray = Array.from(new Uint8Array(digest));
        const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return { sha256, size: file.size };
      } catch {
        return { sha256: String(file.size), size: file.size };
      }
    }
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
  const subtitlesConfigured = subtitleEntries.some((item) => item?.url || item?.label || item?.lang || item?.source === "mux" || item?.muxTrackId);
  const hasValidSubtitleUrl = subtitleEntries.some(isValidSubtitleEntry);
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
        body: JSON.stringify({
          type: "movie",
          title: formData.title?.trim() || undefined,
          externalId: initialData?.id || undefined,
        }),
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
      let assetReady = false;
      const startTime = Date.now();
      const pollTimeout = 120000;
      while (Date.now() - startTime < pollTimeout) {
        if (playbackId && assetId && assetReady) break;
        try {
          const statusRes = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(uploadId)}`);
          const statusJson = await statusRes.json().catch(() => ({}));
          if (statusRes.ok) {
            playbackId = playbackId ?? statusJson?.data?.asset?.playback_ids?.[0]?.id ?? statusJson?.data?.status?.playback_ids?.[0]?.id ?? null;
            assetId = assetId ?? statusJson?.data?.asset?.id ?? statusJson?.data?.status?.asset_id ?? null;
            const currentAssetStatus = statusJson?.data?.asset?.status ?? statusJson?.data?.status?.status;
            if (currentAssetStatus === "ready") {
              assetReady = true;
            }
          } else {
            console.warn("[MUX DEBUG] Upload status error", uploadId, statusRes.status, statusJson);
          }
        } catch (pollErr) {
          console.warn("[MUX DEBUG] Upload status fetch failed", uploadId, pollErr?.message ?? pollErr);
        }
        if (playbackId && assetId && assetReady) break;
        await muxWait(2000);
      }

      if (playbackId && !assetId) {
        assetId = await fetchAssetIdFromPlayback(playbackId);
      }

      if (!playbackId || !assetId) {
        throw new Error("Gagal mendapatkan playbackId / assetId dari Mux.");
      }

      setFormData((prev) => ({
        ...prev,
        thumbnail: prev.thumbnail?.trim() ? prev.thumbnail : `https://image.mux.com/${playbackId}/thumbnail.jpg?time=5`,
      }));

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
      let userMessage = error.message;
      if (error.name === 'NotReadableError' || error.message.includes('could not be read')) {
        userMessage = 'File tidak bisa dibaca. Pastikan file tidak sedang digunakan, tidak berada di network drive, dan periksa izin akses file.';
      }
      setUploadStatus("error");
      setUploadProgress(0);
      setCurrentVideoFile(null);
      setMessage({ type: "error", text: userMessage });
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
      const failedItems = Array.isArray(json?.data) ? json.data.filter((item) => item?.ok === false) : [];
      if (!res.ok || failedItems.length > 0) {
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

      const submissionData = { ...formData };

      const playbackForThumb = submissionData.mux_playback_id || submissionData.mux_video_id;
      if (!submissionData.thumbnail?.trim() && playbackForThumb) {
        submissionData.thumbnail = `https://image.mux.com/${playbackForThumb}/thumbnail.jpg?time=5`;
      }

      const playbackForTrailer = submissionData.mux_playback_id || submissionData.mux_video_id;
      const start = parseFloat(trailerStart);
      const end = parseFloat(trailerEnd);
      if (
        playbackForTrailer &&
        !Number.isNaN(start) &&
        !Number.isNaN(end) &&
        end > start &&
        (!submissionData.trailer?.trim() || /\?start=.*&end=/.test(submissionData.trailer))
      ) {
        const trailerUrl = `https://stream.mux.com/${playbackForTrailer}.m3u8?start=${start}&end=${end}`;
        submissionData.trailer = trailerUrl;
        setFormData((prev) => ({ ...prev, trailer: trailerUrl }));
      }

      // Simpan movie ke backend (create: /api/movies, update: /api/movies/:id)
      const response = await fetch(`/api/movies${initialData?.id ? `/${initialData.id}` : ""}`, {
        method: initialData?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(submissionData),
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
        setTrailerStart("");
        setTrailerEnd("");
      }
      onSuccess?.(result.data ?? submissionData);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const previewThumb =
    formData.thumbnail?.trim() ||
    (formData.mux_playback_id || formData.mux_video_id
      ? `https://image.mux.com/${formData.mux_playback_id || formData.mux_video_id}/thumbnail.jpg?time=5`
      : "");

  const studioSteps = [
    { id: 1, label: "1. Video & Detail" },
    { id: 2, label: "2. Subtitle & Trailer" },
    { id: 3, label: "3. Tinjau & Publikasikan" },
  ];

  const onDropVideo = (event) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && !["uploading", "hashing"].includes(uploadStatus)) {
      setCurrentVideoFile(file);
      handleDirectUpload(file);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* YouTube Studio Stepper */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-800/80 pb-4">
        {studioSteps.map((step) => {
          const isActive = studioStep === step.id;
          return (
            <button
              key={step.id}
              type="button"
              onClick={() => setStudioStep(step.id)}
              className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
                isActive
                  ? "bg-primary-600/20 text-primary-200 border border-primary-500/40"
                  : "border border-slate-800 bg-slate-950/60 text-slate-400 hover:text-slate-200"
              }`}
            >
              {step.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[3fr_2fr] items-start">
        {/* Kolom Kiri: Form Studio */}
        <div className="space-y-5">
          {studioStep === 1 && (
            <>
              {/* Dropzone Upload Video */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDropVideo}
                className={`rounded-2xl border-2 border-dashed p-5 transition ${
                  isDragging
                    ? "border-primary-500 bg-primary-500/10"
                    : "border-slate-800 bg-slate-950/60"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">Sumber Video Mux</p>
                    <p className="text-xs text-slate-400">
                      Tarik file video ke sini atau isi Playback ID manual.
                    </p>
                  </div>
                  <div className="inline-flex rounded-lg border border-slate-800 bg-slate-900 p-0.5 text-xs">
                    <button
                      type="button"
                      onClick={() => setUploadMode("upload")}
                      className={`rounded-md px-3 py-1 font-medium ${
                        uploadMode === "upload" ? "bg-primary-600 text-white" : "text-slate-400"
                      }`}
                    >
                      Upload File
                    </button>
                    <button
                      type="button"
                      onClick={() => setUploadMode("manual")}
                      className={`rounded-md px-3 py-1 font-medium ${
                        uploadMode === "manual" ? "bg-primary-600 text-white" : "text-slate-400"
                      }`}
                    >
                      Playback ID
                    </button>
                  </div>
                </div>

                {uploadMode === "upload" && (
                  <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800/80 bg-slate-900/50 px-4 py-6 text-center space-y-3">
                    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-800 text-xl">
                      ⬆️
                    </span>
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-slate-200">
                        {currentVideoFile ? currentVideoFile.name : "Pilih file MP4 atau MKV untuk diupload ke Mux"}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Otomatis menggunakan Basic Quality ($0 encoding) &amp; maksimal 1080p.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2.5">
                      <label className="cursor-pointer rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:border-primary-500">
                        <input
                          type="file"
                          accept=".mp4,.mkv,video/mp4,video/x-matroska"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setCurrentVideoFile(file);
                          }}
                          disabled={["uploading", "hashing"].includes(uploadStatus)}
                          className="hidden"
                        />
                        Pilih File Video
                      </label>
                      {currentVideoFile && (
                        <button
                          type="button"
                          onClick={() => handleDirectUpload(currentVideoFile)}
                          disabled={["uploading", "hashing"].includes(uploadStatus)}
                          className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-50"
                        >
                          {["uploading", "hashing"].includes(uploadStatus) ? `Mengunggah ${uploadProgress}%` : "Mulai Upload"}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-3">
                  <input
                    value={formData.mux_playback_id ?? formData.mux_video_id ?? ""}
                    onChange={(event) => {
                      const value = event.target.value?.trim();
                      setFormData((prev) => ({
                        ...prev,
                        mux_playback_id: value,
                        mux_video_id: value,
                        mux_asset_id: null,
                      }));
                      if (value) setUploadStatus("success");
                    }}
                    placeholder="Playback ID Mux (terisi otomatis setelah upload)"
                    className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-xs text-slate-200"
                    required
                  />
                  {(errors.mux_playback_id || errors.mux_video_id) && (
                    <p className="mt-1 text-xs text-rose-400">{errors.mux_playback_id || errors.mux_video_id}</p>
                  )}
                </div>
              </div>

              {/* Detail Metadata (bisa diisi sembari upload berjalan) */}
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block text-xs font-medium text-slate-300">
                  Judul Movie *
                  <input
                    value={formData.title ?? ""}
                    onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
                    placeholder="Masukkan judul movie"
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-primary-500"
                    required
                  />
                  {errors.title && <p className="mt-1 text-xs text-rose-400">{errors.title}</p>}
                </label>

                <label className="block text-xs font-medium text-slate-300">
                  Kategori *
                  <select
                    value={formData.category ?? categoryOptions[0]}
                    onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-primary-500"
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

              <label className="block text-xs font-medium text-slate-300">
                Deskripsi / Sinopsis *
                <textarea
                  value={formData.description ?? ""}
                  onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                  rows={4}
                  placeholder="Ceritakan sinopsis singkat movie..."
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200 outline-none focus:border-primary-500"
                  required
                />
                {errors.description && <p className="mt-1 text-xs text-rose-400">{errors.description}</p>}
              </label>

              <label className="block text-xs font-medium text-slate-300">
                Thumbnail URL (opsional — kosongkan untuk otomatis dari Mux)
                <input
                  value={formData.thumbnail ?? ""}
                  onChange={(event) => setFormData((prev) => ({ ...prev, thumbnail: event.target.value }))}
                  placeholder="https://..."
                  className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-200"
                />
              </label>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setStudioStep(2)}
                  className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                >
                  Lanjut: Subtitle &amp; Trailer →
                </button>
              </div>
            </>
          )}

          {studioStep === 2 && (
            <>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-300">Trailer Clip (Hemat Biaya)</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-300">
                    Trailer Start (detik)
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={trailerStart}
                      onChange={(e) => setTrailerStart(e.target.value)}
                      placeholder="mis: 0"
                      className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200"
                    />
                  </label>
                  <label className="text-xs text-slate-300">
                    Trailer End (detik)
                    <input
                      type="number"
                      min={0}
                      step="0.1"
                      value={trailerEnd}
                      onChange={(e) => setTrailerEnd(e.target.value)}
                      placeholder="mis: 15"
                      className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200"
                    />
                  </label>
                </div>
                <label className="block text-xs text-slate-300">
                  Atau Trailer URL Manual (opsional)
                  <input
                    value={formData.trailer ?? ""}
                    onChange={(event) => setFormData((prev) => ({ ...prev, trailer: event.target.value }))}
                    placeholder="https://stream.mux.com/..."
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200"
                  />
                </label>
              </div>

              <div className="space-y-3 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-slate-200">Subtitle Multi Bahasa</p>
                    <p className="text-xs text-slate-500">File SRT otomatis dikonversi ke VTT.</p>
                  </div>
                  <button
                    type="button"
                    onClick={addSubtitle}
                    disabled={!videoReady}
                    className="rounded-xl border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-primary-500 disabled:opacity-50"
                  >
                    + Tambah Subtitle
                  </button>
                </div>

                {(formData.subtitles ?? []).map((subtitle, index) => (
                  <div key={index} className="space-y-2 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={subtitle.lang ?? "en"}
                        onChange={(event) => updateSubtitle(index, "lang", event.target.value)}
                        disabled={!videoReady}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-2.5 py-1.5 text-xs text-slate-200"
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
                        placeholder="Label"
                        disabled={!videoReady}
                        className="flex-1 rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
                      />
                      <button
                        type="button"
                        onClick={() => removeSubtitle(index)}
                        disabled={!videoReady}
                        className="rounded-lg px-2.5 py-1 text-xs text-rose-300 hover:bg-rose-500/10"
                      >
                        Hapus
                      </button>
                    </div>
                    <input
                      value={subtitle.url ?? ""}
                      onChange={(event) => updateSubtitle(index, "url", event.target.value)}
                      placeholder="https://..."
                      disabled={!videoReady}
                      className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-200"
                    />
                    <label className="flex items-center justify-between text-xs text-slate-400">
                      <span>Upload .vtt / .srt</span>
                      <input
                        type="file"
                        accept=".vtt,.srt,text/vtt,application/x-subrip"
                        onChange={(event) => handleSubtitleFile(index, event.target.files?.[0])}
                        className="text-xs"
                        disabled={!videoReady}
                      />
                    </label>
                  </div>
                ))}

                <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 py-2.5 text-xs">
                  <span className="text-slate-300">Kirim subtitle ke Mux setelah URL terisi</span>
                  <button
                    type="button"
                    onClick={handleSubtitleSync}
                    disabled={!canSyncSubtitles || isSyncingSubtitles}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 font-semibold text-slate-200 hover:border-primary-500 disabled:opacity-50"
                  >
                    {isSyncingSubtitles ? "Mengirim..." : "Kirim Subtitle ke Mux"}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStudioStep(1)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  ← Kembali
                </button>
                <button
                  type="button"
                  onClick={() => setStudioStep(3)}
                  className="rounded-xl bg-slate-800 px-5 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700"
                >
                  Lanjut: Tinjau →
                </button>
              </div>
            </>
          )}

          {studioStep === 3 && (
            <div className="space-y-4 rounded-2xl border border-slate-800/80 bg-slate-950/60 p-5">
              <h3 className="text-sm font-semibold text-slate-100">Checklist Sebelum Publikasi</h3>
              <ul className="space-y-2 text-xs">
                <li className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5">
                  <span className="text-slate-300">Video Mux Siap</span>
                  <span className={videoReady ? "font-semibold text-emerald-400" : "font-semibold text-amber-400"}>
                    {videoReady ? "✓ Siap" : "Belum selesai"}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5">
                  <span className="text-slate-300">Judul &amp; Deskripsi</span>
                  <span className={formData.title && formData.description ? "font-semibold text-emerald-400" : "font-semibold text-amber-400"}>
                    {formData.title && formData.description ? "✓ Lengkap" : "Belum lengkap"}
                  </span>
                </li>
                <li className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3.5 py-2.5">
                  <span className="text-slate-300">Subtitle</span>
                  <span className={subtitlesSyncReady ? "font-semibold text-emerald-400" : "font-semibold text-amber-400"}>
                    {subtitlesSyncReady ? "✓ Siap / Tidak ada" : "Perlu kirim ke Mux"}
                  </span>
                </li>
              </ul>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStudioStep(2)}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
                >
                  ← Kembali
                </button>
                <div className="flex items-center gap-2">
                  {initialData?.id && (
                    <button
                      type="button"
                      onClick={() => {
                        setFormData({ ...defaultMovie, ...initialData });
                        setErrors({});
                        setMessage(null);
                      }}
                      className="rounded-xl border border-slate-700 px-4 py-2.5 text-xs text-slate-300 hover:text-white"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSubmitting || !canSaveMovie}
                    className="rounded-xl bg-primary-600 px-6 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700"
                  >
                    {isSubmitting ? "Menyimpan..." : submitLabel}
                  </button>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div
              className={`rounded-xl border px-4 py-3 text-xs ${
                message.type === "success"
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
                  : message.type === "error"
                  ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                  : message.type === "warning"
                  ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
                  : "border-slate-700 bg-slate-800/60 text-slate-200"
              }`}
            >
              {message.text}
            </div>
          )}
        </div>

        {/* Kolom Kanan: Sticky Studio Preview & Status Card */}
        <aside className="lg:sticky lg:top-24 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-4 space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900">
            {previewThumb ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewThumb} alt="Preview" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full flex-col items-center justify-center text-xs text-slate-500">
                <span className="text-2xl mb-1">🎬</span>
                <span>Preview Video</span>
              </div>
            )}
            <span className="absolute right-2 top-2 rounded-full border border-emerald-500/35 bg-black/75 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 backdrop-blur-md">
              Basic • 1080p Max
            </span>
          </div>

          {["uploading", "hashing"].includes(uploadStatus) && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-slate-300">
                  {uploadStatus === "hashing" ? "Memeriksa duplikat..." : "Mengunggah ke Mux..."}
                </span>
                <span className="font-semibold text-primary-300 tabular-nums">{uploadProgress}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                <div className="h-full bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            </div>
          )}

          <div className="space-y-2 text-xs">
            <div>
              <p className="text-slate-500">Judul</p>
              <p className="font-semibold text-slate-100 truncate">{formData.title || "Belum ada judul"}</p>
            </div>
            <div>
              <p className="text-slate-500">Playback ID</p>
              <p className="break-all font-mono text-[11px] text-slate-300">
                {formData.mux_playback_id || formData.mux_video_id || "Menunggu upload..."}
              </p>
            </div>
            {formData.mux_asset_id && (
              <div>
                <p className="text-slate-500">Asset ID</p>
                <p className="break-all font-mono text-[11px] text-slate-400">{formData.mux_asset_id}</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </form>
  );
}
