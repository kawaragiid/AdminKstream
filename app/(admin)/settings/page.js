import { redirect } from "next/navigation";
import SettingsForm from "@/components/settings/SettingsForm";
import { fetchPlatformSettings } from "@/lib/settingsService";
import { getSessionUser } from "@/lib/session";
import { ADMIN_ROLES } from "@/utils/constants";

export const metadata = {
  title: "Pengaturan",
};

export default async function SettingsPage() {
  const session = await getSessionUser();
  if (!session) {
    redirect("/login");
  }
  if (![ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN].includes(session.role)) {
    redirect("/");
  }

  const settings = await fetchPlatformSettings();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h2 className="text-2xl font-semibold text-slate-100">Konfigurasi Platform</h2>
        <p className="text-sm text-slate-400">
          Kelola kategori, konten unggulan, dan tema dashboard.
        </p>
      </header>
      <SettingsForm initialSettings={settings} />
    </div>
  );
}
