import ContentTable from "@/components/content/ContentTable";

export const metadata = {
  title: "Daftar Konten",
};

export default function ContentPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Daftar Konten</h2>
        <p className="text-sm text-slate-400">
          Pantau status video, update playback ID, dan atur distribusi.
        </p>
      </header>
      <ContentTable />
    </div>
  );
}
