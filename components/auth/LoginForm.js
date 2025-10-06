"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getFirebaseAuth,
  googleProvider,
} from "@/lib/firebaseClient";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";

const errorMessages = {
  "auth/wrong-password": "Password salah. Coba lagi.",
  "auth/user-not-found": "Email tidak ditemukan.",
  "auth/too-many-requests": "Terlalu banyak percobaan. Coba beberapa saat lagi.",
};

const STATUS_MESSAGE = {
  suspended: "Akun admin sedang ditangguhkan. Hubungi super admin.",
};

export default function LoginForm({ errorCode }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (errorCode && STATUS_MESSAGE[errorCode]) {
      setError(STATUS_MESSAGE[errorCode]);
    }
  }, [errorCode]);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Gagal menyimpan sesi.");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      console.error(err);
      const message = errorMessages[err.code] || err.message || "Gagal login";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);

    try {
      const auth = getFirebaseAuth();
      await setPersistence(auth, browserLocalPersistence);
      const credential = await signInWithPopup(auth, googleProvider);
      const idToken = await credential.user.getIdToken();

      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!response.ok) {
        throw new Error("Tidak dapat membuat sesi admin.");
      }

      router.replace("/");
      router.refresh();
    } catch (err) {
      console.error(err);
      const message = errorMessages[err.code] || err.message || "Gagal login";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-3xl border border-slate-800/60 bg-slate-900/80 p-8 shadow-2xl shadow-slate-950/40">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.25em] text-slate-500">AdminKstream</p>
        <h1 className="mt-3 text-2xl font-semibold text-slate-100">Masuk ke dashboard</h1>
        <p className="mt-2 text-sm text-slate-400">
          Gunakan akun admin/editor yang terdaftar.
        </p>
      </div>

      <form onSubmit={handleLogin} className="mt-8 space-y-4">
        <label className="block text-sm text-slate-300">
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40"
            placeholder="admin@kstream.id"
          />
        </label>
        <label className="block text-sm text-slate-300">
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            className="mt-2 w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-slate-200 outline-none transition focus:border-primary-500 focus:ring-2 focus:ring-primary-500/40"
            placeholder="••••••••"
          />
        </label>
        {error && (
          <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-primary-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-500 disabled:cursor-not-allowed disabled:bg-slate-700"
        >
          {loading ? "Memproses..." : "Masuk"}
        </button>
      </form>

      <div className="mt-6">
        <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-slate-500">
          <span className="h-px flex-1 bg-slate-800" />
          atau
          <span className="h-px flex-1 bg-slate-800" />
        </div>
        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={loading}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-primary-400 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800"
        >
          {loading ? "Menghubungkan..." : "Masuk dengan Google"}
        </button>
      </div>
    </div>
  );
}
