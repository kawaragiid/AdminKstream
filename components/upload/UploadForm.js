"use client";

import { useState } from "react";
import MovieForm from "@/components/upload/MovieForm";
import SeriesForm from "@/components/upload/SeriesForm";
import { CONTENT_TYPES } from "@/utils/constants";

const tabs = [
  { type: CONTENT_TYPES.MOVIE, label: "Tambah Movie" },
  { type: CONTENT_TYPES.SERIES, label: "Tambah Series" },
];

export default function UploadForm() {
  const [activeTab, setActiveTab] = useState(CONTENT_TYPES.MOVIE);
  const [notification, setNotification] = useState(null);

  const handleSuccess = (payload) => {
    setNotification({
      type: "success",
      text:
        activeTab === CONTENT_TYPES.MOVIE
          ? `Movie "${payload?.title ?? ""}" berhasil disimpan.`
          : `Series "${payload?.title ?? ""}" berhasil disimpan.`,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/75 p-2 text-sm">
        <div className="flex flex-1 items-center gap-2">
          {tabs.map((tab) => {
            const isActive = tab.type === activeTab;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() => {
                  setActiveTab(tab.type);
                  setNotification(null);
                }}
                className={`flex-1 rounded-xl px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
                  isActive
                    ? "bg-primary-600 text-white shadow-sm shadow-primary-600/30"
                    : "text-slate-300 hover:bg-slate-800/70"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
        <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300 sm:inline-flex">
          Mux Basic • Max 1080p ($0 Encoding)
        </span>
      </div>

      {notification && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            notification.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-slate-700 bg-slate-800/60 text-slate-200"
          }`}
        >
          {notification.text}
        </div>
      )}

      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-5 sm:p-6">
        {activeTab === CONTENT_TYPES.MOVIE ? (
          <MovieForm onSuccess={handleSuccess} submitLabel="Simpan & Publikasikan Movie" />
        ) : (
          <SeriesForm onSuccess={handleSuccess} submitLabel="Simpan & Publikasikan Series" />
        )}
      </div>
    </div>
  );
}