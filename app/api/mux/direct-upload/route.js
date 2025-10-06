import { NextResponse } from "next/server";
import { createDirectUpload, isMuxConfigured } from "@/lib/muxService";
import { getSessionUser } from "@/lib/session";
import { recordAuditLog } from "@/lib/auditService";

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isMuxConfigured) {
    const mock = await createDirectUpload({ passthrough: { admin: session.uid } });
    return NextResponse.json({ data: mock, warning: "MUX credentials belum diatur, memakai mock data." });
  }

  try {
    const body = await request.json();
    const origin = request.headers.get("origin") || "*";
    const upload = await createDirectUpload({
      passthrough: JSON.stringify({
        type: body?.type ?? "main",
        createdBy: session.uid,
      }),
      playbackPolicy: ["public"],
      ttl: 3600,
      corsOrigin: origin,
    });

    await recordAuditLog({
      actor: session,
      action: "mux.direct-upload.create",
      targetId: upload.id,
      targetType: "mux-upload",
      metadata: { type: body?.type ?? "main" },
    });

    return NextResponse.json({ data: upload });
  } catch (error) {
    console.error("POST /api/mux/direct-upload", error);
    return NextResponse.json({ error: "Gagal membuat direct upload." }, { status: 500 });
  }
}
