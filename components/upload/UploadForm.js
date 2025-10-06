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
      <div className="flex items-center gap-2 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-2 text-sm">
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
              className={`flex-1 rounded-2xl px-4 py-3 font-medium transition ${
                isActive
                  ? "bg-primary-600 text-white shadow-lg shadow-primary-600/25"
                  : "text-slate-300 hover:bg-slate-800/60"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {notification && (
        <div
          className={`rounded-2xl border px-4 py-3 text-sm ${
            notification.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-slate-700 bg-slate-800/60 text-slate-200"
          }`}
        >
          {notification.text}
        </div>
      )}

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        {activeTab === CONTENT_TYPES.MOVIE ? (
          <MovieForm onSuccess={handleSuccess} submitLabel="Simpan Movie" />
        ) : (
          <SeriesForm onSuccess={handleSuccess} submitLabel="Simpan Series" />
        )}
      </div>
    </div>
  );
}