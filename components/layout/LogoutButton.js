"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebaseClient";

const LogoutButton = () => {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleLogout = async () => {
    if (!window.confirm("Keluar dari panel admin?")) return;

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
    } catch (error) {
      console.error(error);
      alert(error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-full border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-rose-500 hover:text-rose-200 disabled:opacity-60"
    >
      {loading ? "Keluar..." : "Logout"}
    </button>
  );
};

export default LogoutButton;
