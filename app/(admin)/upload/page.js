import { Suspense } from "react";
import UploadForm from "@/components/upload/UploadForm";

export const metadata = {
  title: "Upload Konten",
};

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Upload Konten &amp; Episode</h2>
        <p className="text-sm text-slate-400">
          Tambah Movie baru, buat Series baru, atau tambahkan Episode &amp; Season ke Series yang sudah ada melalui Mux.
        </p>
      </header>
      <Suspense fallback={<div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-6 text-sm text-slate-400">Memuat form upload...</div>}>
        <UploadForm />
      </Suspense>
    </div>
  );
}
