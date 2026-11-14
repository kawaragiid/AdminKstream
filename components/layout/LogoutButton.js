"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";

const LogoutButton = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState(null);

  const handleLogout = async () => {
    setError(null);
    try {
      setLoading(true);
      await signOut(getFirebaseAuth()).catch(() => {});
      const response = await fetch("/api/auth/session", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Gagal logout. Coba lagi.");
      }

      router.push("/login");
      router.refresh();
    } catch (err) {
      console.error(err);
      setError(err.message || "Gagal logout.");
      setConfirming(false);
    } finally {
      setLoading(false);
    }
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleLogout}
          disabled={loading}
          className="rounded-full bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-500 disabled:opacity-60"
        >
          {loading ? "Keluar..." : "Ya, Keluar"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={loading}
          className="rounded-full border border-slate-700 px-2.5 py-1.5 text-xs font-medium text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-60"
        >
          Batal
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex items-center gap-2">
      {error && (
        <span role="alert" className="text-[11px] text-rose-400">
          {error}
        </span>
      )}
      <button
        type="button"
        onClick={() => {
          setError(null);
          setConfirming(true);
        }}
        disabled={loading}
        className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-500 hover:text-rose-200 disabled:opacity-60"
      >
        Logout
      </button>
    </div>
  );
};

export default LogoutButton;
