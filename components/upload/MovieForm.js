"use client";

import { useMemo, useState } from "react";
import {
  CONTENT_CATEGORIES,
  SUBTITLE_LANGUAGES,
} from "@/utils/constants";
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
  const [uploading, setUploading] = useState(false);
  const [videoFile, setVideoFile] = useState(null);
  const [trailerStart, setTrailerStart] = useState("");
  const [trailerEnd, setTrailerEnd] = useState("");
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [subtitleFiles, setSubtitleFiles] = useState({}); // map index -> File(VTT)

  const categoryOptions = useMemo(() => CONTENT_CATEGORIES, []);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadMode, setUploadMode] = useState('upload');
  
  async function computeFileHash(file) {
    const buf = await file.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buf);
    const hashArray = Array.from(new Uint8Array(digest));
    const sha256 = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    return { sha256, size: file.size };
  }

  const handleDirectUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setMessage(null);

    try {
      // 1) Dedup check by fingerprint
      const fp = await computeFileHash(file);
      try {
        const foundRes = await fetch('/api/uploads/lookup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fingerprint: fp, type: 'movie' }),
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
              thumbnail: prev.thumbnail || match.thumbnail || '',
              trailer: prev.trailer || match.trailer || '',
            }));
            setMessage({ type: 'info', text: 'Video sudah ada di Mux. Menggunakan asset yang tersedia.' });
            return;
          }
        }
      } catch { /* ignore */ }

      // 2) Create direct upload on Mux
      const response = await fetch('/api/mux/direct-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'movie' }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? 'Gagal membuat direct upload.');
      }

      if (result.warning) {
        const fallbackPlayback = result.data?.playback_ids?.[0]?.id ?? '';
        if (fallbackPlayback) {
          setFormData((prev) => ({ ...prev, mux_playback_id: fallbackPlayback, mux_video_id: fallbackPlayback }));
        }
        setMessage({ type: 'info', text: 'MUX belum dikonfigurasi. Playback ID mock digunakan.' });
        return;
      }

      setMessage({ type: 'info', text: 'Mengunggah video ke Mux...' });

      const uploadUrl = result.data?.url;
      const uploadId = result.data?.id;
      if (!uploadUrl) {
        setMessage({
          type: 'warning',
          text: 'Tidak mendapatkan upload URL dari Mux. Coba ulang atau unggah via dashboard Mux.',
        });
        return;
      }

      try {
        let ok = false;
        // Coba direct PUT dengan progress via XHR terlebih dahulu
        try {
          await new Promise((resolve, reject) => {
            const xhr = new XMLHttpRequest();
            xhr.open('PUT', uploadUrl);
            xhr.upload.onprogress = (e) => {
              if (e.lengthComputable) {
                const percent = Math.round((e.loaded / e.total) * 100);
                setUploadProgress(percent);
              }
            };
            xhr.onload = () => {
              setUploadProgress(100);
              (xhr.status >= 200 && xhr.status < 300) ? resolve(true) : reject(new Error('Upload gagal'));
            };
            xhr.onerror = () => reject(new Error('Network error'));
            xhr.send(file);
          });
          ok = true;
        } catch (_) {}

        // Jika gagal, coba POST (beberapa URL Mux menerima POST)
        if (!ok) {
          try {
            const postRes = await fetch(uploadUrl, { method: 'POST', body: file });
            ok = postRes.ok;
          } catch (_) {}
        }

        // Jika masih gagal karena CORS, pakai proxy server-side
        if (!ok) {
          const proxyUrl = `/api/mux/proxy-upload?method=PUT&url=${encodeURIComponent(uploadUrl)}`;
          // Proxy tidak memberi progress granular; tampilkan loading 90% -> 100%
          setUploadProgress((p) => (p < 90 ? 90 : p));
          const proxyRes = await fetch(proxyUrl, { method: 'POST', body: file });
          ok = proxyRes.ok;
          setUploadProgress(100);
        }

        if (!ok) {
          throw new Error('Upload ke Mux gagal (CORS atau jaringan).');
        }
      } catch (uploadError) {
        console.error(uploadError);
        setMessage({
          type: 'warning',
          text: 'Upload Mux gagal. Anda bisa mengisi playback ID manual dari dashboard Mux.',
        });
        return;
      }

      // 3) Poll status sampai playbackId dan assetId tersedia
      let playbackId = result.data?.playback_ids?.[0]?.id ?? null;
      let assetId = result.data?.asset_id ?? null;
      const startTime = Date.now();
      const pollTimeout = 120000;
      while (Date.now() - startTime < pollTimeout) {
        if (playbackId && assetId) {
          break;
        }
        try {
          const statusRes = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(uploadId)}`);
          const statusJson = await statusRes.json().catch(() => ({}));
          if (statusRes.ok) {
            playbackId = playbackId ?? statusJson?.data?.asset?.playback_ids?.[0]?.id ?? statusJson?.data?.status?.playback_ids?.[0]?.id ?? null;
            assetId = assetId ?? statusJson?.data?.asset?.id ?? statusJson?.data?.status?.asset_id ?? null;
            console.log("[MUX DEBUG] Poll upload status", { uploadId, playbackId, assetId });
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
        throw new Error('Gagal mendapatkan playbackId / assetId dari Mux.');
      }

      console.log('[MUX DEBUG] Upload resolved', { uploadId, playbackId, assetId });

      // Upload thumbnail file (jika ada)
      if (thumbnailFile) {
        try {
          const fd = new FormData();
          fd.append('file', thumbnailFile);
          const imgRes = await fetch('/api/uploads/image', { method: 'POST', body: fd });
          if (imgRes.ok) {
            const imgJson = await imgRes.json();
            if (imgJson?.data?.url) {
              setFormData((prev) => ({ ...prev, thumbnail: imgJson.data.url }));
            }
          }
        } catch (thumbErr) {
          console.warn('[MUX DEBUG] Thumbnail upload failed', thumbErr?.message ?? thumbErr);
        }
      }

      setFormData((prev) => ({
        ...prev,
        mux_playback_id: playbackId,
        mux_video_id: playbackId,
        mux_asset_id: assetId,
        fileHash: fp,
      }));
      // Jika admin isi rentang trailer, jadikan URL trailer dari playback utama
      const start = parseFloat(trailerStart);
      const end = parseFloat(trailerEnd);
      if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) {
        const trailerUrl = `https://stream.mux.com/${playbackId}.m3u8?start=${start}&end=${end}`;
        setFormData((prev) => ({ ...prev, trailer: trailerUrl }));
      }

      // 4) Unggah subtitle file (jika ada) lalu sinkronkan ke Mux
      try {
        const subtitleSnapshot = [...(formData.subtitles ?? [])];
        const indices = Object.keys(subtitleFiles || {});
        for (const idx of indices) {
          const fileObj = subtitleFiles[idx];
          if (!fileObj) continue;
          const fd = new FormData();
          fd.append('file', fileObj, fileObj.name);
          const lang = formData.subtitles?.[idx]?.lang || 'en';
          const label = formData.subtitles?.[idx]?.label || lang;
          fd.append('lang', lang);
          fd.append('label', label);
          try {
            const upRes = await fetch('/api/uploads/subtitle', { method: 'POST', body: fd });
            if (upRes.ok) {
              const upJson = await upRes.json();
              if (upJson?.data?.url) {
                subtitleSnapshot[idx] = {
                  ...(subtitleSnapshot[idx] ?? {}),
                  url: upJson.data.url,
                  lang,
                  label,
                };
                updateSubtitle(Number(idx), 'url', upJson.data.url);
              }
            } else {
              console.warn('[MUX DEBUG] Subtitle upload failed', upRes.status);
            }
          } catch (fileErr) {
            console.warn('[MUX DEBUG] Subtitle upload error', fileErr?.message ?? fileErr);
          }
        }

        await syncSubtitlesToMux({ assetId, playbackId, subtitles: subtitleSnapshot });
      } catch (subtitleErr) {
        console.warn('[MUX DEBUG] Subtitle sync pipeline error', subtitleErr?.message ?? subtitleErr);
      }

      setMessage({ type: 'success', text: 'Upload video berhasil. Playback ID terisi otomatis.' });
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: error.message });
    } finally {
      setUploading(false);
    }
  };

  const handleUploadPackage = async () => {
    if (!videoFile) {
      setMessage({ type: 'warning', text: 'Pilih file video terlebih dahulu.' });
      return;
    }
    await handleDirectUpload(videoFile);
    setVideoFile(null);
  };

  const addSubtitle = () => {
    setFormData((prev) => ({
      ...prev,
      subtitles: [...(prev.subtitles ?? []), emptySubtitle],
    }));
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
  };

  const removeSubtitle = (index) => {
    setFormData((prev) => {
      const subtitles = [...(prev.subtitles ?? [])];
      subtitles.splice(index, 1);
      return { ...prev, subtitles };
    });
  };

  const handleSubtitleFile = async (index, file) => {
    if (!file) return;

    try {
      const text = await file.text();
      const mimeType = file.type || (file.name.endsWith(".srt") ? "application/x-subrip" : undefined);
      let converted = text;

      if (mimeType === "application/x-subrip" || file.name.endsWith(".srt")) {
        converted = convertSrtToVtt(text);
      }

      const vttBlob = new Blob([converted], { type: "text/vtt" });
      const vttFile = new File([vttBlob], file.name.replace(/\.srt$/i, ".vtt"), { type: "text/vtt" });
      setSubtitleFiles((prev) => ({ ...prev, [index]: vttFile }));
      updateSubtitle(index, "url", vttFile.name);
      setMessage({ type: "info", text: "Subtitle siap diunggah bersama paket. Tekan 'Upload ke Mux'." });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: "Gagal membaca file subtitle." });
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
    if (!Array.isArray(subtitles) || !subtitles.length) return;
    let targetAssetId = assetId ?? null;
    if (!targetAssetId && playbackId) {
      targetAssetId = await fetchAssetIdFromPlayback(playbackId);
    }
    if (!targetAssetId) {
      console.warn("[MUX DEBUG] Subtitle sync skipped - assetId unresolved", { playbackId });
      return;
    }
    try {
      const validTracks = subtitles
        .filter((s) => /^https?:\/\//i.test(s.url))
        .map((s) => ({
          url: s.url,
          language_code: s.lang || "en",
          name: s.label || s.lang || "Subtitle",
        }));

      if (!validTracks.length) return;

      const res = await fetch("/api/mux/text-tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetId: targetAssetId, tracks: validTracks }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.warn("[MUX DEBUG] Subtitle sync failed", targetAssetId, res.status, json);
        return;
      }
      console.log("[MUX DEBUG] Subtitle sync success", targetAssetId, json);
    } catch (err) {
      console.warn("[MUX DEBUG] Subtitle sync error", err?.message ?? err);
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
      if (!formData.title) newErrors.title = "Judul wajib diisi.";
      if (!formData.description) newErrors.description = "Deskripsi wajib diisi.";
      if (!formData.category) newErrors.category = "Kategori wajib diisi.";
      if (!formData.mux_playback_id && !formData.mux_video_id) newErrors.mux_playback_id = "Playback ID wajib diisi.";
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
        setIsSubmitting(false);
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

      // Sinkronisasi subtitle ke Mux jika tersedia
      const assetId = formData.mux_asset_id || formData.mux_video_id || formData.mux_playback_id;

      if (assetId && formData.subtitles?.length) {
        await syncSubtitlesToMux({ assetId, playbackId: formData.mux_playback_id, subtitles: formData.subtitles });
      } else {
        console.warn("[mux] Subtitle sync skipped - assetId not found or subtitles empty");
      }

      if (!initialData?.id) {
        setFormData(defaultMovie);
      }
      onSuccess?.(result.data ?? formData);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm text-slate-300">
          Judul Movie
          <input
            value={formData.title ?? ""}
            onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40"
            required
          />
          {errors.title && <p className="mt-1 text-xs text-rose-400">{errors.title}</p>}
        </label>
        <label className="text-sm text-slate-300">
          Kategori
          <select
            value={formData.category ?? categoryOptions[0]}
            onChange={(event) => setFormData((prev) => ({ ...prev, category: event.target.value }))}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
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

      <label className="text-sm text-slate-300">
        Deskripsi / Sinopsis
        <textarea
          value={formData.description ?? ""}
          onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
          rows={4}
          className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40"
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
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
          />
          <span className="mt-2 inline-flex items-center gap-2 text-xs text-slate-400">
            <label className="text-primary-200 hover:text-primary-100">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => setThumbnailFile(e.target.files?.[0] ?? null)}
                className="hidden"
              />
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
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
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
            <button type="button" onClick={() => setUploadMode('upload')} className={`rounded-full px-3 py-1 ${uploadMode==='upload' ? 'bg-primary-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-primary-500 hover:text-primary-200'}`}>Upload</button>
            <button type="button" onClick={() => setUploadMode('manual')} className={`rounded-full px-3 py-1 ${uploadMode==='manual' ? 'bg-primary-600 text-white' : 'border border-slate-700 text-slate-300 hover:border-primary-500 hover:text-primary-200'}`}>Manual</button>
          </div>
        </div>

        {uploadMode === 'upload' && (
          <div className="flex items-center gap-3 text-xs">
            <label className="text-primary-200 hover:text-primary-100">
              <input
                type="file"
                accept="video/*"
                onChange={(event) => setVideoFile(event.target.files?.[0] ?? null)}
                disabled={uploading}
                className="hidden"
              />
              <span className="cursor-pointer">Pilih video</span>
            </label>
            <button
              type="button"
              onClick={handleUploadPackage}
              disabled={uploading || !videoFile}
              className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Upload ke Mux
            </button>
            {videoFile && <span className="text-slate-500">{videoFile.name}</span>}
          </div>
        )}
        {uploadMode === 'upload' && uploading && (
          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
            <div
              className="h-2 bg-primary-500 transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        <input
          value={formData.mux_playback_id ?? formData.mux_video_id ?? ""}
          onChange={(event) => setFormData((prev) => ({ ...prev, mux_playback_id: event.target.value, mux_video_id: event.target.value }))}
          placeholder="Playback ID dari Mux"
          className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
          required
        />
        {(errors.mux_playback_id || errors.mux_video_id) && (
          <p className="text-xs text-rose-400">{errors.mux_playback_id || errors.mux_video_id}</p>
        )}
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
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
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
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
          />
        </label>
      </div>

      <div className="space-y-3 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-200">Subtitle Multi Bahasa</p>
            <p className="text-xs text-slate-500">Tambahkan URL subtitle (VTT). File SRT akan otomatis dikonversi.</p>
          </div>
          <button
            type="button"
            onClick={addSubtitle}
            className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200"
          >
            Tambah Subtitle
          </button>
        </div>

        {(formData.subtitles ?? []).map((subtitle, index) => (
          <div key={index} className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
            <div className="flex items-center gap-3">
              <select
                value={subtitle.lang ?? "en"}
                onChange={(event) => updateSubtitle(index, "lang", event.target.value)}
                className="w-32 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
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
                className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
              />
              <button
                type="button"
                onClick={() => removeSubtitle(index)}
                className="rounded-full border border-transparent px-3 py-1 text-xs text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10"
              >
                Hapus
              </button>
            </div>
            <input
              value={subtitle.url ?? ""}
              onChange={(event) => updateSubtitle(index, "url", event.target.value)}
              placeholder="https://..."
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
            />
            <label className="flex items-center justify-between text-xs text-slate-400">
              <span>Upload file .vtt / .srt</span>
              <input
                type="file"
                accept=".vtt,.srt,text/vtt,application/x-subrip"
                onChange={(event) => handleSubtitleFile(index, event.target.files?.[0])}
                className="text-xs"
              />
            </label>
          </div>
        ))}
        {errors.subtitles && Array.isArray(errors.subtitles) && (
          <p className="text-xs text-rose-400">Periksa kembali data subtitle.</p>
        )}
      </div>

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
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

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700"
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

