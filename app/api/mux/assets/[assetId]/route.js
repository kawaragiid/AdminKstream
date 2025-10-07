import { NextResponse } from "next/server";
import { deleteAsset, getAsset } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(_request, { params }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { assetId } = await params;
    if (!assetId) {
      return NextResponse.json({ error: "assetId wajib diisi." }, { status: 400 });
    }
    const asset = await getAsset(assetId);
    return NextResponse.json({ data: asset });
  } catch (error) {
    if (error?.status === 404 || error?.statusCode === 404) {
      return NextResponse.json({ error: "Asset tidak ditemukan." }, { status: 404 });
    }
    console.error("GET /api/mux/assets/[assetId]", error);
    return NextResponse.json({ error: "Gagal mengambil detail asset." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { assetId } = await params;
    await deleteAsset(assetId);
    await recordAuditLog({
      actor: session,
      action: "mux.asset.delete",
      targetId: assetId,
      targetType: "mux-asset",
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/mux/assets/[assetId]", error);
    return NextResponse.json({ error: "Gagal menghapus asset." }, { status: 500 });
  }
}
