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
    <header className="flex min-h-[72px] items-center justify-between gap-4 border-b border-slate-800/60 bg-slate-900/60 px-4 py-4 backdrop-blur-md md:px-8">
      <div className="space-y-1">
        <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Admin Panel</p>
        <h1 className="text-xl font-semibold text-slate-100 md:text-2xl">
          {activePage?.title || "Dashboard"}
        </h1>
      </div>

      <div className="flex items-center gap-3">
        <nav className="flex items-center gap-2 md:hidden">
          {navigation.map((item) => {
            const isActive = item.href === pathname;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-xs font-medium ${isActive ? "bg-primary-600 text-white" : "bg-slate-800/70 text-slate-300"}`}
              >
                {item.short}
              </Link>
            );
          })}
        </nav>
        <div className="hidden items-center gap-2 rounded-xl border border-slate-800/70 bg-slate-900 px-4 py-2 text-sm text-slate-400 md:flex">
          <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>Realtime Sync aktif</span>
        </div>
        <div className="flex items-center gap-3 rounded-full border border-slate-800/70 bg-slate-900 px-3 py-1 text-sm">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold">
            {session?.displayName ? session.displayName.slice(0, 2).toUpperCase() : "AK"}
          </span>
          <div className="hidden leading-tight md:block">
            <p className="text-sm font-medium text-slate-100">{session?.displayName ?? "Admin Kawaragi"}</p>
            <p className="text-xs text-slate-400">{session?.role ?? "admin"}</p>
          </div>
        </div>
        <LogoutButton />
      </div>
    </header>
  );
};

export default Header;
