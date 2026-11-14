import { NextResponse } from "next/server";
import { getMuxCostReport } from "@/lib/muxService";
import { requireRole } from "@/lib/session";
import { ADMIN_ROLES } from "@/utils/constants";

export async function GET() {
  const { error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const report = await getMuxCostReport();
    return NextResponse.json({ data: report });
  } catch (error) {
    console.error("GET /api/mux/usage", error);
    return NextResponse.json(
      { error: "Gagal mengambil laporan penggunaan & estimasi biaya Mux." },
      { status: 500 }
    );
  }
}
