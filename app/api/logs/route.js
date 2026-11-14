import { NextResponse } from "next/server";
import { listAuditLogs } from "@/lib/auditService";
import { requireRole } from "@/lib/session";
import { ADMIN_ROLES } from "@/utils/constants";

export async function GET(request) {
  const { error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const rawLimit = Number.parseInt(searchParams.get("limit") ?? "50", 10);
  const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 200) : 50;
  const rawOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
  const offset = Number.isFinite(rawOffset) && rawOffset >= 0 ? rawOffset : 0;
  const action = searchParams.get("action")?.trim() || undefined;
  const actor = searchParams.get("actor")?.trim() || undefined;
  const targetType = searchParams.get("targetType")?.trim() || undefined;

  try {
    const logs = await listAuditLogs({ limit, offset, action, actor, targetType });
    return NextResponse.json({ data: logs }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/logs", error);
    return NextResponse.json({ error: "Gagal memuat audit log." }, { status: 500 });
  }
}
