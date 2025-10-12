"use client";

import Image from "next/image";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAVIGATION, ADMIN_ROLES } from "@/utils/constants";

const baseItemClasses = "group flex flex-col md:flex-row items-center md:gap-3 rounded-lg md:rounded-xl px-2 md:px-4 py-2 md:py-3 text-[10px] md:text-sm transition-colors duration-200";

const Indicator = () => (
  <span className="relative flex h-2 w-2">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
  </span>
);

import Image from "next/image";
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ADMIN_NAVIGATION, ADMIN_ROLES } from "@/utils/constants";

const baseItemClasses = "group flex flex-col md:flex-row items-center md:gap-3 rounded-lg md:rounded-xl px-2 md:px-4 py-2 md:py-3 text-[10px] md:text-sm transition-colors duration-200";

const Indicator = () => (
  <span className="relative flex h-2 w-2">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60"></span>
    <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400"></span>
  </span>
);

const Sidebar = ({ session }) => {
  const pathname = usePathname();
  const role = session?.role ?? ADMIN_ROLES.EDITOR;
  const [expanded, setExpanded] = useState(true);
  const navigation = ADMIN_NAVIGATION.filter((item) => item.roles.includes(role));

  useEffect(() => {
    const savedState = localStorage.getItem("sidebar_expanded");
    setExpanded(savedState ? JSON.parse(savedState) : true);
  }, []);

  const toggleSidebar = () => {
    setExpanded((prev) => {
      const newState = !prev;
      localStorage.setItem("sidebar_expanded", JSON.stringify(newState));
      return newState;
    });
  };

  return (
    <aside
      className={`fixed bottom-0 left-0 right-0 z-50 md:relative flex md:flex-col border-t md:border-r border-slate-800/60 bg-slate-950/90 backdrop-blur-xl transition-[width] duration-300 ease-in-out ${expanded ? "md:w-64" : "md:w-16"}`}>
      <div className={`hidden md:flex items-center ${expanded ? "gap-3 px-6" : "gap-2 px-2"} pb-6 pt-8`}>
        <Image src="/logo.png" alt="AdminKstream logo" width={expanded ? 44 : 36} height={expanded ? 44 : 36} className={`${expanded ? "h-11 w-11" : "h-9 w-9"} shrink-0 rounded-xl border border-slate-800 object-contain`} priority />
        {expanded && (
          <div>
            <p className="text-lg font-semibold tracking-tight">AdminKstream</p>
            <p className="text-xs text-slate-400">{session?.role?.toUpperCase() ?? "EDITOR"}</p>
          </div>
        )}
      </div>

      <nav className={`flex md:flex-col md:flex-1 items-center md:justify-start md:space-y-1 w-full ${expanded ? "md:px-3" : "md:px-1"} py-1 md:py-0 overflow-x-auto no-scrollbar px-2`}>
        {navigation.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`${baseItemClasses} flex-shrink-0 ${expanded ? "" : "px-2"} ${isActive ? "bg-primary-600/90 text-white shadow-lg shadow-primary-600/25" : "text-slate-300 hover:bg-slate-800/60"}`}>
              <span className={`flex h-8 w-10 items-center justify-center rounded-xl text-lg font-semibold ${isActive ? "bg-primary-500/20 text-white" : "bg-slate-900 text-primary-200"}`}>{item.icon}</span>
              <span className="mt-1 text-center text-[10px] leading-tight md:hidden">{item.short ?? item.label}</span>
              {expanded && (
                <div className="leading-tight">
                  <p className="font-medium">{item.label}</p>
                  <p className="text-xs text-slate-400">{item.description}</p>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="hidden md:block px-3 pb-4">
        {expanded && (
          <div className="mb-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <p className="text-sm font-medium text-slate-200">Status Sistem</p>
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <Indicator />
              <span>{session?.displayName ?? "Admin"} online</span>
            </div>
            <p className="mt-3 text-xs text-slate-500">Firebase, Firestore dan Mux terhubung.</p>
          </div>
        )}
        <button onClick={toggleSidebar} className={`group flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm text-slate-300 transition-colors hover:bg-slate-800/60 ${!expanded && 'justify-center'}`}>
          {expanded ? "<" : ">"}
          {expanded && <span className="font-medium">Ciutkan</span>}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
