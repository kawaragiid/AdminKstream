import ToolsPanel from "@/components/tools/ToolsPanel";

export const metadata = {
  title: "Tools",
};

export default function ToolsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Tools & Utilities</h2>
        <p className="text-sm text-slate-400">
          Export data, import metadata massal, dan rekomendasi backup Firestore.
        </p>
      </header>
      <ToolsPanel />
    </div>
  );
}
