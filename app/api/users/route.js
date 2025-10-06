import { NextResponse } from "next/server";
import { listUsers, updateUserRole, updateUserStatus, createAdminUser, updateUserSubscription } from "@/lib/usersService";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

function ensureAdmin(session) {
  return session && ["super-admin", "admin"].includes(session.role);
}

export async function GET(request) {
  const session = await getSessionUser();
  if (!ensureAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
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
  const session = await getSessionUser();
  if (!ensureAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    const user = await createAdminUser(payload);

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
  const session = await getSessionUser();
  if (!ensureAdmin(session)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = await request.json();
    if (!payload.uid) {
      return NextResponse.json({ error: "UID wajib diisi." }, { status: 400 });
    }

    if (payload.action === "update-role") {
      await updateUserRole(payload.uid, { role: payload.role, plan: payload.plan });
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
      await updateUserStatus(payload.uid, { disabled: payload.disabled });
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
