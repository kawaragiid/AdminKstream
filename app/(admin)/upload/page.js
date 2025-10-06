import UploadForm from "@/components/upload/UploadForm";

export const metadata = {
  title: "Upload Konten",
};

export default function UploadPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Tambah Movie atau Series Baru</h2>
        <p className="text-sm text-slate-400">
          Isi metadata lengkap untuk film tunggal atau series dengan playlist episode. Video akan disimpan melalui Mux.
        </p>
      </header>
      <UploadForm />
    </div>
  );
}