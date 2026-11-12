import { NextResponse } from "next/server";
import { resolveAssetId } from "@/lib/muxService";
import { requireRole } from "@/lib/session";

export async function GET(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const playbackId = searchParams.get("playbackId")?.trim();
  if (!playbackId) {
    return NextResponse.json({ error: "playbackId wajib diisi." }, { status: 400 });
  }

  try {
    const assetId = await resolveAssetId(playbackId);
    if (!assetId) {
      return NextResponse.json({
        data: null,
        error: "Asset ID tidak ditemukan."
      }, { status: 404 });
    }

    return NextResponse.json({ data: { assetId } });
  } catch (error) {
    console.error("GET /api/mux/resolve-asset error", error?.message ?? error);
    return NextResponse.json({ error: "Gagal mengambil assetId dari playbackId." }, { status: 500 });
  }
}
