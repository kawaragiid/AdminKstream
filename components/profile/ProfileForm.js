"use client";

import { useEffect, useState } from 'react';

function dataURLToBlob(dataUrl) {
  const [header, b64] = dataUrl.split(',');
  const mime = /data:(.*);base64/.exec(header)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

async function resizeImage(file, maxSize = 512) {
  const img = document.createElement('img');
  const url = URL.createObjectURL(file);
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const ratio = Math.min(maxSize / img.width, maxSize / img.height, 1);
  canvas.width = Math.round(img.width * ratio);
  canvas.height = Math.round(img.height * ratio);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  URL.revokeObjectURL(url);
  return new File([dataURLToBlob(dataUrl)], 'profile.jpg', { type: 'image/jpeg' });
}

export default function ProfileForm() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [file, setFile] = useState(null);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/users');
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
      let finalPhoto = photoURL;
      if (file) {
        const resized = await resizeImage(file, 512);
        const fd = new FormData();
        fd.append('file', resized, resized.name);
        const up = await fetch('/api/uploads/image', { method: 'POST', body: fd });
        const j = await up.json();
        if (!up.ok) throw new Error(j.error || 'Gagal mengunggah foto');
        finalPhoto = j?.data?.url || '';
      }
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, photoURL: finalPhoto }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Gagal menyimpan profil');
      setMessage({ type: 'success', text: 'Profil berhasil diperbarui.' });
      setPhotoURL(json?.data?.photoURL || finalPhoto);
      setFile(null);
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
        <img src={file ? URL.createObjectURL(file) : (photoURL || '/logo.png')} alt="avatar" className="h-16 w-16 rounded-full object-cover border border-slate-800" />
        <div className="space-y-2 text-xs text-slate-400">
          <label className="cursor-pointer text-primary-200 hover:text-primary-100">
            <input type="file" accept="image/*" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            Ganti foto profil
          </label>
          <p>Maks 512×512, dikompresi otomatis.</p>
        </div>
      </div>

      <label className="text-sm text-slate-300">
        Nama Tampilan
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
      </label>

      <label className="text-sm text-slate-300">
        URL Foto Profil (opsional)
        <input value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200" />
      </label>

      {message && (
        <div className={`rounded-2xl border px-4 py-3 text-sm ${message.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
          {message.text}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button onClick={handleSave} disabled={saving} className="rounded-full bg-primary-600 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-500 disabled:opacity-60">{saving ? 'Menyimpan...' : 'Simpan Profil'}</button>
      </div>
    </div>
  );
}

