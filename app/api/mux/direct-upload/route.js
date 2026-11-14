import { NextResponse } from "next/server";
import { createDirectUpload, isMuxConfigured } from "@/lib/muxService";
import { requireRole } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

function resolveAllowedCorsOrigin(request) {
  const requestOrigin = request.headers.get("origin");
  const allowed = new Set();
  if (request.nextUrl?.origin) allowed.add(request.nextUrl.origin);
  for (const envVal of [
    process.env.ADMIN_PUBLIC_URL,
    process.env.NEXT_PUBLIC_ADMIN_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.APP_URL,
  ]) {
    if (envVal) {
      try {
        allowed.add(new URL(envVal).origin);
      } catch {
        // Abaikan
      }
    }
  }
  if (process.env.VERCEL_URL) allowed.add(`https://${process.env.VERCEL_URL}`);
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    allowed.add(`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`);
  }
  if (process.env.ALLOWED_CORS_ORIGINS) {
    for (const item of process.env.ALLOWED_CORS_ORIGINS.split(",")) {
      const trimmed = item.trim();
      if (trimmed) allowed.add(trimmed);
    }
  }

  if (requestOrigin && allowed.has(requestOrigin)) {
    return requestOrigin;
  }
  return request.nextUrl?.origin || Array.from(allowed)[0] || undefined;
}

function buildPassthrough({ contentType, rawTitle, uid }) {
  const base = {
    type: String(contentType || "main").slice(0, 32),
    createdBy: uid,
  };
  if (rawTitle) {
    const candidate = JSON.stringify({ ...base, title: rawTitle.slice(0, 100) });
    if (candidate.length <= 255) return candidate;
  }
  const compact = JSON.stringify(base);
  return compact.length <= 255 ? compact : compact.slice(0, 255);
}

export async function POST(request) {
  const { session, error: authError } = await requireRole();
  if (authError) return authError;

  if (!isMuxConfigured) {
    const mock = await createDirectUpload({
      passthrough: JSON.stringify({ admin: session.uid }).slice(0, 255),
    });
    return NextResponse.json({ data: mock, warning: "MUX credentials belum diatur, memakai mock data." });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const corsOrigin = resolveAllowedCorsOrigin(request);
    const contentType = body?.contentType || body?.type || "main";
    const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
    const seasonPart = body?.seasonNumber ? `S${String(body.seasonNumber).padStart(2, "0")}` : "";
    const epPart = body?.epNumber ? `E${String(body.epNumber).padStart(2, "0")}` : "";
    const epTag = seasonPart || epPart ? `${seasonPart}${epPart}` : "";
    const metaTitle = [rawTitle, epTag].filter(Boolean).join(" - ") || undefined;

    const playbackPolicy = [process.env.MUX_PLAYBACK_POLICY === "public" ? "public" : "signed"];
    const passthrough = buildPassthrough({ contentType, rawTitle, uid: session.uid });

    const upload = await createDirectUpload({
      passthrough,
      meta: {
        title: metaTitle,
        creator_id: session.uid,
        external_id: typeof body?.externalId === "string" ? body.externalId : undefined,
      },
      playbackPolicy,
      videoQuality: "basic",
      maxResolutionTier: "1080p",
      ttl: 3600,
      corsOrigin,
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
    }).catch((err) => console.warn("[direct-upload] audit log failed:", err?.message || err));

    return NextResponse.json({ data: upload });
  } catch (error) {
    console.error("POST /api/mux/direct-upload", error);
    return NextResponse.json({ error: "Gagal membuat direct upload." }, { status: 500 });
  }
}
