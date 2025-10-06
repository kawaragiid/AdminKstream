import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/session";

// Simple server-side proxy to forward the video bytes to Mux's direct upload URL
// Use only as a fallback when client-side CORS blocks direct PUT/POST to Mux.

function isAllowedUploadUrl(url) {
  try {
    const u = new URL(url);
    const host = u.host.toLowerCase();
    return (
      host.endsWith("mux.com") ||
      host.endsWith("amazonaws.com") ||
      host.endsWith("googleapis.com") ||
      host.endsWith("cloudfront.net")
    );
  } catch (_) {
    return false;
  }
}

export async function POST(request) {
  const session = await getSessionUser();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const uploadUrl = searchParams.get("url");
  const method = searchParams.get("method")?.toUpperCase() || "PUT";

  if (!uploadUrl || !isAllowedUploadUrl(uploadUrl)) {
    return NextResponse.json({ error: "upload URL tidak valid." }, { status: 400 });
  }

  try {
    const bytes = await request.arrayBuffer();
    const res = await fetch(uploadUrl, {
      method,
      // Forward as octet-stream; remote will ignore unknown headers
      headers: { "Content-Type": request.headers.get("content-type") || "application/octet-stream" },
      body: bytes,
      redirect: "follow",
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ error: `Gagal mem-forward ke Mux (${res.status}). ${text}` }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/mux/proxy-upload", error);
    return NextResponse.json({ error: "Proxy upload gagal." }, { status: 500 });
  }
}

