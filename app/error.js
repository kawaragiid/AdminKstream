"use client";

import Link from "next/link";

export default function ErrorPage({ error, reset }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800/80 bg-slate-900/75 p-8 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-xl text-rose-300">
          !
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-300">
            Terjadi Kesalahan
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Gagal Memuat Halaman
          </h1>
          <p className="text-sm text-slate-400">
            {error?.message || "Terjadi kesalahan tak terduga pada panel admin. Silakan coba lagi."}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset?.()}
            className="rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-500"
          >
            Coba Lagi
          </button>
          <Link
            href="/"
            className="rounded-xl border border-slate-700 px-5 py-2.5 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
