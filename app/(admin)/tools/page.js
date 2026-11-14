import { redirect } from "next/navigation";
import ToolsPanel from "@/components/tools/ToolsPanel";
import { getSessionUser } from "@/lib/session";

export const metadata = {
  title: "Tools",
};

export default async function ToolsPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  if (!["super-admin", "admin"].includes(session.role)) {
    redirect("/");
  }

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Tools & Utilities</h2>
        <p className="text-sm text-slate-400">
          Export data (CSV/JSON), import metadata massal, dan utilitas backup database.
        </p>
      </header>
      <ToolsPanel />
    </div>
  );
}
