import { NextResponse } from "next/server";
import { listUsers, updateUserRole, updateUserStatus, createAdminUser, updateUserSubscription } from "@/lib/usersService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES, CUSTOMER_ROLE, USER_PLANS } from "@/utils/constants";

const VALID_ROLES = new Set([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN, ADMIN_ROLES.EDITOR, CUSTOMER_ROLE]);
const VALID_PLANS = new Set([USER_PLANS.FREE, USER_PLANS.PREMIUM]);

export async function GET(request) {
  const { error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 1000) : 50;
  const pageToken = searchParams.get("pageToken") ?? undefined;

  try {
    const data = await listUsers({ limit, pageToken });
    return NextResponse.json({ data });
  } catch (error) {
    console.error("GET /api/users", error);
    return NextResponse.json({ error: "Gagal mengambil data pengguna." }, { status: 500 });
  }
}

export async function POST(request) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json();
    const targetRole = payload?.role ?? ADMIN_ROLES.ADMIN;
    const targetPlan = payload?.plan ?? USER_PLANS.FREE;

    if (!VALID_ROLES.has(targetRole) || !VALID_PLANS.has(targetPlan)) {
      return NextResponse.json({ error: "Role atau plan tidak valid." }, { status: 400 });
    }
    if (targetRole === ADMIN_ROLES.SUPER_ADMIN && session.role !== ADMIN_ROLES.SUPER_ADMIN) {
      return NextResponse.json({ error: "Hanya super-admin yang dapat membuat super-admin." }, { status: 403 });
    }
    if (!payload?.email || !payload?.password || String(payload.password).length < 6) {
      return NextResponse.json({ error: "Email dan password minimal 6 karakter wajib diisi." }, { status: 400 });
    }

    const user = await createAdminUser({
      email: String(payload.email).trim(),
      password: String(payload.password),
      displayName: payload.displayName ? String(payload.displayName).trim() : undefined,
      role: targetRole,
      plan: targetPlan,
    });

    await recordAuditLog({
      actor: session,
      action: "user.create-admin",
      targetId: user.uid,
      targetType: "user",
      metadata: { email: user.email, role: user.role },
    });

    return NextResponse.json({ data: user }, { status: 201 });
  } catch (error) {
    console.error("POST /api/users", error);
    return NextResponse.json({ error: "Gagal membuat admin/editor baru." }, { status: 500 });
  }
}

export async function PATCH(request) {
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const payload = await request.json();
    if (!payload.uid) {
      return NextResponse.json({ error: "UID wajib diisi." }, { status: 400 });
    }

    if (payload.action === "update-role") {
      if (payload.role && !VALID_ROLES.has(payload.role)) {
        return NextResponse.json({ error: "Role tidak valid." }, { status: 400 });
      }
      if (payload.plan && !VALID_PLANS.has(payload.plan)) {
        return NextResponse.json({ error: "Plan tidak valid." }, { status: 400 });
      }
      if (payload.role === ADMIN_ROLES.SUPER_ADMIN && session.role !== ADMIN_ROLES.SUPER_ADMIN) {
        return NextResponse.json({ error: "Hanya super-admin yang dapat menetapkan role super-admin." }, { status: 403 });
      }
      await updateUserRole(payload.uid, { role: payload.role, plan: payload.plan, actorRole: session.role });
      await recordAuditLog({
        actor: session,
        action: "user.update-role",
        targetId: payload.uid,
        targetType: "user",
        metadata: { role: payload.role, plan: payload.plan },
      });
      return NextResponse.json({ success: true });
    }

    if (payload.action === "update-status") {
      if (typeof payload.disabled !== "boolean") {
        return NextResponse.json({ error: "Status disabled harus boolean." }, { status: 400 });
      }
      await updateUserStatus(payload.uid, { disabled: payload.disabled, actorRole: session.role });
      await recordAuditLog({
        actor: session,
        action: payload.disabled ? "user.suspend" : "user.activate",
        targetId: payload.uid,
        targetType: "user",
      });
      return NextResponse.json({ success: true });
    }

    if (payload.action === "update-subscription") {
      const result = await updateUserSubscription(payload.uid, {
        plan: payload.plan,
        isActive: payload.isActive,
        expiresAt: payload.expiresAt,
        extendDays: payload.extendDays,
      });
      await recordAuditLog({
        actor: session,
        action: "user.update-subscription",
        targetId: payload.uid,
        targetType: "user",
        metadata: { plan: payload.plan ?? undefined, isActive: payload.isActive ?? undefined, expiresAt: result.expiresAt ?? payload.expiresAt ?? undefined, extendDays: payload.extendDays ?? undefined },
      });
      return NextResponse.json({ success: true, expiresAt: result.expiresAt ?? null });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal." }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/users", error);
    return NextResponse.json({ error: "Gagal memperbarui pengguna." }, { status: 500 });
  }
}
