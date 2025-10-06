import { NextResponse } from "next/server";
import { listAuditLogs } from "@/lib/auditService";
import { getSessionUser } from "@/lib/session";

export async function GET(request) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = Number.parseInt(searchParams.get("limit") ?? "50", 10);

  try {
    const logs = await listAuditLogs({ limit });
    return NextResponse.json({ data: logs });
  } catch (error) {
    console.error("GET /api/logs", error);
    return NextResponse.json({ error: "Gagal memuat audit log." }, { status: 500 });
  }
}
