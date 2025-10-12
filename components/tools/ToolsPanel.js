"use client";

import { useRef, useState } from "react";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

const sampleRecord = JSON.stringify(
  {
    title: "Judul",
    description: "...",
    thumbnailUrl: "https://...",
    trailerPlaybackId: "",
    mainPlaybackId: "",
    category: "Action",
  },
  null,
  0
);

const ToolsPanel = () => {
  const fileInputRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [fsCols, setFsCols] = useState(() => {
    const values = Object.values(FIRESTORE_COLLECTIONS ?? {});
    // preselect common ones
    return new Set(values.filter((v) => [
      FIRESTORE_COLLECTIONS?.MOVIES,
      FIRESTORE_COLLECTIONS?.SERIES,
      FIRESTORE_COLLECTIONS?.ADMIN_USERS,
      FIRESTORE_COLLECTIONS?.SETTINGS,
    ].includes(v)));
  });

  const triggerDownload = async (type, format = "csv") => {
    setMessage(null);
    try {
      const response = await fetch(`/api/tools/export?type=${type}&format=${format}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Gagal export");
      }

      if (format === "csv") {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${type}-export.${format}`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
      } else {
        const data = await response.json();
        setMessage({ type: "info", text: `Export ${type} (JSON) siap di console.` });
        console.log(`Export ${type}`, data);
      }
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setMessage(null);

    try {
      const text = await file.text();
      const records = JSON.parse(text);
      const response = await fetch("/api/tools/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "content", records }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal import data");
      }
      setMessage({ type: "success", text: `Import selesai. ${result.data.length} item diproses.` });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const exportFirestore = async () => {
    setMessage(null);
    try {
      const cols = Array.from(fsCols);
      const qs = cols.length ? `&collections=${encodeURIComponent(cols.join(","))}` : "";
      const response = await fetch(`/api/tools/export?type=firestore${qs}`);
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error ?? "Gagal export Firestore");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `firestore-export.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      setMessage({ type: "success", text: `Export Firestore (${cols.length || "default"} koleksi).` });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const importFirestore = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setMessage(null);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const response = await fetch("/api/tools/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "firestore", collections: json.collections ?? json, merge: true }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal import Firestore");
      }
      setMessage({ type: "success", text: `Import selesai. ${result.data?.length ?? 0} dokumen.` });
    } catch (error) {
      console.error(error);
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
      event.target.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Export Data</h3>
        <p className="text-sm text-slate-400">Unduh data konten, pengguna, dan analitik untuk kebutuhan laporan.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => triggerDownload("content")}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
          >
            Export Konten (CSV)
          </button>
          <button
            type="button"
            onClick={() => triggerDownload("users")}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
          >
            Export User (CSV)
          </button>
          <button
            type="button"
            onClick={() => triggerDownload("analytics", "json")}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
          >
            Export Analytics (JSON)
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Firestore Export / Import</h3>
        <p className="text-sm text-slate-400">Unduh atau unggah snapshot koleksi Firestore (JSON).</p>
        <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-4">
          {Object.values(FIRESTORE_COLLECTIONS).map((col) => (
            <label key={col} className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={fsCols.has(col)}
                onChange={(e) => {
                  setFsCols((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(col);
                    else next.delete(col);
                    return next;
                  });
                }}
                className="h-4 w-4 rounded border-slate-700 bg-slate-900"
              />
              {col}
            </label>
          ))}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={exportFirestore}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
          >
            Export Firestore (JSON)
          </button>
          <div className="text-xs text-slate-400">atau import:</div>
          <input
            type="file"
            accept="application/json"
            onChange={importFirestore}
            disabled={loading}
            className="w-full max-w-xs cursor-pointer rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-3 text-xs text-slate-400"
          />
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Import Metadata Konten</h3>
        <p className="text-sm text-slate-400">
          Impor file JSON dengan array metadata konten untuk bulk upload.
        </p>
        <div className="mt-4">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json"
            onChange={handleImport}
            disabled={loading}
            className="w-full cursor-pointer rounded-2xl border border-dashed border-slate-700 bg-slate-950 px-4 py-6 text-sm text-slate-400"
          />
          <p className="mt-2 text-xs text-slate-500">
            Format contoh: <code className="break-all rounded bg-slate-800/60 px-2 py-1 text-[10px] text-slate-200">[{sampleRecord}]</code>
          </p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Backup Metadata (Opsional)</h3>
        <p className="text-sm text-slate-400">
          Penjadwalan backup otomatis dapat dilakukan via Cloud Scheduler atau cron job terpisah.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>Gunakan export konten mingguan dan simpan ke Cloud Storage.</li>
          <li>Aktifkan backup Firestore native dari Google Cloud console.</li>
        </ul>
      </div>

      {message && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : message.type === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-200"
                : "border-slate-700 bg-slate-800/70 text-slate-200"
          }`}
        >
          {message.text}
        </div>
      )}
    </div>
  );
};

export default ToolsPanel;
