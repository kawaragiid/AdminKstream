"use client";

import { useState } from "react";

const SettingsForm = ({ initialSettings }) => {
  const [settings, setSettings] = useState(initialSettings);
  const [newCategory, setNewCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const addCategory = () => {
    if (!newCategory.trim()) return;
    setSettings((prev) => ({
      ...prev,
      categories: Array.from(new Set([...(prev.categories ?? []), newCategory.trim()])),
    }));
    setNewCategory("");
  };

  const removeCategory = (category) => {
    setSettings((prev) => ({
      ...prev,
      categories: prev.categories.filter((item) => item !== category),
    }));
  };

  const updateHero = (field, value) => {
    setSettings((prev) => ({
      ...prev,
      hero: {
        ...prev.hero,
        [field]: value,
      },
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal menyimpan pengaturan");
      }

      setMessage({ type: "success", text: "Pengaturan berhasil disimpan." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Kategori Film / Series</h3>
        <p className="text-sm text-slate-400">Kelola kategori yang tersedia di platform user.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {settings.categories?.map((category) => (
            <span key={category} className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-1.5 text-xs text-slate-200">
              {category}
              <button type="button" onClick={() => removeCategory(category)} className="text-slate-500 hover:text-rose-300">
                �
              </button>
            </span>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input value={newCategory} onChange={(event) => setNewCategory(event.target.value)} placeholder="Tambah kategori" className="flex-1 rounded-2xl border border-slate-800 bg-slate-950 px-4 py-2 text-sm text-slate-200" />
          <button // Tombol tambah dibuat full-width di mobile
            type="button"
            onClick={addCategory}
            className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500"
          >
            Tambah
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Hero Banner Homepage</h3>
        <p className="text-sm text-slate-400">Atur konten unggulan yang tampil di homepage user.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm text-slate-300">
            Judul
            <input value={settings.hero?.title ?? ""} onChange={(event) => updateHero("title", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
          </label>
          <label className="text-sm text-slate-300">
            Konten ID
            <input value={settings.hero?.contentId ?? ""} onChange={(event) => updateHero("contentId", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
          </label>
          <label className="text-sm text-slate-300 md:col-span-2">
            Subtitle
            <input value={settings.hero?.subtitle ?? ""} onChange={(event) => updateHero("subtitle", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
          </label>
          <label className="text-sm text-slate-300 md:col-span-2">
            Background URL
            <input value={settings.hero?.backgroundUrl ?? ""} onChange={(event) => updateHero("backgroundUrl", event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
          </label>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
        <h3 className="text-lg font-semibold text-slate-100">Tema Dashboard</h3>
        <p className="text-sm text-slate-400">Ubah tampilan default dashboard admin.</p>
        <div className="mt-4 flex gap-4">
          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, theme: { mode: "dark" } }))}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${settings.theme?.mode === "dark" ? "border-primary-500 bg-primary-500/20 text-primary-200" : "border-slate-700 bg-slate-950 text-slate-300"}`}
          >
            Dark
          </button>
          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, theme: { mode: "light" } }))}
            className={`rounded-2xl border px-4 py-3 text-sm font-semibold transition ${settings.theme?.mode === "light" ? "border-primary-500 bg-primary-500/20 text-primary-200" : "border-slate-700 bg-slate-950 text-slate-300"}`}
          >
            Light
          </button>
        </div>
      </div>

      {message && <div className={`rounded-2xl border px-4 py-3 text-sm ${message.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}>{message.text}</div>}

      <div className="flex items-center justify-end gap-3">
        <button type="submit" disabled={saving} className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700">
          {saving ? "Menyimpan..." : "Simpan Pengaturan"}
        </button>
      </div>
    </form>
  );
};

export default SettingsForm;
