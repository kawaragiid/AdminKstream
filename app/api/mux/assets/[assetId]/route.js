import { NextResponse } from "next/server";
import { deleteAsset, getAsset } from "@/lib/muxService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";
import { ADMIN_ROLES } from "@/utils/constants";
import { ensureNeonSchema, getSql, isNeonConfigured } from "@/lib/neonDb";

async function isAssetReferenced(assetId) {
  if (!isNeonConfigured()) return false;
  await ensureNeonSchema();
  const sql = getSql();
  const movieRefs = await sql`SELECT id FROM movies WHERE mux_asset_id = ${assetId} LIMIT 1`;
  if (movieRefs.length > 0) return true;

  const seriesRefs = await sql`
    SELECT id FROM series
    WHERE mux_asset_id = ${assetId}
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(episodes) AS ep
         WHERE ep->>'mux_asset_id' = ${assetId}
       )
    LIMIT 1
  `;
  return seriesRefs.length > 0;
}

export async function GET(_request, { params }) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

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
  const { session, error: authError } = await requireRole([ADMIN_ROLES.SUPER_ADMIN, ADMIN_ROLES.ADMIN]);
  if (authError) return authError;

  try {
    const { assetId } = await params;
    if (!assetId) {
      return NextResponse.json({ error: "assetId wajib diisi." }, { status: 400 });
    }

    const inUse = await isAssetReferenced(assetId);
    if (inUse) {
      return NextResponse.json(
        { error: "Asset masih digunakan oleh konten. Hapus atau ganti referensi konten terlebih dahulu." },
        { status: 409 }
      );
    }

    await deleteAsset(assetId);
    await recordAuditLog({
      actor: session,
      action: "mux.asset.delete",
      targetId: assetId,
      targetType: "mux-asset",
    }).catch((err) => console.warn("[DELETE mux asset] audit log failed:", err?.message || err));

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error?.status === 404 || error?.statusCode === 404) {
      return NextResponse.json({ error: "Asset tidak ditemukan." }, { status: 404 });
    }
    console.error("DELETE /api/mux/assets/[assetId]", error);
    return NextResponse.json({ error: "Gagal menghapus asset." }, { status: 500 });
  }
}
