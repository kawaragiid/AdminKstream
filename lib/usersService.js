import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, isFirebaseConfigured } from "./firebase";
import { ensureNeonSchema, getSql, isNeonConfigured } from "./neonDb";
import { ADMIN_ROLES, USER_PLANS, CUSTOMER_ROLE } from "@/utils/constants";

const FALLBACK_USERS = [
  {
    uid: "demo-admin",
    email: "admin@kstream.id",
    displayName: "Demo Admin",
    role: ADMIN_ROLES.ADMIN,
    plan: USER_PLANS.PREMIUM,
    isActive: true,
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 15).toISOString(),
    status: "active",
    disabled: false,
    metadata: {
      creationTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 20).toISOString(),
      lastSignInTime: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    },
  },
  {
    uid: "demo-editor",
    email: "editor@kstream.id",
    displayName: "Demo Editor",
    role: ADMIN_ROLES.EDITOR,
    plan: USER_PLANS.FREE,
    isActive: false,
    expiresAt: null,
    status: "active",
    disabled: false,
    metadata: {
      creationTime: new Date(Date.now() - 1000 * 60 * 60 * 24 * 45).toISOString(),
      lastSignInTime: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString(),
    },
  },
];

function getAdminAuth() {
  const app = getFirebaseAdminApp();
  if (!app) {
    return null;
  }
  return getAuth(app);
}

function normalizeProfile(doc) {
  if (!doc) return {};
  return {
    role: doc.role ?? null,
    plan: doc.plan ?? null,
    isActive: typeof doc.isActive === "boolean" ? doc.isActive : null,
    expiresAt: typeof doc.expiresAt === "string" ? doc.expiresAt : typeof doc.expiresAt?.toDate === "function" ? doc.expiresAt.toDate().toISOString() : null,
    status: doc.status ?? null,
    displayName: doc.displayName ?? null,
    email: doc.email ?? null,
    photoURL: doc.photoUrl ?? doc.photoURL ?? null,
  };
}

function mapUserRecord(userRecord, profile = {}) {
  const claims = userRecord.customClaims ?? {};
  const meta = userRecord.metadata || {};
  const safeMetadata = {
    creationTime: typeof meta.creationTime === "string" ? meta.creationTime : null,
    lastSignInTime: typeof meta.lastSignInTime === "string" ? meta.lastSignInTime : null,
    lastRefreshTime: typeof meta.lastRefreshTime === "string" ? meta.lastRefreshTime : null,
  };
  const effectiveExpiresAt = profile.expiresAt ?? null;
  const notExpired = effectiveExpiresAt ? new Date(effectiveExpiresAt).getTime() > Date.now() : null;
  const resolvedActive =
    profile.isActive === false
      ? false
      : notExpired !== null
        ? notExpired
        : Boolean(profile.isActive);
  return {
    uid: userRecord.uid,
    email: userRecord.email ?? profile.email ?? null,
    displayName: profile.displayName ?? userRecord.displayName ?? userRecord.email ?? "User",
    photoURL: profile.photoURL ?? userRecord.photoURL ?? null,
    role: claims.role ?? profile.role ?? CUSTOMER_ROLE,
    plan: profile.plan ?? claims.plan ?? USER_PLANS.FREE,
    isActive: resolvedActive,
    expiresAt: effectiveExpiresAt,
    status: profile.status ?? (userRecord.disabled ? "suspend" : "active"),
    disabled: userRecord.disabled,
    metadata: safeMetadata,
  };
}

