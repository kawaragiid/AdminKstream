import { NextResponse } from "next/server";
import { getUploadStatus, getAsset } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";

export async function GET(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const uploadId = searchParams.get("uploadId");
  if (!uploadId) {
    return NextResponse.json({ error: "uploadId wajib diisi" }, { status: 400 });
  }

  try {
    const status = await getUploadStatus(uploadId);
    let asset = null;

    if (status?.asset_id) {
      asset = await getAsset(status.asset_id);
    }

    return NextResponse.json({ data: { status, asset } });
  } catch (error) {
    console.error("GET /api/mux/upload-status", error);
    return NextResponse.json({ error: "Gagal mengambil status upload." }, { status: 500 });
  }
}
