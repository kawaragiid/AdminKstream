import { NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analyticsService";
import { requireRole } from "@/lib/session";

export async function GET() {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  try {
    const data = await fetchAnalyticsSummary();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Error fetching analytics", error);
    return NextResponse.json(
      { error: "Gagal mengambil data analitik." },
      { status: 500 }
    );
  }
}
