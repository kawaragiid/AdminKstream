import { NextResponse } from "next/server";
import { resolveAssetId } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";

export async function GET(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const playbackId = searchParams.get("playbackId")?.trim();
  if (!playbackId) {
    return NextResponse.json({ error: "playbackId wajib diisi." }, { status: 400 });
  }

  try {
    const assetId = await resolveAssetId(playbackId);
    console.log("[MUX DEBUG] resolve-asset", playbackId, "->", assetId);
    if (!assetId) {
      return NextResponse.json({
        data: null,
        error: "Asset ID tidak ditemukan."
      }, { status: 404 });
    }

    return NextResponse.json({ data: { assetId } });
  } catch (error) {
    console.error("[MUX DEBUG] resolve-asset error", playbackId, error?.message ?? error);
    return NextResponse.json({ error: "Gagal mengambil assetId dari playbackId." }, { status: 500 });
  }
}
