"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAVIGATION, ADMIN_ROLES } from "@/utils/constants";

const NAV_GROUPS = [
  {
    id: "main",
    label: "Utama",
    hrefs: ["/"],
  },
  {
    id: "catalog",
    label: "Katalog & Analitik",
    hrefs: ["/content", "/upload", "/analytics"],
  },
  {
    id: "system",
    label: "Operasional",
    hrefs: ["/users", "/logs", "/notifications", "/settings", "/tools"],
  },
];

const Indicator = () => (
  <span className="relative flex h-2 w-2 shrink-0">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
  </span>
);

const Sidebar = ({ session }) => {
  const pathname = usePathname();
  const role = session?.role ?? ADMIN_ROLES.ADMIN;
  const [expanded, setExpanded] = useState(true);

  const navigation = useMemo(
    () => ADMIN_NAVIGATION.filter((item) => item.roles.includes(role)),
    [role]
  );

  const groupedNav = useMemo(() => {
    const byHref = new Map(navigation.map((item) => [item.href, item]));
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.hrefs.map((href) => byHref.get(href)).filter(Boolean),
    })).filter((group) => group.items.length > 0);
  }, [navigation]);

  useEffect(() => {
    try {
      const savedState = localStorage.getItem("sidebar_expanded");
      if (savedState !== null) {
        setExpanded(JSON.parse(savedState));
      }
    } catch {
      setExpanded(true);
    }
  }, []);

  const toggleSidebar = () => {
    setExpanded((prev) => {
      const newState = !prev;
      try {
        localStorage.setItem("sidebar_expanded", JSON.stringify(newState));
      } catch {
        // ignore storage error
      }
      return newState;
    });
  };

  return (
    <aside
      className={`fixed bottom-0 left-0 right-0 z-50 border-t border-slate-800/80 bg-slate-950/95 backdrop-blur-xl transition-[width] duration-300 ease-in-out md:sticky md:top-0 md:flex md:h-screen md:flex-col md:border-r md:border-t-0 ${
        expanded ? "md:w-64" : "md:w-[76px]"
      }`}
    >
      {/* Brand Header (Desktop) */}
      <div
        className={`hidden md:flex items-center border-b border-slate-800/70 ${
          expanded ? "justify-between px-4 py-4" : "justify-center px-2 py-4"
        }`}
      >
        <Link href="/" className="flex items-center gap-3 min-w-0">
          <Image
            src="/logo.png"
            alt="AdminKstream logo"
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-xl border border-slate-800 bg-slate-900 object-contain"
            priority
          />
          {expanded && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight text-slate-100">
                AdminKstream
              </p>
              <p className="truncate text-[10px] font-medium uppercase tracking-wider text-slate-400">
                {session?.role ?? "ADMIN"}
              </p>
            </div>
          )}
        </Link>
      </div>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex md:flex-1 md:flex-col md:gap-5 md:overflow-y-auto md:px-3 md:py-4">
        {groupedNav.map((group) => (
          <div key={group.id} className="space-y-1">
            {expanded && (
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                {group.label}
              </p>
            )}
            <div className="space-y-1">
              {group.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    title={expanded ? item.description : `${item.label} — ${item.description}`}
                    className={`group flex items-center rounded-xl transition-all duration-150 ${
                      expanded ? "gap-3 px-3 py-2" : "justify-center p-2"
                    } ${
                      isActive
                        ? "bg-primary-600/15 text-white border border-primary-500/30 shadow-sm shadow-primary-950/30"
                        : "border border-transparent text-slate-400 hover:bg-slate-900/90 hover:text-slate-100"
                    }`}
                  >
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-base transition-colors ${
                        isActive
                          ? "bg-primary-600 text-white"
                          : "bg-slate-900/90 text-slate-300 group-hover:bg-slate-800"
                      }`}
                    >
                      {item.icon}
                    </span>
                    {expanded && (
                      <span className="truncate text-sm font-medium">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Mobile Bottom Navigation */}
      <nav className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 no-scrollbar md:hidden">
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-1.5 text-[10px] font-medium transition ${
                isActive
                  ? "bg-primary-600/20 text-primary-200"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span>{item.short || item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer: Status + Collapse Button (Desktop) */}
      <div className="hidden md:block border-t border-slate-800/70 p-3 space-y-2.5">
        {expanded && (
          <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 px-3 py-2.5">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
              <Indicator />
              <span className="truncate">{session?.displayName ?? "Admin"} online</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-500">
              Neon • Auth • Mux Basic
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={toggleSidebar}
          title={expanded ? "Ciutkan Sidebar" : "Perluas Sidebar"}
          className={`flex w-full items-center gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/50 px-3 py-2 text-xs font-medium text-slate-300 transition hover:border-slate-700 hover:bg-slate-800/80 hover:text-white ${
            !expanded && "justify-center px-0"
          }`}
        >
          <span className="text-[11px]">{expanded ? "◀" : "▶"}</span>
          {expanded && <span>Ciutkan Sidebar</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
