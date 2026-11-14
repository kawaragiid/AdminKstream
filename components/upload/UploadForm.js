"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import MovieForm from "@/components/upload/MovieForm";
import SeriesForm from "@/components/upload/SeriesForm";
import EpisodeUploadForm from "@/components/upload/EpisodeUploadForm";
import { CONTENT_TYPES } from "@/utils/constants";

const tabs = [
  { type: CONTENT_TYPES.MOVIE, label: "Tambah Movie" },
  { type: CONTENT_TYPES.SERIES, label: "Buat Series Baru" },
  { type: "episode", label: "Tambah Episode / Season" },
];

export default function UploadForm() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryTab = searchParams.get("tab");
  const querySeriesId = searchParams.get("seriesId") ?? "";
  const querySeason = searchParams.get("season");

  const [activeTab, setActiveTab] = useState(
    queryTab === "episode"
      ? "episode"
      : queryTab === CONTENT_TYPES.SERIES
      ? CONTENT_TYPES.SERIES
      : CONTENT_TYPES.MOVIE
  );
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    if (queryTab === "episode") {
      setActiveTab("episode");
    } else if (queryTab === CONTENT_TYPES.SERIES) {
      setActiveTab(CONTENT_TYPES.SERIES);
    } else if (queryTab === CONTENT_TYPES.MOVIE) {
      setActiveTab(CONTENT_TYPES.MOVIE);
    }
  }, [queryTab]);

  const handleSuccess = (payload) => {
    setNotification({
      type: "success",
      text:
        activeTab === CONTENT_TYPES.MOVIE
          ? `Movie "${payload?.title ?? ""}" berhasil disimpan.`
          : activeTab === "episode"
          ? `Episode "${payload?.title ?? ""}" berhasil ditambahkan.`
          : `Series "${payload?.title ?? ""}" berhasil disimpan.`,
    });
  };

  const handleTabChange = (nextTab) => {
    setActiveTab(nextTab);
    setNotification(null);
    const params = new URLSearchParams(searchParams.toString());
    params.set("tab", nextTab);
    const targetPath = pathname || "/upload";
    router.replace(`${targetPath}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/75 p-2 text-sm">
        <div className="flex flex-1 flex-wrap items-center gap-2">
          {tabs.map((tab) => {
            const isActive = tab.type === activeTab;
            return (
              <button
                key={tab.type}
                type="button"
                onClick={() => handleTabChange(tab.type)}
                className={`flex-1 min-w-[140px] rounded-xl px-4 py-2.5 text-xs font-semibold transition sm:text-sm ${
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
        <span className="hidden rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300 lg:inline-flex">
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
        ) : activeTab === "episode" ? (
          <EpisodeUploadForm
            initialSeriesId={querySeriesId}
            initialSeason={querySeason ? Number(querySeason) : null}
            onSuccess={handleSuccess}
          />
        ) : (
          <SeriesForm onSuccess={handleSuccess} submitLabel="Simpan & Publikasikan Series" />
        )}
      </div>
    </div>
  );
}
