import { NextResponse } from "next/server";
import { createDirectUpload, isMuxConfigured } from "@/lib/muxService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  if (!isMuxConfigured) {
    const mock = await createDirectUpload({ passthrough: { admin: session.uid } });
    return NextResponse.json({ data: mock, warning: "MUX credentials belum diatur, memakai mock data." });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const origin = request.headers.get("origin") || "*";
    const contentType = body?.contentType || body?.type || "main";
    const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
    const seasonPart = body?.seasonNumber ? `S${String(body.seasonNumber).padStart(2, "0")}` : "";
    const epPart = body?.epNumber ? `E${String(body.epNumber).padStart(2, "0")}` : "";
    const epTag = seasonPart || epPart ? `${seasonPart}${epPart}` : "";
    const metaTitle = [rawTitle, epTag].filter(Boolean).join(" - ") || undefined;

    const playbackPolicy = [process.env.MUX_PLAYBACK_POLICY === "public" ? "public" : "signed"];
    const upload = await createDirectUpload({
      passthrough: JSON.stringify({
        type: contentType,
        ...(rawTitle ? { title: rawTitle.slice(0, 100) } : {}),
        createdBy: session.uid,
      }),
      meta: {
        title: metaTitle,
        creator_id: session.uid,
        external_id: typeof body?.externalId === "string" ? body.externalId : undefined,
      },
      playbackPolicy,
      videoQuality: "basic",
      maxResolutionTier: "1080p",
      ttl: 3600,
      corsOrigin: origin,
    });

    await recordAuditLog({
      actor: session,
      action: "mux.direct-upload.create",
      targetId: upload.id,
      targetType: "mux-upload",
      metadata: {
        type: body?.type ?? "main",
        videoQuality: "basic",
        maxResolutionTier: "1080p",
      },
    });

    return NextResponse.json({ data: upload });
  } catch (error) {
    console.error("POST /api/mux/direct-upload", error);
    return NextResponse.json({ error: "Gagal membuat direct upload." }, { status: 500 });
  }
}