async function fetchUserDoc(_unused, uid) {
  if (!isNeonConfigured()) return null;
  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT uid, email, display_name, role, plan, is_active, expires_at, data FROM users WHERE uid = ${uid} LIMIT 1`;
  if (!rows.length) return null;
  const row = rows[0];
  return normalizeProfile({
    ...(row.data || {}),
    email: row.email || row.data?.email,
    displayName: row.display_name || row.data?.displayName,
    role: row.role || row.data?.role,
    plan: row.plan || row.data?.plan,
    isActive: row.is_active !== false,
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.data?.expiresAt || null,
  });
}

async function upsertNeonUser(uid, patch) {
  if (!isNeonConfigured()) return;
  await ensureNeonSchema();
  const sql = getSql();
  const existing = await sql`SELECT email, display_name, role, plan, is_active, expires_at, data FROM users WHERE uid = ${uid} LIMIT 1`;
  const prev = existing[0] || {};
  const mergedData = { ...(prev.data || {}), ...patch, updatedAt: new Date().toISOString() };
  await sql`
    INSERT INTO users (uid, email, display_name, role, plan, is_active, expires_at, data, updated_at)
    VALUES (
      ${uid},
      ${patch.email ?? prev.email ?? ""},
      ${patch.displayName ?? prev.display_name ?? ""},
      ${patch.role ?? prev.role ?? CUSTOMER_ROLE},
      ${patch.plan ?? prev.plan ?? USER_PLANS.FREE},
      ${patch.isActive !== undefined ? Boolean(patch.isActive) : (prev.is_active !== false)},
      ${patch.expiresAt ?? prev.expires_at ?? null},
      ${JSON.stringify(mergedData)}::jsonb,
      NOW()
    )
    ON CONFLICT (uid) DO UPDATE SET
      email = EXCLUDED.email,
      display_name = EXCLUDED.display_name,
      role = EXCLUDED.role,
      plan = EXCLUDED.plan,
      is_active = EXCLUDED.is_active,
      expires_at = EXCLUDED.expires_at,
      data = EXCLUDED.data,
      updated_at = NOW()
  `;
}

async function fetchUserDocsByUids(uids = []) {
  if (!isNeonConfigured() || !uids.length) return new Map();
  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`SELECT uid, email, display_name, role, plan, is_active, expires_at, data FROM users WHERE uid = ANY(${uids})`;
  const map = new Map();
  for (const row of rows) {
    map.set(
      row.uid,
      normalizeProfile({
        ...(row.data || {}),
        email: row.email || row.data?.email,
        displayName: row.display_name || row.data?.displayName,
        role: row.role || row.data?.role,
        plan: row.plan || row.data?.plan,
        isActive: row.is_active !== false,
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.data?.expiresAt || null,
      })
    );
  }
  return map;
}

export async function listUsers({ limit = 50, pageToken } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number.parseInt(limit, 10), 1), 1000) : 50;
  if (!isFirebaseConfigured) {
    return {
      users: FALLBACK_USERS.slice(0, safeLimit),
      nextPageToken: null,
    };
  }

  const auth = getAdminAuth();
  const result = await auth.listUsers(safeLimit, pageToken);

  const uids = result.users.map((user) => user.uid);
  const profileMap = isNeonConfigured() ? await fetchUserDocsByUids(uids) : new Map();

  const users = result.users.map((user) => mapUserRecord(user, profileMap.get(user.uid) ?? {}));

  return {
    users,
    nextPageToken: result.pageToken ?? null,
  };
}

export async function updateUserRole(uid, { role, plan, actorRole } = {}) {
  if (!uid) {
    throw new Error("UID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    const index = FALLBACK_USERS.findIndex((user) => user.uid === uid);
    if (index !== -1) {
      if (FALLBACK_USERS[index].role === ADMIN_ROLES.SUPER_ADMIN && actorRole && actorRole !== ADMIN_ROLES.SUPER_ADMIN) {
        const err = new Error("Hanya super-admin yang dapat mengubah role super-admin.");
        err.statusCode = 403;
        throw err;
      }
      if (role) FALLBACK_USERS[index].role = role;
      if (plan) FALLBACK_USERS[index].plan = plan;
    }
    return { success: true };
  }

  const auth = getAdminAuth();
  const [userRecord, existingProfile] = await Promise.all([
    auth.getUser(uid),
    fetchUserDoc(null, uid),
  ]);
  const claims = { ...(userRecord.customClaims ?? {}) };

  const isTargetSuperAdmin =
    claims.role === ADMIN_ROLES.SUPER_ADMIN || existingProfile?.role === ADMIN_ROLES.SUPER_ADMIN;
  if (isTargetSuperAdmin && actorRole && actorRole !== ADMIN_ROLES.SUPER_ADMIN) {
    const err = new Error("Hanya super-admin yang dapat mengubah role super-admin.");
    err.statusCode = 403;
    throw err;
  }

  if (role) claims.role = role;
  if (plan) claims.plan = plan;

  await auth.setCustomUserClaims(uid, claims);

  await upsertNeonUser(uid, {
    role: role ?? claims.role ?? existingProfile?.role ?? CUSTOMER_ROLE,
    plan: plan ?? claims.plan ?? existingProfile?.plan ?? USER_PLANS.FREE,
    email: userRecord.email ?? existingProfile?.email ?? null,
    ...(userRecord.displayName ? { displayName: userRecord.displayName } : {}),
  });

  return { success: true };
}

export async function updateUserStatus(uid, { disabled, actorRole }) {
  if (!uid) {
    throw new Error("UID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    const index = FALLBACK_USERS.findIndex((user) => user.uid === uid);
    if (index !== -1) {
      if (FALLBACK_USERS[index].role === ADMIN_ROLES.SUPER_ADMIN && actorRole && actorRole !== ADMIN_ROLES.SUPER_ADMIN) {
        const err = new Error("Hanya super-admin yang dapat mengubah status super-admin.");
        err.statusCode = 403;
        throw err;
      }
      FALLBACK_USERS[index].disabled = disabled;
      FALLBACK_USERS[index].status = disabled ? "suspend" : "active";
    }
    return { success: true };
  }

  const auth = getAdminAuth();
  const [userRecord, existingProfile] = await Promise.all([
    auth.getUser(uid),
    fetchUserDoc(null, uid),
  ]);
  const isTargetSuperAdmin =
    userRecord.customClaims?.role === ADMIN_ROLES.SUPER_ADMIN ||
    existingProfile?.role === ADMIN_ROLES.SUPER_ADMIN;
  if (isTargetSuperAdmin && actorRole && actorRole !== ADMIN_ROLES.SUPER_ADMIN) {
    const err = new Error("Hanya super-admin yang dapat mengubah status super-admin.");
    err.statusCode = 403;
    throw err;
  }
  await auth.updateUser(uid, { disabled });

  await upsertNeonUser(uid, {
    status: disabled ? "suspend" : "active",
    email: existingProfile?.email ?? userRecord.email ?? "",
    displayName: existingProfile?.displayName ?? userRecord.displayName ?? "",
    role: existingProfile?.role ?? userRecord.customClaims?.role ?? CUSTOMER_ROLE,
    plan: existingProfile?.plan ?? userRecord.customClaims?.plan ?? USER_PLANS.FREE,
  });

  return { success: true };
}

export async function createAdminUser({ email, password, displayName, role = ADMIN_ROLES.ADMIN, plan = USER_PLANS.PREMIUM }) {
  if (!isFirebaseConfigured) {
    const mock = {
      uid: `mock-${Date.now()}`,
      email,
      displayName,
      role,
      plan,
      isActive: false,
      expiresAt: null,
      status: "active",
      disabled: false,
      metadata: {
        creationTime: new Date().toISOString(),
        lastSignInTime: null,
      },
    };
    FALLBACK_USERS.push(mock);
    return mock;
  }

  const auth = getAdminAuth();
  const userRecord = await auth.createUser({
    email,
    password,
    displayName,
    disabled: false,
  });
  try {
    await auth.setCustomUserClaims(userRecord.uid, { role, plan });

    await upsertNeonUser(userRecord.uid, {
      role,
      plan,
      displayName,
      email,
      isActive: false,
      expiresAt: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    await auth.deleteUser(userRecord.uid).catch(() => {});
    throw error;
  }

  return mapUserRecord({ ...userRecord, customClaims: { role, plan } }, { role, plan });
}

export async function updateUserSubscription(uid, { plan, isActive, expiresAt, extendDays }) {
  if (!uid) throw new Error("UID wajib diisi.");

  const now = new Date();
  let newExpiresAt = null;
  if (typeof extendDays === "number" && extendDays > 0) {
    // base on existing expiry if in the future, else now
    let base = now;
    if (isNeonConfigured()) {
      const curr = await fetchUserDoc(null, uid);
      const currExp = curr?.expiresAt ? new Date(curr.expiresAt) : null;
      if (currExp && currExp.getTime() > now.getTime()) base = currExp;
    } else {
      const idx = FALLBACK_USERS.findIndex((u) => u.uid === uid);
      const currExpIso = idx !== -1 ? FALLBACK_USERS[idx].expiresAt : null;
      const currExp = currExpIso ? new Date(currExpIso) : null;
      if (currExp && currExp.getTime() > now.getTime()) base = currExp;
    }
    const next = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);
    newExpiresAt = next.toISOString();
  } else if (expiresAt) {
    const parsedDate = new Date(expiresAt);
    if (Number.isNaN(parsedDate.getTime())) {
      throw new Error("Format tanggal expiresAt tidak valid.");
    }
    newExpiresAt = parsedDate.toISOString();
  }

  const patch = {
    ...(plan ? { plan } : {}),
    ...(typeof isActive === "boolean" ? { isActive } : {}),
    ...(newExpiresAt ? { expiresAt: newExpiresAt } : {}),
    updatedAt: now.toISOString(),
  };

  if (!isNeonConfigured()) {
    const idx = FALLBACK_USERS.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      FALLBACK_USERS[idx] = { ...FALLBACK_USERS[idx], ...patch };
    }
    return { success: true, expiresAt: newExpiresAt ?? null };
  }

  await upsertNeonUser(uid, patch);

  if (plan && isFirebaseConfigured) {
    const auth = getAdminAuth();
    if (auth) {
      const userRecord = await auth.getUser(uid);
      const claims = { ...(userRecord.customClaims ?? {}), plan };
      await auth.setCustomUserClaims(uid, claims);
    }
  }

  return { success: true, expiresAt: newExpiresAt ?? null };
}
