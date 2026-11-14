import { getAuth } from "firebase-admin/auth";
import { getFirebaseAdminApp, isFirebaseConfigured } from "./firebase";
import { ensureNeonSchema, getSql, isNeonConfigured, withTransaction } from "./neonDb";
import { ADMIN_ROLES, USER_PLANS, CUSTOMER_ROLE } from "@/utils/constants";
import { invalidateAnalyticsCache } from "./analyticsService";

const MAX_EXTEND_DAYS = 3650;

const FALLBACK_USERS =
  process.env.NODE_ENV === "production"
    ? []
    : [
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

function assertDemoFallbackAllowed() {
  if (process.env.NODE_ENV === "production") {
    const err = new Error("Firebase Admin atau Neon belum dikonfigurasi di environment production.");
    err.statusCode = 503;
    throw err;
  }
}

function getAdminAuth() {
  const app = getFirebaseAdminApp();
  if (!app) {
    return null;
  }
  return getAuth(app);
}

function assertCanManageTarget({ actorRole, targetRole, nextRole } = {}) {
  if (!actorRole) {
    const err = new Error("Role aktor wajib diisi.");
    err.statusCode = 403;
    throw err;
  }
  if (actorRole === ADMIN_ROLES.SUPER_ADMIN) return;
  if (targetRole === ADMIN_ROLES.SUPER_ADMIN || targetRole === ADMIN_ROLES.ADMIN) {
    const err = new Error("Hanya super-admin yang dapat mengelola akun admin atau super-admin.");
    err.statusCode = 403;
    throw err;
  }
  if (nextRole && (nextRole === ADMIN_ROLES.SUPER_ADMIN || nextRole === ADMIN_ROLES.ADMIN)) {
    const err = new Error("Hanya super-admin yang dapat menetapkan role admin atau super-admin.");
    err.statusCode = 403;
    throw err;
  }
}

function normalizeProfile(doc) {
  if (!doc) return {};
  return {
    role: doc.role ?? null,
    plan: doc.plan ?? null,
    isActive: typeof doc.isActive === "boolean" ? doc.isActive : null,
    expiresAt:
      typeof doc.expiresAt === "string"
        ? doc.expiresAt
        : typeof doc.expiresAt?.toDate === "function"
        ? doc.expiresAt.toDate().toISOString()
        : null,
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
  const isSuspended = Boolean(userRecord.disabled) || profile.status === "suspend";
  const effectiveExpiresAt = profile.expiresAt ?? null;
  const notExpired = effectiveExpiresAt ? new Date(effectiveExpiresAt).getTime() > Date.now() : null;
  const resolvedActive =
    isSuspended || profile.isActive === false
      ? false
      : notExpired !== null
      ? notExpired
      : profile.isActive !== null && profile.isActive !== undefined
      ? Boolean(profile.isActive)
      : true;

  return {
    uid: userRecord.uid,
    email: userRecord.email ?? profile.email ?? null,
    displayName: profile.displayName ?? userRecord.displayName ?? userRecord.email ?? "User",
    photoURL: profile.photoUrl ?? profile.photoURL ?? userRecord.photoURL ?? null,
    role: profile.role ?? claims.role ?? CUSTOMER_ROLE,
    plan: profile.plan ?? claims.plan ?? USER_PLANS.FREE,
    isActive: resolvedActive,
    expiresAt: effectiveExpiresAt,
    status: profile.status ?? (userRecord.disabled ? "suspend" : "active"),
    disabled: userRecord.disabled,
    metadata: safeMetadata,
  };
}

function resolveRowIsActive(row) {
  if (row.is_active === false) return false;
  if (typeof row.data?.isActive === "boolean") return row.data.isActive;
  return true;
}

async function fetchUserDoc(_unused, uid) {
  if (!isNeonConfigured()) return null;
  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT uid, email, display_name, role, plan, is_active, expires_at, data
    FROM users WHERE uid = ${uid} LIMIT 1
  `;
  if (!rows.length) return null;
  const row = rows[0];
  return normalizeProfile({
    ...(row.data || {}),
    email: row.email || row.data?.email,
    displayName: row.display_name || row.data?.displayName,
    role: row.role || row.data?.role,
    plan: row.plan || row.data?.plan,
    isActive: resolveRowIsActive(row),
    expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.data?.expiresAt || null,
  });
}

async function upsertNeonUser(uid, patch) {
  if (!isNeonConfigured()) return;
  await ensureNeonSchema();
  await withTransaction(async (tx) => {
    const existing = await tx`
      SELECT email, display_name, role, plan, is_active, expires_at, data
      FROM users WHERE uid = ${uid} FOR UPDATE
    `;
    const prev = existing[0] || {};
    const mergedData = { ...(prev.data || {}), ...patch, updatedAt: new Date().toISOString() };
    await tx`
      INSERT INTO users (uid, email, display_name, role, plan, is_active, expires_at, data, updated_at)
      VALUES (
        ${uid},
        ${patch.email ?? prev.email ?? ""},
        ${patch.displayName ?? prev.display_name ?? ""},
        ${patch.role ?? prev.role ?? CUSTOMER_ROLE},
        ${patch.plan ?? prev.plan ?? USER_PLANS.FREE},
        ${patch.isActive !== undefined ? Boolean(patch.isActive) : prev.is_active !== false},
        ${patch.expiresAt !== undefined ? patch.expiresAt : prev.expires_at ?? null},
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
  });
}

async function fetchUserDocsByUids(uids = []) {
  if (!isNeonConfigured() || !uids.length) return new Map();
  await ensureNeonSchema();
  const sql = getSql();
  const rows = await sql`
    SELECT uid, email, display_name, role, plan, is_active, expires_at, data
    FROM users WHERE uid = ANY(${uids})
  `;
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
        isActive: resolveRowIsActive(row),
        expiresAt: row.expires_at ? new Date(row.expires_at).toISOString() : row.data?.expiresAt || null,
      })
    );
  }
  return map;
}

