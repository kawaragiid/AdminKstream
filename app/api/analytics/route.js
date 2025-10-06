import { NextResponse } from "next/server";
import { fetchAnalyticsSummary } from "@/lib/analyticsService";

export async function GET() {
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
