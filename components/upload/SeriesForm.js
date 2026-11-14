"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CONTENT_CATEGORIES, SUBTITLE_LANGUAGES } from "@/utils/constants";
import { convertSrtToVtt } from "@/utils/subtitles";
import { resolveMuxSignedUrl } from "@/components/mux/MuxThumbnail";

const defaultSeries = {
  title: "",
  description: "",
  category: CONTENT_CATEGORIES[0],
  thumbnail: "",
  backdropUrl: "",
  trailer: "",
  releaseYear: "",
  maturityRating: "13+",
  status: "Ongoing",
  totalSeasons: 1,
  genres: [],
  cast: [],
  director: "",
  country: "",
  language: "",
  subtitles: [],
  episodes: [],
  tags: [],
};

const newEpisodeDraft = (index = 0) => ({
  episodeId: undefined,
  seasonNumber: 1,
  epNumber: index + 1,
  title: "",
  description: "",
  duration: "",
  mux_playback_id: "",
  mux_asset_id: "",
  mux_video_id: "",
  mux_upload_id: "",
  fileHash: null,
  thumbnail: "",
  trailer: "",
  subtitles: [],
});

const emptySubtitle = { lang: "en", label: "English", url: "" };
const isValidSubtitleEntry = (item) =>
  Boolean(item && (item.source === "mux" || item.muxTrackId || (item.url && /^https?:\/\//i.test(item.url))));

function uid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `episode-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// ======================================================================
// Komponen Subtitle Editor
// ======================================================================
function SubtitleEditor({ subtitles, onChange, messageSetter, onUploadStart, onUploadSuccess, onUploadError }) {
  const addSubtitle = () => onChange([...(subtitles ?? []), { ...emptySubtitle, _uid: uid() }]);

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
    const targetSub = subtitles?.[index];
    const targetUid = targetSub?._uid;
    const lang = targetSub?.lang || emptySubtitle.lang;
    const label = targetSub?.label || lang || emptySubtitle.label;

    try {
      onUploadStart?.(index, file);
      const text = await file.text();
      const mimeType = file.type || (file.name.endsWith(".srt") ? "application/x-subrip" : undefined);
      let converted = text;
      if (mimeType === "application/x-subrip" || file.name.endsWith(".srt")) {
        converted = convertSrtToVtt(text);
      }
      const vttBlob = new Blob([converted], { type: "text/vtt" });
      const vttFile = new File([vttBlob], file.name.replace(/\.srt$/i, ".vtt"), {
        type: "text/vtt",
      });
      const fd = new FormData();
      fd.append("file", vttFile, vttFile.name);
      fd.append("lang", lang);
      fd.append("label", label);
      const res = await fetch("/api/uploads/subtitle", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Gagal mengunggah subtitle.");
      const json = await res.json();
      const url = json?.data?.url ?? "";
      const currentList = [...(subtitles ?? [])];
      const targetIndex = targetUid
        ? currentList.findIndex((item) => item?._uid === targetUid)
        : index;
      if (targetIndex !== -1) {
        currentList[targetIndex] = { ...currentList[targetIndex], url };
        onChange(currentList);
      }
      onUploadSuccess?.({
        index: targetIndex === -1 ? index : targetIndex,
        url,
        lang,
        label,
      });
      messageSetter?.({
        type: "success",
        text: "Subtitle siap dan URL publik tersimpan.",
      });
    } catch (error) {
      console.error(error);
      messageSetter?.({ type: "error", text: "Gagal mengonversi subtitle." });
      onUploadError?.(error);
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
        <div key={subtitle._uid ?? index} className="space-y-2 rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <select value={subtitle.lang ?? "en"} onChange={(e) => updateSubtitle(index, "lang", e.target.value)} className="w-full sm:w-32 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200">
              {SUBTITLE_LANGUAGES.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            <input value={subtitle.label ?? ""} onChange={(e) => updateSubtitle(index, "label", e.target.value)} placeholder="Label" className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200" />
            <button type="button" onClick={() => removeSubtitle(index)} className="rounded-full border border-transparent px-3 py-1 text-xs font-semibold text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10">
              Hapus
            </button>
          </div>
          <input value={subtitle.url ?? ""} onChange={(e) => updateSubtitle(index, "url", e.target.value)} placeholder="https://..." className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200" />
          <label className="flex items-center justify-between text-xs text-slate-400">
            <span>Upload file .vtt / .srt</span>
            <input
              type="file"
              accept=".vtt,.srt,text/vtt,application/x-subrip"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) handleSubtitleFile(index, file);
              }}
            />
          </label>
        </div>
      ))}
    </div>
  );
}

// ======================================================================
// Komponen Utama: SeriesForm
// ======================================================================
export default function SeriesForm({ initialData, onSuccess, onDirtyChange, submitLabel = "Simpan Series" }) {
  const [formData, setFormData] = useState({ ...defaultSeries, ...initialData });
  const [message, setMessage] = useState(null);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEpisodeIndex, setEditingEpisodeIndex] = useState(null);
  const [episodeDraft, setEpisodeDraft] = useState(newEpisodeDraft());
  const [uploadProgress, setUploadProgress] = useState(0);
  const [currentVideoFile, setCurrentVideoFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState("idle");
  const [subtitleUploadStatus, setSubtitleUploadStatus] = useState("idle");
  const [subtitleSyncStatus, setSubtitleSyncStatus] = useState("idle");
  const [isSyncingSubtitles, setIsSyncingSubtitles] = useState(false);
  const lastFetchedPlaybackRef = useRef(null);
  const xhrRef = useRef(null);
  const abortControllerRef = useRef(null);
  const [confirmCloseModal, setConfirmCloseModal] = useState(false);
  const [episodeModalError, setEpisodeModalError] = useState(null);
  const [activeSeason, setActiveSeason] = useState(1);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
      abortControllerRef.current?.abort();
    };
  }, []);

  const [dynamicCategories, setDynamicCategories] = useState(CONTENT_CATEGORIES);

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((json) => {
        const cats = json?.data?.categories;
        if (Array.isArray(cats) && cats.length) {
          setDynamicCategories(Array.from(new Set([...cats, ...CONTENT_CATEGORIES])));
        }
      })
      .catch(() => {});
  }, []);

  const categoryOptions = useMemo(() => dynamicCategories, [dynamicCategories]);

  const seasonData = useMemo(() => {
    const episodes = formData.episodes ?? [];
    const bySeason = {};
    const seasonSet = new Set();
    const declared = Math.max(1, Number(formData.totalSeasons ?? 1));
    for (let s = 1; s <= declared; s += 1) {
      seasonSet.add(s);
      bySeason[s] = [];
    }
    episodes.forEach((ep, originalIndex) => {
      const s = Math.max(1, Number(ep?.seasonNumber ?? 1));
      seasonSet.add(s);
      if (!bySeason[s]) bySeason[s] = [];
      bySeason[s].push({ episode: ep, originalIndex });
    });
    const seasons = Array.from(seasonSet).sort((a, b) => a - b);
    for (const s of seasons) {
      bySeason[s].sort((a, b) => Number(a.episode?.epNumber ?? 0) - Number(b.episode?.epNumber ?? 0));
    }
    const maxSeason = seasons[seasons.length - 1] ?? 1;
    return { seasons, maxSeason, bySeason };
  }, [formData.episodes, formData.totalSeasons]);

  const isDuplicateDraftEpisode = useMemo(() => {
    if (editingEpisodeIndex === null) return false;
    const targetSeason = Number(episodeDraft.seasonNumber ?? 1);
    const targetEp = Number(episodeDraft.epNumber ?? 0);
    if (!targetEp) return false;
    return (formData.episodes ?? []).some(
      (ep, idx) =>
        idx !== editingEpisodeIndex &&
        Number(ep?.seasonNumber ?? 1) === targetSeason &&
        Number(ep?.epNumber ?? 0) === targetEp
    );
  }, [editingEpisodeIndex, episodeDraft.seasonNumber, episodeDraft.epNumber, formData.episodes]);

  useEffect(() => {
    setFormData({ ...defaultSeries, ...initialData });
    setErrors({});
    setMessage(null);
    setEditingEpisodeIndex(null);
    setEpisodeDraft(newEpisodeDraft());
    setUploadProgress(0);
    setCurrentVideoFile(null);
    setUploadStatus("idle");
    setSubtitleUploadStatus("idle");
    setSubtitleSyncStatus("idle");
    setIsSyncingSubtitles(false);
    lastFetchedPlaybackRef.current = null;
  }, [initialData]);

  useEffect(() => {
    const subtitleList = episodeDraft.subtitles ?? [];
    const hasValidSubtitle = subtitleList.some(isValidSubtitleEntry);
    if (hasValidSubtitle) {
      setSubtitleUploadStatus((prev) => (prev === "processing" ? prev : "success"));
    } else {
      setSubtitleUploadStatus((prev) => (prev === "processing" || prev === "error" ? prev : "idle"));
    }
  }, [episodeDraft.subtitles]);

  useEffect(() => {
    if (editingEpisodeIndex === null) return;
    const playback = episodeDraft.mux_playback_id ?? episodeDraft.mux_video_id ?? "";
    const currentAssetId = episodeDraft.mux_asset_id ?? null;
    if (!playback && !currentAssetId) return;
    if (currentAssetId && lastFetchedPlaybackRef.current === playback) return;
    let cancelled = false;

    const ensureMuxMetadata = async () => {
      let assetId = currentAssetId;
      if (!assetId && playback) {
        assetId = await fetchAssetIdFromPlayback(playback);
      }
      if (!assetId || cancelled) return;

      try {
        const res = await fetch(`/api/mux/assets/${assetId}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;

        const playbackFromMux =
          json?.data?.playback_ids?.find((pb) => pb?.policy === "public")?.id ??
          json?.data?.playback_ids?.[0]?.id ??
          playback ??
          null;

        setEpisodeDraft((prev) => {
          const nextPlayback = playbackFromMux ?? prev.mux_playback_id ?? prev.mux_video_id ?? "";
          if (prev.mux_asset_id === assetId && prev.mux_playback_id === nextPlayback) {
            return prev;
          }
          lastFetchedPlaybackRef.current = nextPlayback || playback || null;
          return {
            ...prev,
            mux_asset_id: assetId,
            mux_playback_id: nextPlayback,
            mux_video_id: nextPlayback || prev.mux_video_id || prev.mux_playback_id || "",
          };
        });
      } catch (error) {
        console.warn("[MUX DEBUG] Gagal memperbarui metadata episode dari Mux", error?.message ?? error);
      }
    };

    ensureMuxMetadata();

    return () => {
      cancelled = true;
    };
  }, [editingEpisodeIndex, episodeDraft.mux_asset_id, episodeDraft.mux_playback_id, episodeDraft.mux_video_id]);

  // ====================================================================
  // Helper Functions
  // ====================================================================
  const computeFileHash = async (file) => {
    if (!file) return null;
    const MAX_FULL_HASH = 64 * 1024 * 1024; // 64MB
    const SAMPLE_SIZE = 2 * 1024 * 1024; // 2MB
    try {
      if (file.size <= MAX_FULL_HASH) {
        const buffer = await file.arrayBuffer();
        const digest = await crypto.subtle.digest("SHA-256", buffer);
        const hashArray = Array.from(new Uint8Array(digest));
        const sha256 = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        return { sha256, size: file.size };
      }

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
  };

  const normalizePlaybackValue = (raw) => {
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
    if (!targetAssetId && playbackId) targetAssetId = await fetchAssetIdFromPlayback(playbackId);
    if (!targetAssetId) return false;

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
        console.warn("[MUX DEBUG] Subtitle sync failed", targetAssetId, json);
        return false;
      }
      console.log("[MUX DEBUG] Subtitle sync success", targetAssetId, json);
      return true;
    } catch (err) {
      console.warn("[MUX DEBUG] Subtitle sync error", err?.message ?? err);
      return false;
    }
  }

  const lookupExistingMuxAsset = async (fingerprint) => {
    if (!fingerprint?.sha256 || !fingerprint?.size) return null;
    try {
      const res = await fetch("/api/uploads/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, type: "episode" }),
      });
      if (!res.ok) return null;
      const json = await res.json().catch(() => ({}));
      return json?.data ?? null;
    } catch (error) {
      console.warn("[MUX DEBUG] lookupExistingMuxAsset error", error?.message ?? error);
      return null;
    }
  };

  const persistEpisodeMetadata = async (episodePayload, { quiet = false } = {}) => {
    if (!initialData?.id || !episodePayload?.episodeId) return null;
    try {
      const res = await fetch(`/api/series/${initialData.id}/episodes/${episodePayload.episodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(episodePayload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (!quiet) {
          setMessage({ type: "error", text: json?.error ?? "Gagal memperbarui metadata episode." });
        }
        return null;
      }
      const savedEpisode = json?.data ?? episodePayload;
      setFormData((prev) => {
        const episodes = [...(prev.episodes ?? [])];
        const index = episodes.findIndex((episode) => episode?.episodeId === savedEpisode.episodeId);
        if (index >= 0) {
          episodes[index] = savedEpisode;
          return { ...prev, episodes };
        }
        return prev;
      });
      return savedEpisode;
    } catch (error) {
      if (!quiet) {
        setMessage({ type: "error", text: error?.message ?? "Gagal menyimpan metadata episode." });
      }
      return null;
    }
  };

  const retryAutofillFromMux = async () => {
    if (!episodeDraft.mux_upload_id) return;
    try {
      setMessage({ type: "info", text: "Mencoba mengisi Playback ID otomatis..." });
      const res = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(episodeDraft.mux_upload_id)}`);
      if (!res.ok) throw new Error("Gagal cek status Mux.");
      const json = await res.json();
      const p = json?.data?.asset?.playback_ids?.[0]?.id || json?.data?.status?.playback_ids?.[0]?.id || "";
      let assetId = json?.data?.status?.asset_id || json?.data?.asset?.id || null;
      if (!assetId && p) assetId = await fetchAssetIdFromPlayback(p);
      const dur = json?.data?.asset?.duration;
      if (p) {
        const thumbUrl = await resolveMuxSignedUrl({ playbackId: p, type: "thumbnail", time: 5 });
        setEpisodeDraft((prev) => ({
          ...prev,
          mux_playback_id: p,
          mux_video_id: p,
          mux_asset_id: assetId ?? prev.mux_asset_id ?? null,
          duration: prev.duration || (dur != null ? String(Math.round(Number(dur))) : prev.duration),
          thumbnail: prev.thumbnail?.trim() || thumbUrl,
        }));
        setUploadStatus("success");
        setMessage({ type: "success", text: "Playback ID berhasil diisi otomatis." });
      } else {
        setMessage({ type: "warning", text: "Playback ID belum tersedia. Coba lagi." });
      }
    } catch (err) {
      setUploadStatus("error");
      setMessage({ type: "error", text: err.message || "Gagal mengisi otomatis." });
    }
  };

  // ====================================================================
  // Upload langsung ke Mux
  // ====================================================================
  const handleDirectUpload = async (file) => {
    if (!file) return;
    xhrRef.current?.abort();
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    onDirtyChange?.(true);
    setEpisodeModalError(null);
    setMessage({ type: "info", text: "Memproses video episode sebelum upload ke Mux..." });
    setUploadStatus("hashing");
    setUploadProgress(1);
    setCurrentVideoFile(file);

    try {
      const fingerprint = await computeFileHash(file);
      if (controller.signal.aborted) return;

      let nextEpisode = { ...episodeDraft, fileHash: fingerprint };

      const existing = await lookupExistingMuxAsset(fingerprint);
      if (controller.signal.aborted) return;
      if (existing?.mux_playback_id) {
        nextEpisode = {
          ...nextEpisode,
          mux_playback_id: existing.mux_playback_id,
          mux_video_id: existing.mux_playback_id,
          mux_asset_id: existing.mux_asset_id ?? nextEpisode.mux_asset_id ?? null,
        };
        setEpisodeDraft((prev) => ({
          ...prev,
          fileHash: fingerprint,
          mux_playback_id: existing.mux_playback_id,
          mux_video_id: existing.mux_playback_id,
          mux_asset_id: existing.mux_asset_id ?? prev.mux_asset_id ?? null,
        }));
        setSubtitleSyncStatus("idle");
        setUploadStatus("success");
        setUploadProgress(0);
        setCurrentVideoFile(null);
        setMessage({ type: "success", text: "Video sudah ada di Mux. Playback ID terisi otomatis." });
        const savedEpisode = await persistEpisodeMetadata(nextEpisode, { quiet: true });
        if (savedEpisode && !controller.signal.aborted) {
          setEpisodeDraft((prev) => ({
            ...prev,
            episodeId: savedEpisode.episodeId ?? prev.episodeId,
            id: savedEpisode.id ?? prev.id,
          }));
        }
        return;
      }

      setUploadStatus("uploading");
      setMessage({ type: "info", text: "Mengunggah video episode ke Mux..." });

      const response = await fetch("/api/mux/direct-upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "episode",
          title: [formData.title?.trim(), episodeDraft.title?.trim()].filter(Boolean).join(" - ") || undefined,
          seasonNumber: Number(episodeDraft.seasonNumber || 1),
          epNumber: Number(episodeDraft.epNumber || 1),
          externalId: initialData?.id || undefined,
        }),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Gagal memulai upload episode.");

      if (result.warning) {
        const fallbackPlayback = result.data?.playback_ids?.[0]?.id ?? "";
        if (fallbackPlayback) {
          setEpisodeDraft((prev) => ({
            ...prev,
            fileHash: fingerprint,
            mux_playback_id: fallbackPlayback,
            mux_video_id: fallbackPlayback,
            mux_asset_id: result.data?.asset_id ?? prev.mux_asset_id ?? "mock-asset",
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
      if (!uploadUrl) throw new Error("Tidak mendapatkan upload URL dari Mux.");

      if (uploadId) {
        nextEpisode.mux_upload_id = uploadId;
        setEpisodeDraft((prev) => ({ ...prev, mux_upload_id: uploadId }));
      }

      let ok = false;
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open("PUT", uploadUrl);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const percent = Math.round((e.loaded / e.total) * 100);
              setUploadProgress(percent);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              setUploadProgress(100);
              resolve(true);
            } else {
              reject(new Error("Upload gagal"));
            }
          };
          xhr.onerror = () => reject(new Error("Network error"));
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
        if (ok) {
          setUploadProgress(100);
        }
      }

      if (!ok) {
        throw new Error("Upload ke Mux gagal (CORS atau jaringan).");
      }

      setUploadProgress(100);

      let playbackId = null;
      let assetId = null;
      let assetReady = false;
      let resolvedDuration = null;
      const startTime = Date.now();
      const pollTimeout = 120000;

      while (Date.now() - startTime < pollTimeout) {
        if (controller.signal.aborted) return;
        try {
          const statusRes = await fetch(`/api/mux/upload-status?uploadId=${encodeURIComponent(uploadId)}`, {
            signal: controller.signal,
          });
          const statusJson = await statusRes.json().catch(() => ({}));
          if (statusRes.ok) {
            playbackId = playbackId ?? statusJson?.data?.asset?.playback_ids?.[0]?.id ?? statusJson?.data?.status?.playback_ids?.[0]?.id ?? null;
            assetId = assetId ?? statusJson?.data?.asset?.id ?? statusJson?.data?.status?.asset_id ?? null;
            if (statusJson?.data?.asset?.duration != null) {
              resolvedDuration = Math.round(Number(statusJson.data.asset.duration));
            }
            const currentAssetStatus = statusJson?.data?.asset?.status ?? statusJson?.data?.status?.status;
            const uploadStatusVal = statusJson?.data?.status?.status;
            if (currentAssetStatus === "errored" || uploadStatusVal === "errored") {
              throw new Error("Pemrosesan video episode di Mux gagal (errored).");
            }
            if (currentAssetStatus === "ready") {
              assetReady = true;
            }
          }
        } catch (pollErr) {
          if (pollErr?.name === "AbortError" || controller.signal.aborted) return;
          if (pollErr?.message?.includes("errored")) throw pollErr;
        }
        if (playbackId && assetId && assetReady) break;
        await muxWait(2000);
      }

      if (controller.signal.aborted) return;
      if (playbackId && !assetId) assetId = await fetchAssetIdFromPlayback(playbackId);
      if (!playbackId || !assetId) throw new Error("Gagal mendapatkan playbackId / assetId dari Mux.");

      const generatedThumb = await resolveMuxSignedUrl({
        playbackId,
        type: "thumbnail",
        time: 5,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;

      nextEpisode = {
        ...nextEpisode,
        mux_playback_id: playbackId,
        mux_video_id: playbackId,
        mux_asset_id: assetId,
        duration: nextEpisode.duration || (resolvedDuration ? String(resolvedDuration) : ""),
        thumbnail: nextEpisode.thumbnail?.trim() || generatedThumb,
      };

      setEpisodeDraft((prev) => ({
        ...prev,
        fileHash: fingerprint,
        mux_upload_id: nextEpisode.mux_upload_id || prev.mux_upload_id,
        mux_playback_id: playbackId,
        mux_video_id: playbackId,
        mux_asset_id: assetId,
        duration: prev.duration || (resolvedDuration ? String(resolvedDuration) : ""),
        thumbnail: prev.thumbnail?.trim() || generatedThumb,
      }));
      setSubtitleSyncStatus("idle");
      setUploadStatus("success");
      setUploadProgress(0);
      setCurrentVideoFile(null);
      setMessage({
        type: "success",
        text: "Upload episode berhasil. Playback ID terisi otomatis.",
      });

      const savedEpisode = await persistEpisodeMetadata(nextEpisode, { quiet: true });
      if (savedEpisode && !controller.signal.aborted) {
        setEpisodeDraft((prev) => ({
          ...prev,
          episodeId: savedEpisode.episodeId ?? prev.episodeId,
          id: savedEpisode.id ?? prev.id,
        }));
      }
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) return;
      console.error(err);
      let userMessage = err.message || "Gagal upload episode.";
      if (err.name === 'NotReadableError' || userMessage.includes('could not be read')) {
        userMessage = 'File tidak bisa dibaca. Pastikan file tidak sedang digunakan, tidak berada di network drive, dan periksa izin akses file.';
      }
      setUploadStatus("error");
      setUploadProgress(0);
      setCurrentVideoFile(null);
      setMessage({ type: "error", text: userMessage });
    }
  };

  const handleSubtitleSync = async () => {
    const validTracks = (episodeDraft.subtitles ?? []).filter((item) => item?.url && /^https?:\/\//i.test(item.url));
    if (!validTracks.length) {
      setSubtitleSyncStatus("error");
      setMessage({ type: "warning", text: "Tambahkan subtitle dengan URL publik sebelum mengirim ke Mux." });
      return;
    }

    const assetId = episodeDraft.mux_asset_id || episodeDraft.mux_video_id || episodeDraft.mux_playback_id;
    if (!assetId) {
      setSubtitleSyncStatus("error");
      setMessage({ type: "warning", text: "Asset ID Mux belum tersedia. Upload video terlebih dahulu." });
      return;
    }

    setSubtitleSyncStatus("loading");
    setIsSyncingSubtitles(true);
    try {
      const ok = await syncSubtitlesToMux({
        assetId,
        playbackId: episodeDraft.mux_playback_id,
        subtitles: episodeDraft.subtitles ?? [],
      });
      if (!ok) {
        setSubtitleSyncStatus("error");
        setMessage({ type: "error", text: "Gagal mengirim subtitle ke Mux." });
        return;
      }
      setSubtitleSyncStatus("success");
      setMessage({ type: "success", text: "Subtitle berhasil dikirim ke Mux." });
      const savedEpisode = await persistEpisodeMetadata(
        { ...episodeDraft, subtitles: episodeDraft.subtitles ?? [] },
        { quiet: true }
      );
      if (savedEpisode) {
        setEpisodeDraft(savedEpisode);
      }
    } catch (error) {
      setSubtitleSyncStatus("error");
      setMessage({ type: "error", text: error?.message ?? "Gagal mengirim subtitle ke Mux." });
    } finally {
      setIsSyncingSubtitles(false);
    }
  };

  // ====================================================================
  // Persist Episode Draft
  // ====================================================================
  const persistEpisodeDraft = async () => {
    if (!(episodeDraft.mux_playback_id ?? episodeDraft.mux_video_id)) {
      setMessage({ type: "error", text: "Playback ID episode wajib diisi." });
      return;
    }

    const parsedEp = Number(episodeDraft.epNumber);
    const draft = {
      ...episodeDraft,
      episodeId: episodeDraft.episodeId ?? uid(),
      epNumber: Number.isFinite(parsedEp) && parsedEp > 0 ? parsedEp : (formData.episodes?.length ?? 0) + 1,
    };

    // Jika series sudah ada di server
    if (initialData?.id) {
      const isExistingEpisode =
        Boolean(draft.episodeId) &&
        Boolean((formData.episodes ?? []).find((episode) => episode?.episodeId === draft.episodeId));

      try {
        const endpoint = isExistingEpisode
          ? `/api/series/${initialData.id}/episodes/${draft.episodeId}`
          : `/api/series/${initialData.id}/episodes`;
        const method = isExistingEpisode ? "PUT" : "POST";
        const res = await fetch(endpoint, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        });
        const json = await res.json();
        if (!res.ok) {
          setErrors(json.details ?? {});
          throw new Error(json.error ?? (isExistingEpisode ? "Gagal memperbarui episode." : "Gagal menambah episode."));
        }
        const saved = json.data ?? draft;
        setFormData((prev) => {
          const episodes = [...(prev.episodes ?? [])];
          if (editingEpisodeIndex !== null && editingEpisodeIndex < episodes.length) {
            episodes[editingEpisodeIndex] = saved;
          } else if (isExistingEpisode) {
            const targetIndex = episodes.findIndex((episode) => episode?.episodeId === saved.episodeId);
            if (targetIndex >= 0) episodes[targetIndex] = saved;
            else episodes.push(saved);
          } else {
            episodes.push(saved);
          }
          return { ...prev, episodes };
        });
        setMessage({
          type: "success",
          text: isExistingEpisode ? "Episode berhasil diperbarui." : "Episode berhasil ditambahkan.",
        });
        closeEpisodeEditor();
      } catch (err) {
        setMessage({ type: "error", text: err.message });
        return;
      }
      return;
    }

    // Jika series baru (belum disimpan)
    if (!draft.title?.trim() || !draft.description?.trim()) {
      setEpisodeModalError("Judul dan deskripsi episode wajib diisi sebelum menyimpan.");
      return;
    }
    setEpisodeModalError(null);
    onDirtyChange?.(true);
    setFormData((prev) => {
      const episodes = [...(prev.episodes ?? [])];
      episodes[editingEpisodeIndex] = draft;
      return { ...prev, episodes };
    });
    closeEpisodeEditor();
  };

  const subtitleEntries = episodeDraft.subtitles ?? [];
  const hasSubtitleUrl = subtitleEntries.some(isValidSubtitleEntry);
  const subtitlesConfigured = subtitleEntries.some((item) => item?.url || item?.label || item?.lang || item?.source === "mux" || item?.muxTrackId);
  const canSyncSubtitles =
    hasSubtitleUrl && Boolean(episodeDraft.mux_asset_id || episodeDraft.mux_video_id || episodeDraft.mux_playback_id);
  const hasMuxPlayback = Boolean(episodeDraft.mux_playback_id ?? episodeDraft.mux_video_id);
  const videoReady = uploadStatus === "success" || hasMuxPlayback;
  const subtitlesUploadReady = !subtitlesConfigured || (hasSubtitleUrl && subtitleUploadStatus === "success");
  const subtitlesSyncReady = !subtitlesConfigured || subtitleSyncStatus === "success";
  const canSaveEpisode =
    Boolean(episodeDraft.title) &&
    Boolean(episodeDraft.description) &&
    videoReady &&
    subtitlesUploadReady &&
    subtitlesSyncReady;

  const openEpisodeEditor = (index = null, targetSeason = null) => {
    lastFetchedPlaybackRef.current = null;
    if (index === null) {
      const sNum = Math.max(1, Number(targetSeason ?? activeSeason ?? 1));
      const epsInSeason = seasonData.bySeason[sNum] ?? [];
      const maxEp = epsInSeason.reduce((max, item) => Math.max(max, Number(item.episode?.epNumber ?? 0)), 0);
      setEpisodeDraft({
        ...newEpisodeDraft(maxEp),
        seasonNumber: sNum,
        epNumber: maxEp + 1,
      });
      setEditingEpisodeIndex(formData.episodes?.length ?? 0);
      setCurrentVideoFile(null);
      setUploadStatus("idle");
      setSubtitleUploadStatus("idle");
      setSubtitleSyncStatus("idle");
      return;
    }
    const selected = formData.episodes?.[index];
    setEpisodeDraft({ ...selected });
    setEditingEpisodeIndex(index);
    setCurrentVideoFile(null);
    const hasPlayback = Boolean(selected?.mux_playback_id ?? selected?.mux_video_id);
    const hasValidSubtitles = (selected?.subtitles ?? []).some(isValidSubtitleEntry);
    setUploadStatus(hasPlayback ? "success" : "idle");
    setSubtitleUploadStatus(hasValidSubtitles ? "success" : "idle");
    setSubtitleSyncStatus("idle");
  };

  const closeEpisodeEditor = () => {
    xhrRef.current?.abort();
    abortControllerRef.current?.abort();
    setConfirmCloseModal(false);
    setEpisodeModalError(null);
    setEditingEpisodeIndex(null);
    setEpisodeDraft(newEpisodeDraft());
    setUploadProgress(0);
    setCurrentVideoFile(null);
    setUploadStatus("idle");
    setSubtitleUploadStatus("idle");
    setSubtitleSyncStatus("idle");
    setIsSyncingSubtitles(false);
    lastFetchedPlaybackRef.current = null;
  };

  const requestCloseEpisodeEditor = () => {
    const isUploading = ["hashing", "uploading"].includes(uploadStatus);
    const hasDraftEdits = Boolean(
      episodeDraft.title?.trim() ||
        episodeDraft.description?.trim() ||
        episodeDraft.mux_playback_id?.trim() ||
        currentVideoFile
    );
    if (isUploading || hasDraftEdits) {
      setConfirmCloseModal(true);
      return;
    }
    closeEpisodeEditor();
  };

  const deleteEpisode = async (index) => {
    const targetEpisode = formData.episodes?.[index];
    if (!targetEpisode) return;

    const confirmed = window.confirm(
      `Hapus episode "${targetEpisode.title ?? `Episode ${targetEpisode.epNumber ?? index + 1}`}"?` +
        (initialData?.id ? " Video di Mux juga akan dihapus." : "")
    );
    if (!confirmed) return;

    if (initialData?.id && targetEpisode?.episodeId) {
      try {
        const res = await fetch(`/api/series/${initialData.id}/episodes/${targetEpisode.episodeId}`, {
          method: "DELETE",
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error ?? "Gagal menghapus episode.");
        }
        setMessage({ type: "success", text: "Episode berhasil dihapus." });
      } catch (error) {
        setMessage({ type: "error", text: error?.message ?? "Gagal menghapus episode." });
        return;
      }
    }

    setFormData((prev) => {
      const episodes = [...(prev.episodes ?? [])];
      episodes.splice(index, 1);
      return { ...prev, episodes };
    });
    setMessage({ type: "success", text: "Episode berhasil dihapus." });

    if (editingEpisodeIndex === index) {
      closeEpisodeEditor();
    } else if (editingEpisodeIndex !== null && editingEpisodeIndex > index) {
      setEditingEpisodeIndex((prevIndex) => (prevIndex !== null ? prevIndex - 1 : prevIndex));
    }
  };

  const handleAddSeason = () => {
    const nextSeason = seasonData.maxSeason + 1;
    setFormData((prev) => ({
      ...prev,
      totalSeasons: Math.max(Number(prev.totalSeasons ?? 1), nextSeason),
    }));
    setActiveSeason(nextSeason);
  };

  // ====================================================================
  // Submit Series
  // ====================================================================
  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrors({});
    setMessage(null);

    const newErrors = {};
    if (!formData.title?.trim()) {
      newErrors.title = "Judul series wajib diisi.";
    }
    if (!formData.description?.trim() || formData.description.trim().length < 10) {
      newErrors.description = "Deskripsi series minimal 10 karakter.";
    }
    if (!formData.category?.trim()) {
      newErrors.category = "Kategori wajib diisi.";
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setMessage({ type: "error", text: "Mohon lengkapi semua field yang wajib diisi." });
      setIsSubmitting(false);
      return;
    }

    try {
      const highestEpSeason = (formData.episodes ?? []).reduce(
        (max, ep) => Math.max(max, Number(ep?.seasonNumber ?? 1)),
        1
      );
      const payload = {
        ...formData,
        releaseYear: formData.releaseYear ? Number(formData.releaseYear) : null,
        totalSeasons: Math.max(formData.totalSeasons ? Number(formData.totalSeasons) : 1, highestEpSeason),
        genres: Array.isArray(formData.genres)
          ? formData.genres
          : String(formData.genres || "")
              .split(",")
              .map((g) => g.trim())
              .filter(Boolean),
        cast: Array.isArray(formData.cast)
          ? formData.cast
          : String(formData.cast || "")
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
        episodes: (formData.episodes ?? []).map((episode, index) => ({
          ...episode,
          episodeId: episode.episodeId ?? uid(),
          seasonNumber: Number(episode.seasonNumber ?? 1),
          epNumber: Number(episode.epNumber) > 0 ? Number(episode.epNumber) : index + 1,
          duration: episode.duration ? Number(episode.duration) : null,
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
        setActiveSeason(1);
      }
      onSuccess?.(result.data ?? payload);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* FORM SERIES UTAMA */}
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Judul Series
            <input
              value={formData.title ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
              required
            />
            {errors.title && <p className="mt-1 text-xs text-rose-400">{errors.title}</p>}
          </label>
          <label className="text-sm text-slate-300">
            Kategori
            <select
              value={formData.category ?? categoryOptions[0]}
              onChange={(e) => setFormData((prev) => ({ ...prev, category: e.target.value }))}
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
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            rows={4}
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
            required
          />
          {errors.description && <p className="mt-1 text-xs text-rose-400">{errors.description}</p>}
        </label>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Thumbnail / Poster Series
            <input
              value={formData.thumbnail ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, thumbnail: e.target.value }))}
              placeholder="https://..."
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
            />
          </label>
          <label className="text-sm text-slate-300">
            Backdrop Hero URL (opsional)
            <input
              value={formData.backdropUrl ?? ""}
              onChange={(e) => setFormData((prev) => ({ ...prev, backdropUrl: e.target.value }))}
              placeholder="https://... (landscape 16:9)"
              className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
            />
          </label>
        </div>

        <label className="block text-sm text-slate-300">
          Trailer URL (opsional)
          <input
            value={formData.trailer ?? ""}
            onChange={(e) => setFormData((prev) => ({ ...prev, trailer: e.target.value }))}
            placeholder="https://stream.mux.com/... atau URL video trailer"
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
          />
        </label>

        {/* DETAIL METADATA ALA NETFLIX */}
        <div className="space-y-4 rounded-3xl border border-slate-800/60 bg-slate-900/40 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Detail Series (Netflix-Style)</h3>
            <p className="text-xs text-slate-500">Informasi lengkap untuk halaman detail series.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-4">
            <label className="text-xs text-slate-300">
              Tahun Rilis
              <input
                type="number"
                min={1900}
                max={2100}
                value={formData.releaseYear ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, releaseYear: e.target.value }))}
                placeholder="2024"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
            <label className="text-xs text-slate-300">
              Rating Usia
              <select
                value={formData.maturityRating ?? "13+"}
                onChange={(e) => setFormData((prev) => ({ ...prev, maturityRating: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              >
                <option value="SU">SU (Semua Umur)</option>
                <option value="13+">13+</option>
                <option value="16+">16+</option>
                <option value="18+">18+</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Status Series
              <select
                value={formData.status ?? "Ongoing"}
                onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              >
                <option value="Ongoing">Ongoing</option>
                <option value="Completed">Completed</option>
                <option value="Upcoming">Upcoming</option>
              </select>
            </label>
            <label className="text-xs text-slate-300">
              Total Season
              <input
                type="number"
                min={Math.max(1, ...(formData.episodes ?? []).map((ep) => Number(ep?.seasonNumber ?? 1)))}
                max={50}
                value={formData.totalSeasons ?? 1}
                onChange={(e) => {
                  const minAllowed = Math.max(
                    1,
                    ...(formData.episodes ?? []).map((ep) => Number(ep?.seasonNumber ?? 1))
                  );
                  const raw = Number(e.target.value);
                  const clamped = Number.isNaN(raw)
                    ? minAllowed
                    : Math.min(50, Math.max(minAllowed, raw));
                  onDirtyChange?.(true);
                  setFormData((prev) => ({ ...prev, totalSeasons: clamped }));
                }}
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-xs text-slate-300">
              Genre (pisahkan dengan koma)
              <input
                value={Array.isArray(formData.genres) ? formData.genres.join(", ") : formData.genres ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, genres: e.target.value }))}
                placeholder="Drama, Slice of Life, Culinary"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
            <label className="text-xs text-slate-300">
              Pemeran / Cast (pisahkan dengan koma)
              <input
                value={Array.isArray(formData.cast) ? formData.cast.join(", ") : formData.cast ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, cast: e.target.value }))}
                placeholder="Actor A, Actor B"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-xs text-slate-300">
              Sutradara / Kreator
              <input
                value={formData.director ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, director: e.target.value }))}
                placeholder="Nama sutradara"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
            <label className="text-xs text-slate-300">
              Negara Asal
              <input
                value={formData.country ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, country: e.target.value }))}
                placeholder="Jepang / Indonesia"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
            <label className="text-xs text-slate-300">
              Bahasa Utama
              <input
                value={formData.language ?? ""}
                onChange={(e) => setFormData((prev) => ({ ...prev, language: e.target.value }))}
                placeholder="Jepang / Indonesia"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2.5 text-sm text-slate-200"
              />
            </label>
          </div>
        </div>

        {/* DAFTAR EPISODE */}
        <div className="space-y-4 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-100">
                Daftar Season &amp; Episode ({(formData.episodes ?? []).length})
              </h3>
              <p className="text-xs text-slate-500">
                Kelola episode per season. Klik + Season Baru untuk menambah season.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleAddSeason}
                className="rounded-xl border border-primary-500/40 bg-primary-500/10 px-3.5 py-2 text-xs font-semibold text-primary-300 hover:bg-primary-500/20"
              >
                + Season Baru (S{String(seasonData.maxSeason + 1).padStart(2, "0")})
              </button>
              <button
                type="button"
                onClick={() => openEpisodeEditor(null, activeSeason)}
                className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500"
              >
                + Tambah Episode (S{String(activeSeason).padStart(2, "0")})
              </button>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b border-slate-800/70 pb-3">
            {seasonData.seasons.map((seasonNum) => {
              const isActive = activeSeason === seasonNum;
              const count = seasonData.bySeason[seasonNum]?.length ?? 0;
              return (
                <button
                  key={seasonNum}
                  type="button"
                  onClick={() => setActiveSeason(seasonNum)}
                  className={`rounded-xl border px-3.5 py-1.5 text-xs font-semibold transition ${
                    isActive
                      ? "border-primary-500 bg-primary-600 text-white"
                      : "border-slate-800 bg-slate-950/70 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  Season {seasonNum} <span className="opacity-75">({count})</span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3">
            {(seasonData.bySeason[activeSeason] ?? []).map(({ episode, originalIndex }) => {
              const hasMux = Boolean(episode.mux_playback_id || episode.mux_video_id);
              return (
                <div key={episode.episodeId ?? `${activeSeason}-${originalIndex}`} className="rounded-2xl border border-slate-800/60 bg-slate-950/60 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-slate-100">
                          S{String(episode.seasonNumber ?? 1).padStart(2, "0")}E{String(episode.epNumber ?? 0).padStart(2, "0")} — {episode.title}
                        </p>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            hasMux ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"
                          }`}
                        >
                          {hasMux ? "Ready" : "No Asset"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 line-clamp-2">{episode.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => openEpisodeEditor(originalIndex)} className="rounded-full border border-slate-700 px-3 py-1 text-xs text-slate-200 hover:border-primary-500 hover:text-primary-200">
                        Edit
                      </button>
                      <button type="button" onClick={() => deleteEpisode(originalIndex)} className="rounded-full border border-transparent px-3 py-1 text-xs text-rose-300 hover:border-rose-500/40 hover:bg-rose-500/10">
                        Hapus
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
            {!(seasonData.bySeason[activeSeason] ?? []).length && (
              <div className="rounded-2xl border border-dashed border-slate-800/60 bg-slate-950/40 px-4 py-6 text-center text-xs text-slate-500">
                <p>Belum ada episode di Season {activeSeason}.</p>
                <button
                  type="button"
                  onClick={() => openEpisodeEditor(null, activeSeason)}
                  className="mt-2 font-semibold text-primary-300 hover:underline"
                >
                  + Tambah Episode Pertama di Season {activeSeason}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PESAN */}
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

        {/* SUBMIT */}
        <div className="flex items-center gap-3">
          <button type="submit" disabled={isSubmitting} className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-500 disabled:bg-slate-700">
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
              className="rounded-full border border-slate-700 px-5 py-3 text-sm text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Reset perubahan
            </button>
          )}
        </div>
      </form>

      {/* EPISODE EDITOR (Modal Fokus) */}
      {editingEpisodeIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm"
          onClick={requestCloseEpisodeEditor}
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-primary-500/35 bg-slate-950 p-6 space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {confirmCloseModal && (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-200"
              >
                <span>
                  {["hashing", "uploading"].includes(uploadStatus)
                    ? "Upload video masih berjalan. Tutup modal akan membatalkan upload."
                    : "Ada perubahan episode yang belum disimpan. Yakin tutup modal?"}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={closeEpisodeEditor}
                    className="rounded-lg bg-rose-600 px-3 py-1.5 font-semibold text-white hover:bg-rose-500"
                  >
                    Ya, Tutup
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmCloseModal(false)}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 font-medium text-slate-200 hover:bg-slate-800"
                  >
                    Batal
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800/80 pb-3">
              <div>
                <h4 className="text-base font-semibold text-slate-100">
                  {episodeDraft.episodeId ? "Edit Episode" : "Tambah Episode Baru"}
                </h4>
                <p className="text-xs text-slate-400">
                  Upload video otomatis menggunakan Mux Basic Quality ($0 encoding) &amp; Max 1080p.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-300">
                  Basic • 1080p Max
                </span>
                <button
                  type="button"
                  onClick={requestCloseEpisodeEditor}
                  aria-label="Tutup modal episode"
                  className="rounded-xl border border-slate-800 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>
            {isDuplicateDraftEpisode && (
              <div className="rounded-xl border border-amber-500/35 bg-amber-500/10 px-3.5 py-2 text-xs text-amber-200">
                Peringatan: Nomor episode S{String(episodeDraft.seasonNumber ?? 1).padStart(2, "0")}E
                {String(episodeDraft.epNumber ?? 0).padStart(2, "0")} sudah ada di daftar episode series ini.
              </div>
            )}

          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-4">
              <label className="text-sm text-slate-300">
                Season
                <input
                  type="number"
                  min={1}
                  value={episodeDraft.seasonNumber ?? 1}
                  onChange={(e) =>
                    setEpisodeDraft((prev) => ({
                      ...prev,
                      seasonNumber: Number(e.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                />
              </label>
              <label className="text-sm text-slate-300">
                Nomor Episode
                <input
                  type="number"
                  min={1}
                  value={episodeDraft.epNumber ?? ""}
                  onChange={(e) =>
                    setEpisodeDraft((prev) => ({
                      ...prev,
                      epNumber: e.target.value === "" ? "" : Number(e.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                />
              </label>
              <label className="text-sm text-slate-300">
                Durasi (detik)
                <input
                  type="number"
                  min={0}
                  value={episodeDraft.duration ?? ""}
                  onChange={(e) =>
                    setEpisodeDraft((prev) => ({
                      ...prev,
                      duration: e.target.value ? Number(e.target.value) : "",
                    }))
                  }
                  placeholder="Otomatis dari Mux"
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                />
              </label>
              <label className="text-sm text-slate-300">
                Judul Episode
                <input
                  value={episodeDraft.title ?? ""}
                  onChange={(e) => setEpisodeDraft((prev) => ({ ...prev, title: e.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                  required
                />
              </label>
            </div>

            {uploadProgress > 0 && (
              <div className="space-y-1.5 rounded-xl border border-slate-800 bg-slate-900/60 p-3">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">Mengunggah episode ke Mux...</span>
                  <span className="font-semibold text-primary-300 tabular-nums">{uploadProgress}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
                  <div className="h-2 bg-primary-500 transition-all" style={{ width: `${uploadProgress}%` }} />
                </div>
              </div>
            )}

            <label className="text-sm text-slate-300">
              Deskripsi Episode
              <textarea
                value={episodeDraft.description ?? ""}
                onChange={(e) =>
                  setEpisodeDraft((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
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
                  onChange={(e) =>
                    setEpisodeDraft((prev) => ({
                      ...prev,
                      thumbnail: e.target.value,
                    }))
                  }
                  placeholder="https://..."
                  className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                />
              </label>
              <label className="text-sm text-slate-300">
                Playback ID Episode
                <div className="mt-2 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                  <input
                    type="text"
                    value={episodeDraft.mux_playback_id ?? ""}
                    onChange={(e) => {
                      const val = e.target.value;
                      lastFetchedPlaybackRef.current = null;
                      setEpisodeDraft((prev) => ({
                        ...prev,
                        mux_playback_id: val,
                        mux_video_id: val,
                        mux_asset_id: "",
                      }));
                    }}
                    onBlur={(e) => {
                      const normalized = normalizePlaybackValue(e.target.value);
                      lastFetchedPlaybackRef.current = null;
                      setEpisodeDraft((prev) => ({
                        ...prev,
                        mux_playback_id: normalized,
                        mux_video_id: normalized,
                        mux_asset_id: "",
                      }));
                    }}
                    placeholder="Playback ID atau URL Mux"
                    className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                    required
                  />
                  <div className="flex flex-wrap items-center justify-end gap-3 text-xs">
                    <label className="text-primary-200 hover:text-primary-100 cursor-pointer">
                      <input
                        type="file"
                        accept=".mp4,.mkv,video/mp4,video/x-matroska"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0] ?? null;
                          e.target.value = "";
                          setCurrentVideoFile(file);
                        }}
                      />
                      Pilih Video
                    </label>
                    <button
                      type="button"
                      onClick={() => currentVideoFile && handleDirectUpload(currentVideoFile)}
                      disabled={!currentVideoFile || ["hashing", "uploading"].includes(uploadStatus)}
                      className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:opacity-60"
                    >
                      {uploadStatus === "hashing"
                        ? "Memproses..."
                        : uploadStatus === "uploading"
                        ? `Mengunggah ${uploadProgress}%`
                        : "Upload ke Mux"}
                    </button>
                    {episodeDraft.mux_upload_id && !episodeDraft.mux_playback_id && (
                      <button
                        type="button"
                        onClick={retryAutofillFromMux}
                        disabled={uploadProgress > 0}
                        className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:opacity-60"
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
                onChange={(e) =>
                  setEpisodeDraft((prev) => ({
                    ...prev,
                    trailer: e.target.value,
                  }))
                }
                placeholder="https://stream.mux.com/..."
                className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
              />
            </label>

            <SubtitleEditor
              subtitles={episodeDraft.subtitles}
              onChange={(value) => {
                setEpisodeDraft((prev) => ({ ...prev, subtitles: value }));
                setSubtitleSyncStatus("idle");
              }}
              messageSetter={setMessage}
              onUploadStart={() => setSubtitleUploadStatus("processing")}
              onUploadSuccess={() => {
                setSubtitleUploadStatus("success");
                setSubtitleSyncStatus("idle");
              }}
              onUploadError={() => setSubtitleUploadStatus("error")}
            />

            <div className="flex items-center justify-between rounded-2xl border border-slate-800/60 bg-slate-950/40 px-4 py-3 text-xs text-slate-400">
              <div>
                <p className="font-medium text-slate-200">Sinkronisasi Subtitle</p>
                <p className="text-[11px] text-slate-500">
                  Pastikan subtitle sudah memiliki URL publik sebelum mengirim ke Mux.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSubtitleSync}
                disabled={!canSyncSubtitles || isSyncingSubtitles}
                title={!canSyncSubtitles ? "Subtitle harus memiliki URL publik dan asset Mux harus tersedia." : undefined}
                className="rounded-full border border-slate-700 px-3 py-1 text-slate-200 hover:border-primary-500 hover:text-primary-200 disabled:opacity-60"
              >
                {isSyncingSubtitles ? "Mengirim..." : "Kirim Subtitle ke Mux"}
              </button>
            </div>

            {episodeModalError && (
              <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-xs text-rose-200">
                {episodeModalError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {!canSaveEpisode ? (
                <p className="text-[11px] text-amber-300/90">
                  {!episodeDraft.title?.trim() || !episodeDraft.description?.trim()
                    ? "Isi judul dan deskripsi episode untuk menyimpan."
                    : !videoReady
                    ? "Upload video ke Mux atau isi Playback ID terlebih dahulu."
                    : !subtitlesUploadReady
                    ? "Tunggu upload subtitle selesai atau pastikan URL subtitle valid."
                    : "Kirim subtitle ke Mux sebelum menyimpan episode."}
                </p>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-3">
                <button type="button" onClick={requestCloseEpisodeEditor} className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-slate-500 hover:text-white">
                  Batal
                </button>
                <button
                  type="button"
                  onClick={persistEpisodeDraft}
                  disabled={!canSaveEpisode}
                  title={!canSaveEpisode ? "Pastikan video terunggah dan subtitle tersinkron sebelum menyimpan." : undefined}
                  className="rounded-full bg-primary-600 px-5 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:bg-slate-700"
                >
                  Simpan Episode
                </button>
              </div>
            </div>
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
