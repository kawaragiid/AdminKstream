import Link from "next/link";

export default function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4 text-slate-100">
      <div className="w-full max-w-md space-y-5 rounded-3xl border border-slate-800/80 bg-slate-900/75 p-8 text-center shadow-2xl">
        <div className="mx-auto inline-flex rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-lg font-bold tracking-widest text-primary-300">
          404
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
            Kstream Admin
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-100">
            Halaman Tidak Ditemukan
          </h1>
          <p className="text-sm text-slate-400">
            Rute yang Anda tuju tidak tersedia atau telah dipindahkan.
          </p>
        </div>
        <div className="pt-2">
          <Link
            href="/"
            className="inline-flex rounded-xl bg-primary-600 px-5 py-2.5 text-xs font-semibold text-white transition hover:bg-primary-500"
          >
            Kembali ke Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
