"use client";

import { useMemo, useState } from "react";
import { ADMIN_ROLES, USER_PLANS, CUSTOMER_ROLE } from "@/utils/constants";

const roleOptions = [...Object.values(ADMIN_ROLES), CUSTOMER_ROLE];
const planOptions = Object.values(USER_PLANS);

function getInitials(user) {
  const source = user?.displayName || user?.email || "U";
  return String(source).trim().slice(0, 2).toUpperCase();
}

function getRoleBadgeClass(role) {
  if (role === ADMIN_ROLES.SUPER_ADMIN) {
    return "border-purple-500/35 bg-purple-500/10 text-purple-300";
  }
  if (role === ADMIN_ROLES.ADMIN) {
    return "border-sky-500/35 bg-sky-500/10 text-sky-300";
  }
  if (role === ADMIN_ROLES.EDITOR) {
    return "border-indigo-500/35 bg-indigo-500/10 text-indigo-300";
  }
  return "border-slate-700 bg-slate-800/70 text-slate-300";
}

const UserTable = ({ initialUsers = [] }) => {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(false);
  const [savingUid, setSavingUid] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [planFilter, setPlanFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [selectedUser, setSelectedUser] = useState(null);
  const [draftRole, setDraftRole] = useState("");
  const [draftPlan, setDraftPlan] = useState("");
  const [confirmSuspend, setConfirmSuspend] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: ADMIN_ROLES.ADMIN,
  });

  const stats = useMemo(() => {
    const total = users.length;
    const staff = users.filter((u) =>
      [ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR].includes(u.role)
    ).length;
    const premiumActive = users.filter((u) => u.plan === USER_PLANS.PREMIUM || u.isActive).length;
    const suspended = users.filter((u) => u.disabled || u.status === "suspend").length;
    return { total, staff, premiumActive, suspended };
  }, [users]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((user) => {
      if (q) {
        const hay = `${user.displayName ?? ""} ${user.email ?? ""} ${user.uid ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (roleFilter !== "all" && user.role !== roleFilter) return false;
      if (planFilter !== "all" && user.plan !== planFilter) return false;
      if (statusFilter === "active" && (user.disabled || user.status === "suspend")) return false;
      if (statusFilter === "suspended" && !user.disabled && user.status !== "suspend") return false;
      return true;
    });
  }, [users, search, roleFilter, planFilter, statusFilter]);

  const openUserDrawer = (user) => {
    setSelectedUser(user);
    setDraftRole(user.role ?? CUSTOMER_ROLE);
    setDraftPlan(user.plan ?? USER_PLANS.FREE);
    setConfirmSuspend(false);
    setNotice(null);
    setError(null);
  };

  const closeDrawer = () => {
    setSelectedUser(null);
    setConfirmSuspend(false);
  };

  const syncUserInState = (uid, patch) => {
    setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, ...patch } : u)));
    setSelectedUser((prev) => (prev && prev.uid === uid ? { ...prev, ...patch } : prev));
  };

  const refreshUsers = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/users");
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal memuat user");
      }
      setUsers(result.data.users ?? []);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const updateRole = async (uid, role, plan) => {
    setSavingUid(uid);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-role", uid, role, plan }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Gagal memperbarui role.");
      }
      setError(null);
      setNotice("Role dan paket pengguna berhasil diperbarui.");
      syncUserInState(uid, { role, plan });
    } catch (err) {
      setError(err.message || "Gagal memperbarui role.");
    } finally {
      setSavingUid(null);
    }
  };

  const toggleStatus = async (uid, disabled) => {
    setSavingUid(uid);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-status", uid, disabled }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Gagal memperbarui status pengguna.");
      }
      setError(null);
      setConfirmSuspend(false);
      setNotice(disabled ? "Akun pengguna berhasil di-suspend." : "Akun pengguna diaktifkan kembali.");
      syncUserInState(uid, { disabled, status: disabled ? "suspend" : "active" });
    } catch (err) {
      setError(err.message || "Gagal memperbarui status pengguna.");
    } finally {
      setSavingUid(null);
    }
  };

  const createAdmin = async (event) => {
    event.preventDefault();
    setSavingUid("create");
    try {
      const response = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error ?? "Gagal menambahkan admin");
      }
      setError(null);
      setNotice(`Akun ${result.data?.email ?? ""} berhasil dibuat.`);
      setUsers((prev) => [result.data, ...prev]);
      setShowCreate(false);
      setCreateForm({ email: "", password: "", displayName: "", role: ADMIN_ROLES.ADMIN });
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingUid(null);
    }
  };

  const extendSubscription = async (uid, days = 30) => {
    setSavingUid(uid);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-subscription", uid, extendDays: days }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Gagal memperpanjang langganan.");
      }
      setError(null);
      setNotice(`Langganan diperpanjang +${days} hari.`);
      syncUserInState(uid, { isActive: true, expiresAt: json.expiresAt ?? selectedUser?.expiresAt ?? null });
    } catch (err) {
      setError(err.message || "Gagal memperpanjang langganan.");
    } finally {
      setSavingUid(null);
    }
  };

  const setSubscriptionActive = async (uid, isActive) => {
    setSavingUid(uid);
    try {
      const response = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-subscription", uid, isActive }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(json.error || "Gagal mengubah status langganan.");
      }
      setError(null);
      setNotice(isActive ? "Langganan diaktifkan." : "Langganan dinonaktifkan.");
      syncUserInState(uid, { isActive });
    } catch (err) {
      setError(err.message || "Gagal mengubah status langganan.");
    } finally {
      setSavingUid(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-slate-100">Pengaturan Pengguna</h2>
          <p className="text-sm text-slate-400">
            Kelola peran tim, paket langganan pelanggan, dan keamanan akun dalam satu tempat.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={refreshUsers}
            disabled={loading}
            className="rounded-xl border border-slate-700/80 bg-slate-900/80 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:bg-slate-800 disabled:opacity-50"
          >
            {loading ? "Memuat..." : "↻ Refresh"}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-primary-600/30 transition hover:bg-primary-500"
          >
            + Tambah Admin / Staff
          </button>
        </div>
      </div>

      {/* Ringkasan KPI Pengguna */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Total Pengguna</p>
          <p className="mt-1.5 text-2xl font-semibold text-slate-100 tabular-nums">{stats.total}</p>
          <p className="mt-1 text-xs text-slate-500">Terdaftar di platform</p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Tim Admin &amp; Editor</p>
          <p className="mt-1.5 text-2xl font-semibold text-sky-400 tabular-nums">{stats.staff}</p>
          <p className="mt-1 text-xs text-slate-500">Super-admin, admin, editor</p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Langganan / Premium</p>
          <p className="mt-1.5 text-2xl font-semibold text-emerald-400 tabular-nums">{stats.premiumActive}</p>
          <p className="mt-1 text-xs text-slate-500">Paket premium atau aktif</p>
        </div>
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">Akun Suspended</p>
          <p className="mt-1.5 text-2xl font-semibold text-rose-400 tabular-nums">{stats.suspended}</p>
          <p className="mt-1 text-xs text-slate-500">Akses dibatasi sementara</p>
        </div>
      </section>

      {error && (
        <div className="rounded-xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
          {error}
        </div>
      )}

      {/* Search & Filters */}
      <div className="grid gap-3 rounded-2xl border border-slate-800/80 bg-slate-900/75 p-4 md:grid-cols-12">
        <label className="text-xs font-medium text-slate-300 md:col-span-5">
          Cari Pengguna
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari nama, email, atau UID..."
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm text-slate-200 focus:border-primary-500 focus:outline-none"
          />
        </label>
        <label className="text-xs font-medium text-slate-300 md:col-span-2">
          Role
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">Semua Role</option>
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-300 md:col-span-2">
          Paket
          <select
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">Semua Paket</option>
            {planOptions.map((plan) => (
              <option key={plan} value={plan}>
                {plan}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-300 md:col-span-3">
          Status Akun
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-200"
          >
            <option value="all">Semua Status</option>
            <option value="active">Aktif</option>
            <option value="suspended">Suspended</option>
          </select>
        </label>
      </div>

      {/* Tabel Pengguna */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/75">
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-800/70">
            <thead className="bg-slate-950/60">
              <tr>
                <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pengguna
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Role
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Paket
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Langganan
                </th>
                <th className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Status Akun
                </th>
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map((user) => {
                const isSuspended = user.disabled || user.status === "suspend";
                return (
                  <tr
                    key={user.uid}
                    onClick={() => openUserDrawer(user)}
                    className="cursor-pointer transition hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-950 text-xs font-semibold text-slate-200">
                          {getInitials(user)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">
                            {user.displayName || user.email}
                          </p>
                          <p className="truncate text-xs text-slate-500">{user.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-0.5 font-medium ${getRoleBadgeClass(user.role)}`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <span
                        className={`inline-flex rounded-md border px-2 py-0.5 font-medium uppercase ${
                          user.plan === USER_PLANS.PREMIUM
                            ? "border-amber-500/35 bg-amber-500/10 text-amber-300"
                            : "border-slate-700 bg-slate-950/60 text-slate-400"
                        }`}
                      >
                        {user.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      <div className="space-y-0.5">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 font-medium ${
                            user.isActive
                              ? "bg-emerald-500/15 text-emerald-300"
                              : "bg-slate-800 text-slate-400"
                          }`}
                        >
                          {user.isActive ? "Aktif" : "Nonaktif"}
                        </span>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {user.expiresAt
                            ? `s/d ${new Date(user.expiresAt).toLocaleDateString("id-ID")}`
                            : "Tanpa batas"}
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {isSuspended ? (
                        <span className="inline-flex rounded-full border border-rose-500/35 bg-rose-500/10 px-2.5 py-0.5 font-semibold text-rose-300">
                          Suspended
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 font-semibold text-emerald-300">
                          Aktif
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openUserDrawer(user)}
                        className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-primary-500 hover:text-primary-200"
                      >
                        Kelola
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!filteredUsers.length && (
                <tr>
                  <td className="px-4 py-10 text-center text-sm text-slate-500" colSpan={6}>
                    Tidak ada pengguna yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="space-y-3 p-4 md:hidden">
          {filteredUsers.map((user) => {
            const isSuspended = user.disabled || user.status === "suspend";
            return (
              <div
                key={`${user.uid}-mobile`}
                className="rounded-xl border border-slate-800/80 bg-slate-950/60 p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-900 text-xs font-semibold text-slate-200">
                      {getInitials(user)}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        {user.displayName || user.email}
                      </p>
                      <p className="truncate text-xs text-slate-500">{user.email}</p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                      isSuspended
                        ? "border-rose-500/35 bg-rose-500/10 text-rose-300"
                        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                    }`}
                  >
                    {isSuspended ? "Suspended" : "Aktif"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>
                    {user.role} • {user.plan}
                  </span>
                  <button
                    type="button"
                    onClick={() => openUserDrawer(user)}
                    className="rounded-lg border border-slate-700 px-3 py-1 font-semibold text-slate-200"
                  >
                    Kelola
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Slide-over Drawer Kelola Pengguna */}
      {selectedUser && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm"
          onClick={closeDrawer}
        >
          <div
            className="h-full w-full max-w-md overflow-y-auto border-l border-slate-800 bg-slate-950 p-6 shadow-2xl space-y-6"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
              <div className="flex items-center gap-3 min-w-0">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-semibold text-white">
                  {getInitials(selectedUser)}
                </span>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-slate-100">
                    {selectedUser.displayName || selectedUser.email}
                  </h3>
                  <p className="truncate text-xs text-slate-400">{selectedUser.email}</p>
                  <p className="truncate font-mono text-[10px] text-slate-500">{selectedUser.uid}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeDrawer}
                className="rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </header>

            {notice && (
              <div className="rounded-xl border border-emerald-500/35 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-200">
                {notice}
              </div>
            )}

            {/* Akses & Paket */}
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Role &amp; Paket
              </h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs text-slate-300">
                  Role
                  <select
                    value={draftRole}
                    onChange={(e) => setDraftRole(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                  >
                    {roleOptions.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs text-slate-300">
                  Paket
                  <select
                    value={draftPlan}
                    onChange={(e) => setDraftPlan(e.target.value)}
                    className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                  >
                    {planOptions.map((plan) => (
                      <option key={plan} value={plan}>
                        {plan}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <button
                type="button"
                disabled={savingUid === selectedUser.uid}
                onClick={() => updateRole(selectedUser.uid, draftRole, draftPlan)}
                className="w-full rounded-xl bg-primary-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-primary-500 disabled:opacity-50"
              >
                {savingUid === selectedUser.uid ? "Menyimpan..." : "Simpan Role & Paket"}
              </button>
            </section>

            {/* Langganan */}
            <section className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Kelola Langganan
                </h4>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    selectedUser.isActive
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {selectedUser.isActive ? "Aktif" : "Nonaktif"}
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Masa aktif:{" "}
                <span className="font-medium text-slate-200">
                  {selectedUser.expiresAt
                    ? new Date(selectedUser.expiresAt).toLocaleString("id-ID")
                    : "Belum diatur / tanpa kadaluarsa"}
                </span>
              </p>

              <div className="grid grid-cols-3 gap-2">
                {[30, 90, 365].map((days) => (
                  <button
                    key={days}
                    type="button"
                    disabled={savingUid === selectedUser.uid}
                    onClick={() => extendSubscription(selectedUser.uid, days)}
                    className="rounded-xl border border-slate-700 bg-slate-950/70 px-2.5 py-2 text-xs font-semibold text-slate-200 transition hover:border-primary-500 hover:text-primary-200 disabled:opacity-50"
                  >
                    +{days} Hari
                  </button>
                ))}
              </div>

              <button
                type="button"
                disabled={savingUid === selectedUser.uid}
                onClick={() => setSubscriptionActive(selectedUser.uid, !selectedUser.isActive)}
                className="w-full rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
              >
                {selectedUser.isActive ? "Nonaktifkan Langganan" : "Aktifkan Langganan"}
              </button>
            </section>

            {/* Keamanan Akun */}
            <section className="rounded-2xl border border-rose-500/25 bg-rose-500/5 p-4 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-rose-300">
                Keamanan Akun
              </h4>
              {selectedUser.disabled || selectedUser.status === "suspend" ? (
                <button
                  type="button"
                  disabled={savingUid === selectedUser.uid}
                  onClick={() => toggleStatus(selectedUser.uid, false)}
                  className="w-full rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-50"
                >
                  Aktifkan Kembali Akun
                </button>
              ) : !confirmSuspend ? (
                <button
                  type="button"
                  onClick={() => setConfirmSuspend(true)}
                  className="w-full rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20"
                >
                  Suspend Akun Pengguna
                </button>
              ) : (
                <div className="space-y-2 rounded-xl border border-rose-500/40 bg-slate-950/80 p-3">
                  <p className="text-xs text-rose-200">
                    Yakin ingin me-suspend akun ini? Pengguna tidak akan bisa login.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={savingUid === selectedUser.uid}
                      onClick={() => toggleStatus(selectedUser.uid, true)}
                      className="flex-1 rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-500"
                    >
                      Ya, Suspend
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmSuspend(false)}
                      className="flex-1 rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-300"
                    >
                      Batal
                    </button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      {/* Modal Tambah Admin / Staff */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          onClick={() => setShowCreate(false)}
        >
          <form
            onSubmit={createAdmin}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md space-y-4 rounded-2xl border border-slate-800 bg-slate-950 p-6 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <h3 className="text-base font-semibold text-slate-100">Tambah Admin / Staff</h3>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            <label className="block text-xs font-medium text-slate-300">
              Nama Tampilan
              <input
                value={createForm.displayName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="Nama lengkap"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-200"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Email
              <input
                type="email"
                value={createForm.email}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
                placeholder="admin@kstream.id"
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-200"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Password (min. 6 karakter)
              <input
                type="password"
                minLength={6}
                value={createForm.password}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, password: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-200"
                required
              />
            </label>
            <label className="block text-xs font-medium text-slate-300">
              Role
              <select
                value={createForm.role}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, role: event.target.value }))}
                className="mt-1.5 w-full rounded-xl border border-slate-800 bg-slate-900 px-3.5 py-2.5 text-sm text-slate-200"
              >
                {Object.values(ADMIN_ROLES).map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingUid === "create"}
                className="rounded-xl bg-primary-600 px-5 py-2 text-xs font-semibold text-white hover:bg-primary-500 disabled:opacity-50"
              >
                {savingUid === "create" ? "Menyimpan..." : "Simpan Akun"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default UserTable;
