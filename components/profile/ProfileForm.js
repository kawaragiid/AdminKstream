"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function ProfileForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [avatarError, setAvatarError] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users/me');
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(json?.error || 'Gagal memuat profil.');
        }
        if (json?.data) {
          setDisplayName(json.data.displayName ?? '');
          setPhotoURL(json.data.photoURL ?? json.data.photoUrl ?? '');
        }
      } catch (err) {
        setMessage({ type: 'error', text: err?.message || 'Gagal memuat profil.' });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setMessage({ type: 'error', text: 'Nama tampilan tidak boleh kosong.' });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName: trimmedName, photoURL: photoURL.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan profil');
      setMessage({ type: 'success', text: 'Profil berhasil diperbarui.' });
      setDisplayName(trimmedName);
      setPhotoURL(json?.data?.photoURL || photoURL.trim());
      setAvatarError(false);
      router.refresh();
    } catch (e) {
      setMessage({ type: 'error', text: e.message });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-label="Memuat profil"
        className="space-y-4 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6 animate-pulse"
      >
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-slate-800" />
          <div className="space-y-2 flex-1">
            <div className="h-3.5 w-28 rounded bg-slate-800" />
            <div className="h-3 w-64 max-w-full rounded bg-slate-800/80" />
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-32 rounded bg-slate-800" />
          <div className="h-11 w-full rounded-2xl bg-slate-800/80" />
        </div>
        <div className="space-y-2">
          <div className="h-3.5 w-40 rounded bg-slate-800" />
          <div className="h-11 w-full rounded-2xl bg-slate-800/80" />
        </div>
        <div className="h-10 w-36 rounded-2xl bg-slate-800" />
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="space-y-4 rounded-3xl border border-slate-800/60 bg-slate-900/60 p-6"
    >
      <div className="flex items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={(!avatarError && photoURL.trim()) || '/logo.png'}
          alt="avatar"
          onError={() => setAvatarError(true)}
          className="h-16 w-16 rounded-full object-cover border border-slate-800"
        />
        <div className="space-y-1 text-xs text-slate-400">
          <p className="font-medium text-slate-300">Avatar Profil</p>
          <p>Gunakan URL gambar (https://) atau foto bawaan akun Google Anda.</p>
        </div>
      </div>

      <label className="block text-sm text-slate-300">
        Nama Tampilan
        <input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          required
          className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
        />
      </label>

      <label className="block text-sm text-slate-300">
        URL Foto Profil (opsional)
        <input
          value={photoURL}
          onChange={(e) => {
            setAvatarError(false);
            setPhotoURL(e.target.value);
          }}
          placeholder="https://..."
          className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200"
        />
      </label>

      {message && (
        <div
          role={message.type === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          className={`rounded-2xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}
        >
          {message.text}
        </div>
      )}

      <button type="submit" disabled={saving} className="rounded-2xl bg-primary-500 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-400 disabled:opacity-50">
        {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
      </button>
    </form>
  );
}
