import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const MAX_PROXY_BYTES = 100 * 1024 * 1024; // 100 MB batas aman untuk proxy fallback
const ALLOWED_METHODS = new Set(["PUT", "POST"]);

function isAllowedUploadUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return (
      host === "mux.com" ||
      host.endsWith(".mux.com") ||
      host === "storage.googleapis.com" ||
      host.endsWith(".storage.googleapis.com") ||
      host.endsWith(".s3.amazonaws.com") ||
      host.endsWith(".s3-accelerate.amazonaws.com")
    );
  } catch {
    return false;
  }
}

export async function POST(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const uploadUrl = searchParams.get("url");
  const method = (searchParams.get("method") || "PUT").toUpperCase();

  if (!ALLOWED_METHODS.has(method)) {
    return NextResponse.json({ error: "Method upload tidak diizinkan." }, { status: 400 });
  }

  if (!uploadUrl || !isAllowedUploadUrl(uploadUrl)) {
    return NextResponse.json({ error: "upload URL tidak valid." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_PROXY_BYTES) {
    return NextResponse.json({ error: "Ukuran file melebihi batas proxy (100 MB). Gunakan direct upload." }, { status: 413 });
  }

  try {
    const bytes = await request.arrayBuffer();
    if (bytes.byteLength > MAX_PROXY_BYTES) {
      return NextResponse.json({ error: "Ukuran file melebihi batas proxy (100 MB)." }, { status: 413 });
    }

    const res = await fetch(uploadUrl, {
      method,
      headers: { "Content-Type": request.headers.get("content-type") || "application/octet-stream" },
      body: bytes,
      redirect: "error",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mem-forward ke Mux (${res.status}).` }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/mux/proxy-upload", error);
    return NextResponse.json({ error: "Proxy upload gagal." }, { status: 500 });
  }
}
