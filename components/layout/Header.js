"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAVIGATION, ADMIN_ROLES } from "@/utils/constants";
import LogoutButton from "./LogoutButton";

const Header = ({ session }) => {
  const pathname = usePathname();
  const role = session?.role ?? ADMIN_ROLES.EDITOR;
  const navigation = ADMIN_NAVIGATION.filter((item) => item.roles.includes(role));
  const activePage = navigation.find((item) => item.href === pathname);

  return (
    <header className="sticky top-0 z-50 flex min-h-[60px] sm:min-h-[72px] items-center justify-between gap-2 sm:gap-4 border-b border-slate-800/60 bg-slate-900/80 px-3 sm:px-4 py-2 sm:py-4 backdrop-blur-md md:px-8">
      <div className="space-y-0.5 sm:space-y-1">
        <p className="text-[10px] sm:text-xs uppercase tracking-[0.2em] text-slate-500">Admin Panel</p>
        <h1 className="text-lg sm:text-xl font-semibold text-slate-100 md:text-2xl truncate">{activePage?.title || "Dashboard"}</h1>
      </div>

      <div className="flex items-center gap-2 sm:gap-3">

        <div className="hidden items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900/90 px-4 py-2 text-sm text-slate-400 md:flex">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>Realtime Sync aktif</span>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 rounded-full border border-slate-800/70 bg-slate-900/90 px-2 sm:px-3 py-1 text-sm">
          <span className="inline-flex h-7 w-7 sm:h-9 sm:w-9 items-center justify-center rounded-full bg-primary-600 text-xs sm:text-sm font-semibold">{session?.displayName ? session.displayName.slice(0, 2).toUpperCase() : "AK"}</span>
          <div className="hidden leading-tight sm:block">
            <p className="text-xs sm:text-sm font-medium text-slate-100 truncate max-w-[120px] sm:max-w-none">{session?.displayName ?? "Admin Kawaragi"}</p>
            <p className="text-[10px] sm:text-xs text-slate-400">{session?.role ?? "admin"}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
};

export default Header;
