"use client";

import { useMemo, useState } from "react";
import { CONTENT_CATEGORIES, SUBTITLE_LANGUAGES } from "@/utils/constants";
import { convertSrtToVtt } from "@/utils/subtitles";

const defaultSeries = {
  title: "",
  description: "",
  category: CONTENT_CATEGORIES[0],
  thumbnail: "",
  trailer: "",
  subtitles: [],
  episodes: [],
  tags: [],
};

const newEpisodeDraft = (index = 0) => ({
  episodeId: undefined,
  epNumber: index + 1,
  title: "",
  description: "",
  mux_playback_id: "",
  mux_asset_id: "",
  mux_video_id: "",
  // Tambahkan field untuk ID unggahan Mux sebagai fallback
  mux_upload_id: "",
  thumbnail: "",
  trailer: "",
  subtitles: [],
});

const emptySubtitle = { lang: "en", label: "English", url: "" };

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `episode-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// SubtitleEditor tetap sebagai komponen terpisah
function SubtitleEditor({ subtitles, onChange, messageSetter }) {
  const addSubtitle = () => {
    onChange([...(subtitles ?? []), emptySubtitle]);
  };

  const updateSubtitle = (index, field, value) => {
    const next = [...(subtitles ?? [])];
    next[index] = { ...next[index], [field]: value };
    onChange(next);
  };

  const removeSubtitle = (index) => {
    const next = [...(subtitles ?? [])];
    next.splice(index, 1);
    onChange(next);
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
      // Upload langsung subtitle ke Storage agar URL bisa dipakai Mux
      const vttBlob = new Blob([converted], { type: "text/vtt" });
      const vttFile = new File([vttBlob], file.name.replace(/\.srt$/i, ".vtt"), { type: "text/vtt" });
      const fd = new FormData();
      fd.append("file", vttFile, vttFile.name);
      const res = await fetch("/api/uploads/subtitle", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Gagal mengunggah subtitle.");
      const json = await res.json();
      const url = json?.data?.url;
      updateSubtitle(index, "url", url ?? "");
      messageSetter?.({ type: "success", text: "Subtitle siap dan URL publik tersimpan." });
    } catch (error) {
      console.error(error);
      messageSetter?.({ type: "error", text: "Gagal mengonversi subtitle." });
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-200">Subtitles</p>
        <button type="button" onClick={addSubtitle} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200">
          Tambah Subtitle
        </button>
      </div>
      {(subtitles ?? []).map((subtitle, index) => (
        <div key={index} className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
          <div className="flex items-center gap-3">
            <select value={subtitle.lang ?? "en"} onChange={(event) => updateSubtitle(index, "lang", event.target.value)} className="w-32 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
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
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
            />
            <button type="button" onClick={() => removeSubtitle(index)} className="rounded-full border border-transparent px-3 py-1 text-xs text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10">
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
            <input type="file" accept=".vtt,.srt,text/vtt,application/x-subrip" onChange={(event) => handleSubtitleFile(index, event.target.files?.[0])} />
          </label>
        </div>
      ))}
    </div>
  );
}

// HAPUS KOMPONEN EpisodeForm. Seluruh logikanya diintegrasikan ke SeriesForm.

export default function SeriesForm({ initialData, onSuccess, submitLabel = "Simpan Series" }) {
  const [formData, setFormData] = useState({ ...defaultSeries, ...initialData });
  const [message, setMessage] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // STATE UNTUK EDITOR EPISODE
  const [editingEpisodeIndex, setEditingEpisodeIndex] = useState(null);
  const [episodeDraft, setEpisodeDraft] = useState(newEpisodeDraft());

  // STATE UNTUK UPLOAD VIDEO
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentVideoFile, setCurrentVideoFile] = useState(null);

  const categoryOptions = useMemo(() => CONTENT_CATEGORIES, []);

  const openEpisodeEditor = (index = null) => {
    if (index === null) {
      setEpisodeDraft(newEpisodeDraft(formData.episodes?.length ?? 0));
      setEditingEpisodeIndex(formData.episodes?.length ?? 0);
      setCurrentVideoFile(null); // Reset file yang dipilih saat buka editor baru
      return;
    }
    const selected = formData.episodes?.[index];
    setEpisodeDraft({ ...selected });
    setEditingEpisodeIndex(index);
    setCurrentVideoFile(null);
  };

  const closeEpisodeEditor = () => {
    setEditingEpisodeIndex(null);
    setEpisodeDraft(newEpisodeDraft());
    setUploadProgress(0);
    setCurrentVideoFile(null);
  };

  const normalizePlaybackValue = (raw) => {
    if (!raw) return "";
    let v = String(raw).trim();
    // Extract from common Mux URLs
    try {
      if (v.includes("stream.mux.com")) {
        // e.g. https://stream.mux.com/{playbackId}.m3u8 or with query params
        const m = v.match(/stream\.mux\.com\/([^\/?#\.]+)/i);
        if (m?.[1]) v = m[1];
      } else if (v.includes("image.mux.com")) {
        // e.g. https://image.mux.com/{playbackId}/thumbnail.jpg?time=1
        const m = v.match(/image\.mux\.com\/([^\/?#]+)/i);
        if (m?.[1]) v = m[1];
      }
    } catch {}
    return v;
  };

  // ✅ UPLOAD EPISODE KE MUX + SUBTITLE
  const handleDirectUpload = async (file) => {
    if (!file) return;
    setMessage({ type: "info", text: "Mengunggah video episode ke Mux..." });
    setUploadProgress(1);
    setCurrentVideoFile(file);

    try {
      // 1. Minta upload URL dari /api/mux/direct-upload
      const response = await fetch("/api/mux/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "episode" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Gagal memulai upload episode.");

      const uploadUrl = result.data?.url;
      const uploadId = result.data?.id;
      if (!uploadUrl) throw new Error("Tidak mendapatkan upload URL dari Mux.");

      // 2. Upload file video langsung ke Mux
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("PUT", uploadUrl);
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
          }
        };
        xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve(true) : reject(new Error("Upload gagal")));
        xhr.onerror = () => reject(new Error("Network error"));
        xhr.send(file);
      });

      // 3. Poll status sampai dapat playbackId dan assetId
      let playbackId = null;
      let assetId = null;
      const startTime = Date.now();
      while (!playbackId && Date.now() - startTime < 60000) {
        const statusRes = await fetch(`/api/mux/upload-status?uploadId=${uploadId}`);
        const statusJson = await statusRes.json();
        playbackId = statusJson?.data?.asset?.playback_ids?.[0]?.id || statusJson?.data?.status?.playback_ids?.[0]?.id;
        assetId = statusJson?.data?.asset?.id || statusJson?.data?.status?.asset_id;
        if (playbackId) break;
        await new Promise((r) => setTimeout(r, 2000));
      }

      if (!playbackId) throw new Error("Playback ID tidak ditemukan setelah upload.");

      // 4. Update episode draft
      setEpisodeDraft((prev) => ({
        ...prev,
        mux_playback_id: playbackId,
        mux_video_id: playbackId,
        mux_asset_id: assetId,
      }));

      // 5. Kirim subtitle ke /api/mux/text-tracks
      if (assetId && episodeDraft.subtitles?.length) {
        const validTracks = episodeDraft.subtitles
          .filter((s) => /^https?:\/\//i.test(s.url))
          .map((s) => ({
            url: s.url,
            language_code: s.lang || "en",
            name: s.label || s.lang,
          }));

        if (validTracks.length) {
          const res = await fetch("/api/mux/text-tracks", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ assetId, tracks: validTracks }),
          });

          if (res.ok) {
            setMessage({ type: "success", text: "Subtitle berhasil dikaitkan ke Mux." });
          } else {
            const j = await res.json();
            console.warn("Subtitle gagal dikirim ke Mux:", j);
            setMessage({ type: "warning", text: "Subtitle gagal dikirim ke Mux. Coba ulang nanti." });
          }
        }
      }

      setUploadProgress(0);
      setCurrentVideoFile(null);
      setMessage({ type: "success", text: "Upload episode berhasil. Playback ID terisi otomatis." });
    } catch (err) {
      console.error(err);
      setUploadProgress(0);
      setMessage({ type: "error", text: err.message || "Gagal upload episode." });
    }
  };

  // LOGIKA RETRY AUTOFIL DARI EPISODEFORM DIPINDAHKAN KE SINI
  const retryAutofillFromMux = async () => {
    // Gunakan mux_upload_id dari episodeDraft
    if (!episodeDraft.mux_upload_id) return;
    try {
      setMessage({ type: "info", text: "Mencoba mengisi Playback ID otomatis..." });
      const res = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(episodeDraft.mux_upload_id)}`);
      if (!res.ok) throw new Error("Gagal cek status Mux.");
      const json = await res.json();
      const p = json?.data?.asset?.playback_ids?.[0]?.id || json?.data?.status?.playback_ids?.[0]?.id || "";
      const assetId = json?.data?.status?.asset_id || json?.data?.asset?.id || null;
      if (p) {
        // SET STATE DRAFT SAAT RETRY BERHASIL
        setEpisodeDraft((prev) => ({
          ...prev,
          mux_playback_id: p,
          mux_video_id: p,
          ...(assetId ? { mux_asset_id: assetId } : {}),
        }));
        setMessage({ type: "success", text: "Playback ID berhasil diisi otomatis." });
      } else {
        setMessage({ type: "warning", text: "Playback ID belum tersedia. Coba lagi sebentar." });
      }
    } catch (err) {
      setMessage({ type: "error", text: err.message || "Gagal mencoba mengisi Playback ID otomatis." });
    }
  };

  const persistEpisodeDraft = async () => {
    // ... (Logika persistEpisodeDraft tetap)
    if (!(episodeDraft.mux_playback_id ?? episodeDraft.mux_video_id)) {
      setMessage({ type: "error", text: "Playback ID episode wajib diisi." });
      return;
    }

    const draft = {
      ...episodeDraft,
      episodeId: episodeDraft.episodeId ?? uid(),
      epNumber: Number(episodeDraft.epNumber ?? (formData.episodes?.length ?? 0) + 1),
    };

    // Jika series sudah ada di server, simpan episode langsung via API
    if (initialData?.id) {
      // ... (logic API call)
      try {
        const res = await fetch(`/api/series/${initialData.id}/episodes`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = await res.json();
        if (!res.ok) {
          setErrors(json.details ?? {});
          throw new Error(json.error ?? "Gagal menambah episode.");
        }
        const saved = json.data ?? draft;
        setFormData((prev) => {
          const episodes = [...(prev.episodes ?? [])];
          episodes[editingEpisodeIndex] = saved;
          return { ...prev, episodes };
        });
        setMessage({ type: "success", text: "Episode berhasil ditambahkan." });
      } catch (err) {
        setMessage({ type: "error", text: err.message });
        return;
      } finally {
        closeEpisodeEditor();
      }
      return;
    }

    // Jika series belum dibuat, simpan ke state lokal sampai series disimpan
    setFormData((prev) => {
      const episodes = [...(prev.episodes ?? [])];
      episodes[editingEpisodeIndex] = draft;
      return { ...prev, episodes };
    });
    closeEpisodeEditor();
  };

  const deleteEpisode = (index) => {
    setFormData((prev) => {
      const episodes = [...(prev.episodes ?? [])];
      episodes.splice(index, 1);
      return { ...prev, episodes };
    });
  };

  const handleSubmit = async (event) => {
    // ... (Logika handleSubmit Series utama tetap)
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});
    setMessage(null);

    try {
      const payload = {
        ...formData,
        episodes: (formData.episodes ?? []).map((episode, index) => ({
          ...episode,
          episodeId: episode.episodeId ?? uid(),
          epNumber: Number(episode.epNumber ?? index + 1),
        })),
      };

      const response = await fetch(`/api/series${initialData?.id ? `/${initialData.id}` : ""}`, {
        method: initialData?.id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok) {
        setErrors(result.details ?? {});
        throw new Error(result.error ?? "Gagal menyimpan series.");
      }

      setMessage({ type: "success", text: "Series berhasil disimpan." });
      if (!initialData?.id) {
        setFormData(defaultSeries);
      }
      onSuccess?.(result.data ?? payload);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // RENDER UTAMA (Integrasi UI Episode Editor)
  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ... UI Series Utama (Judul, Kategori, Deskripsi, Thumbnail) ... */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Judul Series
            <input
              value={formData.title ?? ""}
              onChange={(event) => setFormData((prev) => ({ ...prev, title: event.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
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
          Deskripsi Series
          <textarea
            value={formData.description ?? ""}
            onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
            required
          />
          {errors.description && <p className="mt-1 text-xs text-rose-400">{errors.description}</p>}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Thumbnail Series
            <input
              value={formData.thumbnail ?? ""}
              onChange={(event) => setFormData((prev) => ({ ...prev, thumbnail: event.target.value }))}
              placeholder="https://..."
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
            />
          </label>
          {/* Trailer/Teaser di level series ditiadakan; kelola per-episode */}
        </div>

        {/* Daftar Episode */}
        <div className="space-y-4 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">Daftar Episode</h3>
              <p className="text-xs text-slate-500">Tambahkan episode dan kelola metadata setiap episode series.</p>
            </div>
            <button type="button" onClick={() => openEpisodeEditor(null)} className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 transition hover:border-primary-500 hover:text-primary-200">
              Tambah Episode
            </button>
          </div>

          <div className="space-y-3">
            {(formData.episodes ?? []).map((episode, index) => (
              <div key={episode.episodeId ?? index} className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-100">
                      Ep {episode.epNumber} — {episode.title}
                    </p>
                    <p className="text-xs text-slate-500 line-clamp-2">{episode.description}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => openEpisodeEditor(index)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200">
                      Edit
                    </button>
                    <button type="button" onClick={() => deleteEpisode(index)} className="rounded-full border border-transparent px-3 py-1 text-xs text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10">
                      Hapus
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {(!formData.episodes || !formData.episodes.length) && (
              <p className="rounded-2xl border border-dashed border-slate-800/60 bg-slate-950/40 px-4 py-6 text-center text-xs text-slate-500">Belum ada episode. Tambahkan minimal satu episode sebelum menyimpan series.</p>
            )}
          </div>
          {errors.episodes && <p className="text-xs text-rose-400">Periksa data episode. Pastikan minimal 1 episode valid.</p>}
        </div>

        {/* Pesan Notifikasi */}
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

        {/* Tombol Submit Utama */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isSubmitting} className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700">
            {isSubmitting ? "Menyimpan..." : submitLabel}
          </button>
          {initialData?.id && (
            <button
              type="button"
              onClick={() => {
                setFormData({ ...defaultSeries, ...initialData });
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

      {/* EDITOR EPISODE TERINTEGRASI */}
      {editingEpisodeIndex !== null && (
        <div className="rounded-3xl border border-primary-500/30 bg-primary-500/5 p-6">
          <h4 className="text-sm font-semibold text-slate-100">{episodeDraft.episodeId ? "Edit Episode" : "Tambah Episode"}</h4>

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                Nomor Episode
                <input
                  type="number"
                  min={1}
                  value={episodeDraft.epNumber ?? ""}
                  onChange={(event) => setEpisodeDraft((prev) => ({ ...prev, epNumber: Number(event.target.value) }))}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                />
              </label>
              <label className="text-sm text-slate-300">
                Judul Episode
                <input
                  value={episodeDraft.title ?? ""}
                  onChange={(event) => setEpisodeDraft((prev) => ({ ...prev, title: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                  required
                />
              </label>
            </div>

            {typeof window !== "undefined" && uploadProgress > 0 && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded bg-slate-800">
                <div className="h-2 bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
              </div>
            )}

            <label className="text-sm text-slate-300">
              Deskripsi Episode
              <textarea
                value={episodeDraft.description ?? ""}
                onChange={(event) => setEpisodeDraft((prev) => ({ ...prev, description: event.target.value }))}
                rows={3}
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                required
              />
            </label>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm text-slate-300">
                Thumbnail Episode (opsional)
                <input
                  value={episodeDraft.thumbnail ?? ""}
                  onChange={(event) => setEpisodeDraft((prev) => ({ ...prev, thumbnail: event.target.value }))}
                  placeholder="https://..."
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                />
              </label>
              <label className="text-sm text-slate-300">
                Playback ID Episode
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="text"
                    name="episodePlaybackId"
                    value={episodeDraft.mux_playback_id ?? ""}
                    onChange={(event) => {
                      const val = event.target.value;
                      // Update DRAFT langsung saat diketik
                      setEpisodeDraft((prev) => ({ ...prev, mux_playback_id: val, mux_video_id: val }));
                    }}
                    onBlur={(event) => {
                      const normalized = normalizePlaybackValue(event.target.value);
                      // Update DRAFT saat blur
                      setEpisodeDraft((prev) => ({ ...prev, mux_playback_id: normalized, mux_video_id: normalized }));
                    }}
                    placeholder="Playback ID atau URL Mux"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    inputMode="text"
                    className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                    required
                  />
                  <div className="flex items-center gap-3 text-xs">
                    <label className="text-primary-200 hover:text-primary-100">
                      <input
                        type="file"
                        accept="video/*"
                        className="hidden"
                        // Simpan file yang dipilih ke currentVideoFile
                        onChange={(event) => setCurrentVideoFile(event.target.files?.[0] ?? null)}
                      />
                      <span className="cursor-pointer">Pilih Video</span>
                    </label>
                    <button
                      type="button"
                      // Panggil handleDirectUpload dengan file yang dipilih
                      onClick={() => currentVideoFile && handleDirectUpload(currentVideoFile)}
                      disabled={!currentVideoFile || uploadProgress > 0}
                      className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadProgress > 0 ? "Mengunggah..." : "Upload ke Mux"}
                    </button>
                    {/* Tombol Fallback Cek ID */}
                    {episodeDraft.mux_upload_id && !episodeDraft.mux_playback_id && (
                      <button
                        type="button"
                        onClick={retryAutofillFromMux}
                        disabled={uploadProgress > 0}
                        className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Cek ID
                      </button>
                    )}
                    {currentVideoFile && <span className="text-slate-500">{currentVideoFile.name}</span>}
                  </div>
                </div>
              </label>
            </div>

            <label className="text-sm text-slate-300">
              Trailer URL Episode (opsional)
              <input
                value={episodeDraft.trailer ?? ""}
                onChange={(event) => setEpisodeDraft((prev) => ({ ...prev, trailer: event.target.value }))}
                placeholder="https://stream.mux.com/..."
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
              />
            </label>

            <SubtitleEditor
              subtitles={episodeDraft.subtitles}
              // Subtitle Editor update DRAFT langsung
              onChange={(value) => setEpisodeDraft((prev) => ({ ...prev, subtitles: value }))}
              messageSetter={setMessage}
            />

            <div className="flex items-center justify-end gap-3">
              <button type="button" onClick={closeEpisodeEditor} className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-slate-500 hover:text-white">
                Batal
              </button>
              <button
                type="button"
                onClick={persistEpisodeDraft}
                // Pastikan tombol submit memerlukan Playback ID
                disabled={!episodeDraft.title || !episodeDraft.description || !episodeDraft.mux_playback_id}
                className="rounded-full bg-primary-600 px-5 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700"
              >
                Simpan Episode
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
