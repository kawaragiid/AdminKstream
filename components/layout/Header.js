"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAVIGATION, ADMIN_ROLES } from "@/utils/constants";
import LogoutButton from "./LogoutButton";

const Header = ({ session }) => {
  const pathname = usePathname();
  const [avatarError, setAvatarError] = useState(false);
  const role = session?.role ?? ADMIN_ROLES.ADMIN;
  const navigation = ADMIN_NAVIGATION.filter((item) => item.roles.includes(role));
  const activePage = navigation.find((item) => item.href === pathname);
  const pageTitle = pathname?.startsWith("/profile")
    ? "Profil Admin"
    : activePage?.title || "Dashboard";

  return (
    <header className="sticky top-0 z-40 flex min-h-[64px] sm:min-h-[72px] items-center justify-between gap-2 sm:gap-4 border-b border-slate-800/80 bg-slate-950/85 px-4 py-3 backdrop-blur-xl md:px-8">
      <div className="min-w-0 space-y-0.5">
        <p className="text-[10px] sm:text-[11px] font-medium uppercase tracking-[0.2em] text-slate-400">
          Kstream Admin
        </p>
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-100 sm:text-xl md:text-2xl">
          {pageTitle}
        </h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">
        <Link
          href="/upload"
          className="hidden items-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-primary-600/30 transition hover:bg-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 sm:inline-flex"
        >
          <span>+</span>
          <span>Upload Konten</span>
        </Link>

        <Link
          href="/notifications"
          title="Notifikasi"
          aria-label="Notifikasi"
          className="inline-flex h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-slate-800 bg-slate-900/80 text-slate-300 transition hover:border-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2a2 2 0 0 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9" />
          </svg>
        </Link>

        <Link
          href="/profile"
          title="Pengaturan Profil"
          className="flex items-center gap-2.5 rounded-full border border-slate-800 bg-slate-900/80 px-2.5 py-1 text-sm transition hover:border-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {session?.photoURL && !avatarError ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={session.photoURL}
              alt={session.displayName || "Admin"}
              onError={() => setAvatarError(true)}
              className="h-8 w-8 rounded-full object-cover"
            />
          ) : (
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-600 text-xs font-semibold text-white">
              {session?.displayName ? session.displayName.slice(0, 2).toUpperCase() : "AK"}
            </span>
          )}
          <div className="hidden leading-tight sm:block pr-1">
            <p className="max-w-[140px] truncate text-xs font-medium text-slate-100">
              {session?.displayName ?? "Admin Kawaragi"}
            </p>
            <p className="text-[10px] uppercase tracking-wider text-slate-400">{session?.role ?? "admin"}</p>
          </div>
        </Link>
        <LogoutButton />
      </div>
    </header>
  );
};

export default Header;