export async function listUsers({ limit = 50, pageToken } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.min(Math.max(Number.parseInt(limit, 10), 1), 1000) : 50;
  if (!isFirebaseConfigured) {
    assertDemoFallbackAllowed();
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
    assertDemoFallbackAllowed();
    const index = FALLBACK_USERS.findIndex((user) => user.uid === uid);
    if (index === -1) {
      const err = new Error("Pengguna tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }
    assertCanManageTarget({ actorRole, targetRole: FALLBACK_USERS[index].role, nextRole: role });
    if (role) FALLBACK_USERS[index].role = role;
    if (plan) FALLBACK_USERS[index].plan = plan;
    return { success: true };
  }

  const auth = getAdminAuth();
  const [userRecord, existingProfile] = await Promise.all([
    auth.getUser(uid),
    fetchUserDoc(null, uid),
  ]);
  const prevClaims = { ...(userRecord.customClaims ?? {}) };
  const targetRole = existingProfile?.role ?? prevClaims.role ?? CUSTOMER_ROLE;

  assertCanManageTarget({ actorRole, targetRole, nextRole: role });

  const nextClaims = { ...prevClaims };
  if (role) nextClaims.role = role;
  if (plan) nextClaims.plan = plan;

  await auth.setCustomUserClaims(uid, nextClaims);

  try {
    const resolvedEmail = userRecord.email ?? existingProfile?.email;
    await upsertNeonUser(uid, {
      role: role ?? nextClaims.role ?? existingProfile?.role ?? CUSTOMER_ROLE,
      plan: plan ?? nextClaims.plan ?? existingProfile?.plan ?? USER_PLANS.FREE,
      ...(resolvedEmail ? { email: resolvedEmail } : {}),
      ...(userRecord.displayName ? { displayName: userRecord.displayName } : {}),
    });
    await auth.revokeRefreshTokens(uid);
  } catch (error) {
    await auth.setCustomUserClaims(uid, prevClaims).catch(() => {});
    throw error;
  }

  invalidateAnalyticsCache();
  return { success: true };
}

function isPremiumSubscriptionExpired(plan, expiresAt) {
  if (plan !== USER_PLANS.PREMIUM || !expiresAt) return false;
  const ms = new Date(expiresAt).getTime();
  return Number.isFinite(ms) && ms <= Date.now();
}

export async function updateUserStatus(uid, { disabled, actorRole }) {
  if (!uid) {
    throw new Error("UID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    assertDemoFallbackAllowed();
    const index = FALLBACK_USERS.findIndex((user) => user.uid === uid);
    if (index === -1) {
      const err = new Error("Pengguna tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }
    assertCanManageTarget({ actorRole, targetRole: FALLBACK_USERS[index].role });
    const expired = isPremiumSubscriptionExpired(FALLBACK_USERS[index].plan, FALLBACK_USERS[index].expiresAt);
    FALLBACK_USERS[index].disabled = disabled;
    FALLBACK_USERS[index].status = disabled ? "suspend" : "active";
    FALLBACK_USERS[index].isActive = disabled ? false : !expired;
    return { success: true };
  }

  const auth = getAdminAuth();
  const [userRecord, existingProfile] = await Promise.all([
    auth.getUser(uid),
    fetchUserDoc(null, uid),
  ]);
  const targetRole = existingProfile?.role ?? userRecord.customClaims?.role ?? CUSTOMER_ROLE;
  assertCanManageTarget({ actorRole, targetRole });

  const prevDisabled = Boolean(userRecord.disabled);
  await auth.updateUser(uid, { disabled });

  try {
    if (disabled) {
      await auth.revokeRefreshTokens(uid);
    }

    const effectivePlan = existingProfile?.plan ?? userRecord.customClaims?.plan ?? USER_PLANS.FREE;
    const expired = isPremiumSubscriptionExpired(effectivePlan, existingProfile?.expiresAt);
    await upsertNeonUser(uid, {
      status: disabled ? "suspend" : "active",
      isActive: disabled ? false : !expired,
      email: existingProfile?.email ?? userRecord.email ?? "",
      displayName: existingProfile?.displayName ?? userRecord.displayName ?? "",
      role: targetRole,
      plan: effectivePlan,
    });
  } catch (error) {
    await auth.updateUser(uid, { disabled: prevDisabled }).catch(() => {});
    throw error;
  }

  return { success: true };
}

export async function createAdminUser({
  email,
  password,
  displayName,
  role = ADMIN_ROLES.ADMIN,
  plan = USER_PLANS.PREMIUM,
  actorRole,
}) {
  assertCanManageTarget({ actorRole, nextRole: role });

  if (!isFirebaseConfigured) {
    assertDemoFallbackAllowed();
    const mock = {
      uid: `mock-${Date.now()}`,
      email,
      displayName,
      role,
      plan,
      isActive: true,
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
      isActive: true,
      expiresAt: null,
      status: "active",
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    await auth.deleteUser(userRecord.uid).catch(() => {});
    throw error;
  }

  return mapUserRecord(
    { ...userRecord, customClaims: { role, plan } },
    { role, plan, isActive: true }
  );
}

export async function updateUserSubscription(
  uid,
  { plan, isActive, expiresAt, extendDays, actorRole } = {}
) {
  if (!uid) throw new Error("UID wajib diisi.");

  let userRecord = null;
  let existingProfile = null;
  if (isFirebaseConfigured) {
    const auth = getAdminAuth();
    const [fetchedUser, fetchedProfile] = await Promise.all([
      auth.getUser(uid),
      isNeonConfigured() ? fetchUserDoc(null, uid) : Promise.resolve(null),
    ]);
    userRecord = fetchedUser;
    existingProfile = fetchedProfile;
  } else if (isNeonConfigured()) {
    existingProfile = await fetchUserDoc(null, uid);
    if (!existingProfile) {
      const err = new Error("Pengguna tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }
  } else {
    assertDemoFallbackAllowed();
    existingProfile = FALLBACK_USERS.find((u) => u.uid === uid) ?? null;
    if (!existingProfile) {
      const err = new Error("Pengguna tidak ditemukan.");
      err.statusCode = 404;
      throw err;
    }
  }

  const targetRole = existingProfile?.role ?? userRecord?.customClaims?.role ?? CUSTOMER_ROLE;
  assertCanManageTarget({ actorRole, targetRole });

  const now = new Date();
  let hasExpiresUpdate = false;
  let newExpiresAt = null;
  if (extendDays !== undefined) {
    if (typeof extendDays !== "number" || !Number.isFinite(extendDays) || extendDays < 1 || extendDays > MAX_EXTEND_DAYS) {
      const err = new Error(`extendDays harus berupa angka antara 1 hingga ${MAX_EXTEND_DAYS} hari.`);
      err.statusCode = 400;
      throw err;
    }
    let base = now;
    const currExpIso = existingProfile?.expiresAt ?? null;
    const currExp = currExpIso ? new Date(currExpIso) : null;
    if (currExp && currExp.getTime() > now.getTime()) base = currExp;
    const next = new Date(base.getTime() + extendDays * 24 * 60 * 60 * 1000);
    newExpiresAt = next.toISOString();
    hasExpiresUpdate = true;
  } else if (expiresAt !== undefined) {
    if (expiresAt === null) {
      newExpiresAt = null;
      hasExpiresUpdate = true;
    } else {
      const parsedDate = new Date(expiresAt);
      if (Number.isNaN(parsedDate.getTime())) {
        const err = new Error("Format tanggal expiresAt tidak valid.");
        err.statusCode = 400;
        throw err;
      }
      newExpiresAt = parsedDate.toISOString();
      hasExpiresUpdate = true;
    }
  }

  const patch = {
    ...(plan ? { plan } : {}),
    ...(typeof isActive === "boolean" ? { isActive } : {}),
    ...(hasExpiresUpdate ? { expiresAt: newExpiresAt } : {}),
    updatedAt: now.toISOString(),
  };

  if (!isNeonConfigured()) {
    const idx = FALLBACK_USERS.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      FALLBACK_USERS[idx] = { ...FALLBACK_USERS[idx], ...patch };
    }
    return { success: true, expiresAt: newExpiresAt ?? null };
  }

  const prevClaims = userRecord ? { ...(userRecord.customClaims ?? {}) } : null;
  if (plan && isFirebaseConfigured && userRecord) {
    const auth = getAdminAuth();
    if (auth) {
      await auth.setCustomUserClaims(uid, { ...prevClaims, plan });
    }
  }

  try {
    const neonSeed =
      !existingProfile && userRecord
        ? {
            email: userRecord.email ?? "",
            displayName: userRecord.displayName ?? "",
            role: userRecord.customClaims?.role ?? CUSTOMER_ROLE,
          }
        : {};
    await upsertNeonUser(uid, { ...neonSeed, ...patch });
  } catch (error) {
    if (plan && isFirebaseConfigured && userRecord && prevClaims) {
      const auth = getAdminAuth();
      if (auth) {
        await auth.setCustomUserClaims(uid, prevClaims).catch(() => {});
      }
    }
    throw error;
  }

  invalidateAnalyticsCache();
  return { success: true, expiresAt: newExpiresAt ?? null };
}
