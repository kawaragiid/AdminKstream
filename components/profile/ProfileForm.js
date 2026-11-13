"use client";

import { useEffect, useState } from 'react';

export default function ProfileForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users/me');
        const json = await res.json();
        if (res.ok && json?.data) {
          setDisplayName(json.data.displayName ?? '');
          setPhotoURL(json.data.photoURL ?? json.data.photoUrl ?? '');
        }
      } finally { setLoading(false); }
    })();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, photoURL }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan profil');
      setMessage({ type: 'success', text: 'Profil berhasil diperbarui.' });
      setPhotoURL(json?.data?.photoURL || photoURL);
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="text-sm text-slate-400">Memuat profil...</div>;

  return (
    <div className="space-y-4 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6">
      <div className="flex items-center gap-4">
        <img src={photoURL || '/logo.png'} alt="avatar" className="h-16 w-16 rounded-full object-cover border border-slate-800" />
        <div className="space-y-1 text-xs text-slate-400">
          <p className="font-medium text-slate-300">Avatar Profil</p>
          <p>Gunakan URL gambar (https://) atau foto bawaan akun Google Anda.</p>
        </div>
      </div>

      <label className="text-sm text-slate-300">
        Nama Tampilan
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
      </label>

      <label className="text-sm text-slate-300">
        URL Foto Profil (opsional)
        <input value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} placeholder="https://..." className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
      </label>

      {message && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
          {message.text}
        </div>
      )}

      <button onClick={handleSave} disabled={saving} className="rounded-2xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50">
        {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
      </button>
    </div>
  );
}
