import { getFirestoreClient, isFirebaseConfigured } from "./firebase";
import { FIRESTORE_COLLECTIONS } from "@/utils/constants";

const FALLBACK_LOGS = [];

export async function recordAuditLog({
  actor,
  action,
  targetId,
  targetType,
  metadata,
}) {
  const logEntry = {
    action,
    targetId: targetId ?? null,
    targetType: targetType ?? null,
    metadata: metadata ?? null,
    actor: actor
      ? {
          uid: actor.uid,
          email: actor.email ?? null,
          displayName: actor.displayName ?? null,
        }
      : null,
    createdAt: new Date().toISOString(),
  };

  if (!isFirebaseConfigured) {
    FALLBACK_LOGS.unshift(logEntry);
    return logEntry;
  }

  const firestore = getFirestoreClient();
  await firestore.collection(FIRESTORE_COLLECTIONS.AUDIT_LOGS).add(logEntry);
  return logEntry;
}

export async function listAuditLogs({ limit = 50 } = {}) {
  if (!isFirebaseConfigured) {
    return FALLBACK_LOGS.slice(0, limit);
  }

  const firestore = getFirestoreClient();
  const snapshot = await firestore
    .collection(FIRESTORE_COLLECTIONS.AUDIT_LOGS)
    .orderBy("createdAt", "desc")
    .limit(limit)
    .get();

  return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
}
