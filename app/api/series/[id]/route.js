import { NextResponse } from "next/server";
import { getSeries, updateSeries, deleteSeries } from "@/lib/firestoreService";
import { deleteAsset, isMuxConfigured } from "@/lib/muxService";
import { validateSeriesPayload } from "@/utils/validators";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function GET(_request, { params }) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const series = await getSeries(id);
    if (!series) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }
    return NextResponse.json({ data: series });
  } catch (error) {
    console.error("GET /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal memuat series." }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin", "editor"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const existing = await getSeries(id);
    if (!existing) {
      return NextResponse.json({ error: "Series tidak ditemukan." }, { status: 404 });
    }

    const payload = await request.json();
    const merged = { ...existing, ...payload };
    merged.mux_asset_id = merged.mux_asset_id ?? merged.mux_video_id ?? merged.mux_playback_id ?? null;
    if (Array.isArray(merged.episodes)) {
      merged.episodes = merged.episodes.map((episode) => ({
        ...episode,
        mux_asset_id: episode?.mux_asset_id ?? episode?.mux_video_id ?? episode?.mux_playback_id ?? null,
      }));
    }
    const { valid, errors } = validateSeriesPayload(merged);

    if (!valid) {
      return NextResponse.json({ error: "Validasi gagal.", details: errors }, { status: 422 });
    }

    const { id: _omit, ...data } = merged;
    const updated = await updateSeries(id, data);

    await recordAuditLog({
      actor: session,
      action: "series.update",
      targetId: id,
      targetType: "series",
      metadata: { title: updated.title },
    });

    return NextResponse.json({ data: updated });
  } catch (error) {
    console.error("PUT /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal memperbarui series." }, { status: 500 });
  }
}

export async function DELETE(_request, { params }) {
  const session = await getSessionUser();
  if (!session || !["super-admin", "admin"].includes(session.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await params;
    // Hapus semua asset Mux episode jika ada
    try {
      const current = await getSeries(id);
      const episodes = current?.episodes ?? [];
      if (Array.isArray(episodes) && isMuxConfigured) {
        for (const ep of episodes) {
          if (ep?.mux_asset_id) {
            try { await deleteAsset(ep.mux_asset_id); } catch (e) { console.warn('Gagal hapus asset', ep.mux_asset_id); }
          }
        }
      }
    } catch (e) {
      console.warn("Gagal memproses penghapusan asset Mux untuk series", e?.message);
    }
    await deleteSeries(id);

    await recordAuditLog({
      actor: session,
      action: "series.delete",
      targetId: id,
      targetType: "series",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/series/[id]", error);
    return NextResponse.json({ error: "Gagal menghapus series." }, { status: 500 });
  }
}
