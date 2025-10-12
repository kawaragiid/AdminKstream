"use client";

import { useState } from "react";
import { ADMIN_ROLES, USER_PLANS, CUSTOMER_ROLE } from "@/utils/constants";

const roleOptions = [...Object.values(ADMIN_ROLES), CUSTOMER_ROLE];
const planOptions = Object.values(USER_PLANS);

const UserTable = ({ initialUsers = [] }) => {
  const [users, setUsers] = useState(initialUsers);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: "",
    password: "",
    displayName: "",
    role: ADMIN_ROLES.ADMIN,
  });

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
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-role", uid, role, plan }),
      });
      setUsers((prev) =>
        prev.map((user) =>
          user.uid === uid
            ? {
                ...user,
                role,
                plan,
              }
            : user
        )
      );
    } catch (err) {
      setError("Gagal memperbarui role.");
    }
  };

  const toggleStatus = async (uid, disabled) => {
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-status", uid, disabled }),
      });
      setUsers((prev) =>
        prev.map((user) =>
          user.uid === uid
            ? {
                ...user,
                disabled,
              }
            : user
        )
      );
    } catch (err) {
      setError("Gagal memperbarui status pengguna.");
    }
  };

  const createAdmin = async (event) => {
    event.preventDefault();
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
      setUsers((prev) => [result.data, ...prev]);
      setShowCreate(false);
      setCreateForm({ email: "", password: "", displayName: "", role: ADMIN_ROLES.ADMIN });
    } catch (err) {
      setError(err.message);
    }
  };

  const extendSubscription = async (uid, days = 30) => {
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-subscription", uid, extendDays: days }),
      });
      const result = await res.json();
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === uid
            ? { ...u, isActive: true, expiresAt: result.expiresAt ?? u.expiresAt ?? null }
            : u
        )
      );
    } catch (err) {
      setError("Gagal memperpanjang langganan.");
    }
  };

  const setSubscriptionActive = async (uid, isActive) => {
    try {
      await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-subscription", uid, isActive }),
      });
      setUsers((prev) => prev.map((u) => (u.uid === uid ? { ...u, isActive } : u)));
    } catch (err) {
      setError("Gagal mengubah status langganan.");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-100">Pengguna Platform</h2>
          <p className="text-sm text-slate-400">
            Kelola peran, paket langganan, dan status aktif pengguna.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refreshUsers}
            className="rounded-full border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-300 hover:border-primary-500 hover:text-primary-200"
            disabled={loading}
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="rounded-full bg-primary-600 px-4 py-2 text-xs font-semibold text-white hover:bg-primary-500"
          >
            Tambah Admin
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800/60">
        {/* Desktop Table View */}
        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-full divide-y divide-slate-800/60">
            <thead className="bg-slate-900/80">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Pengguna
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Role
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 lg:table-cell">
                  Paket
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Langganan
                </th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-400 lg:table-cell">
                  Status Akun
                </th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
              {users.map((user) => (
                <tr key={user.uid} className="transition hover:bg-slate-900/60">
                  <td className="px-4 py-4 text-sm text-slate-200">
                    <p className="font-medium">{user.displayName ?? user.email}</p>
                    <p className="text-xs text-slate-500">{user.email}</p>
                  </td>
                  <td className="px-4 py-4 text-sm text-slate-300">
                    <select
                      value={user.role}
                      onChange={(event) => updateRole(user.uid, event.target.value, user.plan)}
                      className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-xs"
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                                      </select>
                                    </td>
                                    <td className="hidden px-4 py-4 text-sm text-slate-300 lg:table-cell">
                                      <select
                                        value={user.plan}
                                        onChange={(event) => updateRole(user.uid, user.role, event.target.value)}
                                        className="rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-xs"
                                      >
                                        {planOptions.map((plan) => (
                                          <option key={plan} value={plan}>
                                            {plan}
                                          </option>
                                        ))}
                                      </select>
                                    </td>
                                    <td className="px-4 py-4 text-sm text-slate-300">
                                      <div className="flex flex-col gap-1">
                                        {user.isActive ? (
                                          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Aktif</span>
                                        ) : (
                                          <span className="rounded-full bg-slate-700/40 px-3 py-1 text-xs font-semibold text-slate-300">Nonaktif</span>
                                        )}
                                        <span className="text-xs text-slate-400">
                                          {user.expiresAt ? new Date(user.expiresAt).toLocaleString() : "Tidak ada kadaluarsa"}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="hidden px-4 py-4 text-sm text-slate-300 lg:table-cell">
                                      {user.disabled ? (
                                        <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-300">
                                          Suspended
                                        </span>
                                      ) : (
                                        <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                                          Active
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 text-right text-sm text-slate-300">
                                      <div className="flex items-center justify-end gap-2">
                                        <button
                                          type="button"
                                          onClick={() => extendSubscription(user.uid, 30)}
                                          className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-primary-500 hover:text-primary-200"
                                        >
                                          +30 hari
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => setSubscriptionActive(user.uid, !user.isActive)}
                                          className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-primary-500 hover:text-primary-200"
                                        >
                                          {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => toggleStatus(user.uid, !user.disabled)}
                                          className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-rose-500 hover:text-rose-200"
                                        >
                                          {user.status === "suspend" || user.disabled ? "Aktifkan Akun" : "Suspend Akun"}
                                        </button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {!users.length && !loading && (
                                  <tr>
                                    <td className="px-4 py-6 text-center text-sm text-slate-500" colSpan={4}>
                                      Tidak ada pengguna.
                                    </td>
                                  </tr>              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Card View */}
        <div className="space-y-4 p-4 md:hidden">
          {users.map((user) => (
            <div key={user.uid} className="rounded-2xl border border-slate-800/60 bg-slate-900/60 p-4">
              <div className="space-y-3">
                <div>
                  <p className="font-medium text-slate-100 truncate">{user.displayName ?? user.email}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="text-xs text-slate-400">
                    Role
                    <select
                      value={user.role}
                      onChange={(event) => updateRole(user.uid, event.target.value, user.plan)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-xs"
                    >
                      {roleOptions.map((role) => (
                        <option key={role} value={role}>{role}</option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Paket
                    <select
                      value={user.plan}
                      onChange={(event) => updateRole(user.uid, user.role, event.target.value)}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-1 text-xs"
                    >
                      {planOptions.map((plan) => (
                        <option key={plan} value={plan}>{plan}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div className="text-xs text-slate-400">
                        Langganan
                        <div className="mt-1">
                        {user.isActive ? (
                          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Aktif</span>
                        ) : (
                          <span className="rounded-full bg-slate-700/40 px-3 py-1 text-xs font-semibold text-slate-300">Nonaktif</span>
                        )}
                        </div>
                        <span className="text-xs text-slate-400">
                          {user.expiresAt ? new Date(user.expiresAt).toLocaleDateString() : "-"}
                        </span>
                    </div>
                    <div className="text-xs text-slate-400">
                        Status Akun
                        <div className="mt-1">
                        {user.disabled ? (
                          <span className="rounded-full bg-rose-500/20 px-3 py-1 text-xs font-semibold text-rose-300">Suspended</span>
                        ) : (
                          <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">Active</span>
                        )}
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-800/60 pt-4">
                  <button type="button" onClick={() => extendSubscription(user.uid, 30)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-primary-500 hover:text-primary-200">
                    +30 hari
                  </button>
                  <button type="button" onClick={() => setSubscriptionActive(user.uid, !user.isActive)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-primary-500 hover:text-primary-200">
                    {user.isActive ? "Nonaktifkan" : "Aktifkan"}
                  </button>
                  <button type="button" onClick={() => toggleStatus(user.uid, !user.disabled)} className="rounded-full border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-rose-500 hover:text-rose-200">
                    {user.status === "suspend" || user.disabled ? "Aktifkan" : "Suspend"}
                  </button>
                </div>
              </div>
            </div>
          ))}
          {!users.length && !loading && (
            <div className="px-4 py-6 text-center text-sm text-slate-500">
              Tidak ada pengguna.
            </div>
          )}
        </div>

        {(loading || error) && (
          <div className="px-4 py-6 text-center text-sm text-slate-400">
            {loading ? "Memuat data pengguna..." : error}
          </div>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={createAdmin}
          className="space-y-4 rounded-3xl border border-primary-500/20 bg-primary-500/5 p-6"
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-100">Tambah Admin / Editor</h3>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Tutup
            </button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Nama
              <input
                value={createForm.displayName}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, displayName: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                required
              />
            </label>
            <label className="text-sm text-slate-300">
              Email
              <input
                type="email"
                value={createForm.email}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, email: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                required
              />
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm text-slate-300">
              Password sementara
              <input
                type="password"
                value={createForm.password}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, password: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200"
                required
              />
            </label>
            <label className="text-sm text-slate-300">
              Role
              <select
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm((prev) => ({ ...prev, role: event.target.value }))
                }
                className="mt-2 w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-200"
              >
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-full border border-slate-700 px-4 py-2 text-xs text-slate-300 hover:border-slate-500 hover:text-white"
            >
              Batal
            </button>
            <button
              type="submit"
              className="rounded-full bg-primary-600 px-5 py-2 text-xs font-semibold text-white hover:bg-primary-500"
            >
              Simpan
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

export default UserTable;
