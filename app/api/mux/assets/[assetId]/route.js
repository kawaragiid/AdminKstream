import { NextResponse } from "next/server";
import { deleteAsset } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

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
