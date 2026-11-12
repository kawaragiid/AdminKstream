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

  try {
    const logs = await listAuditLogs({ limit });
    return NextResponse.json({ data: logs });
  } catch (error) {
    console.error("GET /api/logs", error);
    return NextResponse.json({ error: "Gagal memuat audit log." }, { status: 500 });
  }
}
