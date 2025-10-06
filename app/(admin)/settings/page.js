import SettingsForm from "@/components/settings/SettingsForm";
import { fetchPlatformSettings } from "@/lib/settingsService";

export const metadata = {
  title: "Pengaturan",
};

export default async function SettingsPage() {
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
