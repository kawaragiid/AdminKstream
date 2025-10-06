import { getAuth } from "firebase-admin/auth";
import {
  getFirebaseAdminApp,
  getFirestoreClient,
  isFirebaseConfigured,
} from "./firebase";
import {
  FIRESTORE_COLLECTIONS,
  ADMIN_ROLES,
  USER_PLANS,
} from "@/utils/constants";

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
    isActive: typeof doc.isActive === 'boolean' ? doc.isActive : null,
    expiresAt:
      typeof doc.expiresAt === 'string'
        ? doc.expiresAt
        : (typeof doc.expiresAt?.toDate === 'function'
            ? doc.expiresAt.toDate().toISOString()
            : null),
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
    creationTime: typeof meta.creationTime === 'string' ? meta.creationTime : null,
    lastSignInTime: typeof meta.lastSignInTime === 'string' ? meta.lastSignInTime : null,
    lastRefreshTime: typeof meta.lastRefreshTime === 'string' ? meta.lastRefreshTime : null,
  };
  const nowIso = new Date().toISOString();
  const effectiveExpiresAt = profile.expiresAt ?? null;
  const derivedActive = effectiveExpiresAt ? (effectiveExpiresAt > nowIso) : (profile.isActive ?? null);
  return {
    uid: userRecord.uid,
    email: userRecord.email ?? profile.email ?? null,
    displayName:
      profile.displayName ??
      userRecord.displayName ??
      userRecord.email ??
      "User",
    photoURL: profile.photoURL ?? userRecord.photoURL ?? null,
    role: profile.role ?? claims.role ?? ADMIN_ROLES.EDITOR,
    plan: profile.plan ?? claims.plan ?? USER_PLANS.FREE,
    isActive: typeof profile.isActive === 'boolean' ? profile.isActive : (derivedActive ?? false),
    expiresAt: effectiveExpiresAt,
    status: profile.status ?? (userRecord.disabled ? "suspend" : "active"),
    disabled: userRecord.disabled,
    metadata: safeMetadata,
  };
}

async function fetchUserDoc(firestore, uid) {
  if (!firestore) return null;
  const snapshot = await firestore
    .collection(FIRESTORE_COLLECTIONS.ADMIN_USERS)
    .doc(uid)
    .get();
  return snapshot.exists ? normalizeProfile(snapshot.data()) : null;
}

export async function listUsers({ limit = 50, pageToken } = {}) {
  if (!isFirebaseConfigured) {
    return {
      users: FALLBACK_USERS.slice(0, limit),
      nextPageToken: null,
    };
  }

  const auth = getAdminAuth();
  const firestore = getFirestoreClient();
  const result = await auth.listUsers(limit, pageToken);

  const profiles = firestore
    ? await Promise.all(result.users.map((user) => fetchUserDoc(firestore, user.uid)))
    : result.users.map(() => null);

  const users = result.users.map((user, index) =>
    mapUserRecord(user, profiles[index] ?? {})
  );

  return {
    users,
    nextPageToken: result.pageToken ?? null,
  };
}

export async function updateUserRole(uid, { role, plan }) {
  if (!uid) {
    throw new Error("UID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    const index = FALLBACK_USERS.findIndex((user) => user.uid === uid);
    if (index !== -1) {
      if (role) FALLBACK_USERS[index].role = role;
      if (plan) FALLBACK_USERS[index].plan = plan;
    }
    return { success: true };
  }

  const auth = getAdminAuth();
  const userRecord = await auth.getUser(uid);
  const claims = { ...(userRecord.customClaims ?? {}) };

  if (role) claims.role = role;
  if (plan) claims.plan = plan;

  await auth.setCustomUserClaims(uid, claims);

  const firestore = getFirestoreClient();
  if (firestore) {
    await firestore
      .collection(FIRESTORE_COLLECTIONS.ADMIN_USERS)
      .doc(uid)
      .set(
        {
          role: role ?? claims.role ?? ADMIN_ROLES.EDITOR,
          plan: plan ?? claims.plan ?? USER_PLANS.FREE,
          email: userRecord.email ?? null,
          displayName: userRecord.displayName ?? null,
          // keep subscription fields as-is (merge)
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }

  return { success: true };
}

export async function updateUserStatus(uid, { disabled }) {
  if (!uid) {
    throw new Error("UID wajib diisi.");
  }

  if (!isFirebaseConfigured) {
    const index = FALLBACK_USERS.findIndex((user) => user.uid === uid);
    if (index !== -1) {
      FALLBACK_USERS[index].disabled = disabled;
      FALLBACK_USERS[index].status = disabled ? "suspend" : "active";
    }
    return { success: true };
  }

  const auth = getAdminAuth();
  await auth.updateUser(uid, { disabled });

  const firestore = getFirestoreClient();
  if (firestore) {
    await firestore
      .collection(FIRESTORE_COLLECTIONS.ADMIN_USERS)
      .doc(uid)
      .set(
        {
          status: disabled ? "suspend" : "active",
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  }

  return { success: true };
}

export async function createAdminUser({
  email,
  password,
  displayName,
  role = ADMIN_ROLES.ADMIN,
  plan = USER_PLANS.PREMIUM,
}) {
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
  await auth.setCustomUserClaims(userRecord.uid, { role, plan });

  const firestore = getFirestoreClient();
  if (firestore) {
    await firestore
      .collection(FIRESTORE_COLLECTIONS.ADMIN_USERS)
      .doc(userRecord.uid)
      .set({
        role,
        plan,
        displayName,
        email,
        isActive: false,
        expiresAt: null,
        status: "active",
        createdAt: new Date().toISOString(),
      });
  }

  return mapUserRecord({ ...userRecord, customClaims: { role, plan } }, { role, plan });
}

export async function updateUserSubscription(uid, { plan, isActive, expiresAt, extendDays }) {
  if (!uid) throw new Error("UID wajib diisi.");

  const now = new Date();
  let newExpiresAt = null;
  if (typeof extendDays === 'number' && extendDays > 0) {
    // base on existing expiry if in the future, else now
    let base = now;
    if (isFirebaseConfigured) {
      const firestore = getFirestoreClient();
      const snap = await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(uid).get();
      const curr = snap.exists ? snap.data() : null;
      const currExp = curr?.expiresAt
        ? (typeof curr.expiresAt?.toDate === 'function' ? curr.expiresAt.toDate() : new Date(curr.expiresAt))
        : null;
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
    newExpiresAt = new Date(expiresAt).toISOString();
  }

  const patch = {
    ...(plan ? { plan } : {}),
    ...(typeof isActive === 'boolean' ? { isActive } : {}),
    // For Firestore, use Timestamp by passing Date; fallback uses ISO string
    ...(newExpiresAt
      ? (isFirebaseConfigured ? { expiresAt: new Date(newExpiresAt) } : { expiresAt: newExpiresAt })
      : {}),
    updatedAt: now.toISOString(),
  };

  if (!isFirebaseConfigured) {
    const idx = FALLBACK_USERS.findIndex((u) => u.uid === uid);
    if (idx !== -1) {
      FALLBACK_USERS[idx] = { ...FALLBACK_USERS[idx], ...patch };
    }
    return { success: true, expiresAt: newExpiresAt ?? null };
  }

  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.ADMIN_USERS).doc(uid).set(patch, { merge: true });
  return { success: true, expiresAt: newExpiresAt ?? null };
}
