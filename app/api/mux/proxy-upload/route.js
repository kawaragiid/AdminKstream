import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const MAX_PROXY_BYTES = 100 * 1024 * 1024; // 100 MB batas aman untuk proxy fallback
const ALLOWED_METHODS = new Set(["PUT", "POST"]);

function hasSafeUploadPathname(pathname) {
  if (!pathname || pathname === "/" || pathname.length < 2) return false;
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("//")) return false;
  return /^\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]+)*$/.test(pathname);
}

/**
 * Validasi target direct-upload Mux untuk mencegah SSRF / open-proxy ke bucket S3 pribadi.
 * Hanya mengizinkan:
 * - Domain resmi Mux (`mux.com`, `*.mux.com`)
 * - Signed GCS direct-upload URL (`storage.googleapis.com` dengan parameter tanda tangan GCS & path objek valid)
 * - Signed S3 / S3-Accelerate URL (`*.s3.amazonaws.com`, `*.s3-accelerate.amazonaws.com`) hanya jika
 *   query parameter presigned (`X-Amz-Signature` & `X-Amz-Credential`) ada dan pathname merupakan key objek valid.
 */
function isAllowedMuxUploadUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;

    const host = u.hostname.toLowerCase();
    if (host === "mux.com" || host.endsWith(".mux.com")) {
      return true;
    }

    if (host === "storage.googleapis.com") {
      const hasGoogV4Sig = Boolean(u.searchParams.get("X-Goog-Signature"));
      const hasGoogV2Sig =
        Boolean(u.searchParams.get("Signature")) &&
        Boolean(u.searchParams.get("GoogleAccessId")) &&
        Boolean(u.searchParams.get("upload_id"));
      return (hasGoogV4Sig || hasGoogV2Sig) && hasSafeUploadPathname(u.pathname);
    }

    if (/^[a-z0-9][a-z0-9.-]*\.s3(?:-accelerate)?\.amazonaws\.com$/i.test(host)) {
      const hasAmzSignature = Boolean(u.searchParams.get("X-Amz-Signature"));
      const hasAmzCredential = Boolean(u.searchParams.get("X-Amz-Credential"));
      return hasAmzSignature && hasAmzCredential && hasSafeUploadPathname(u.pathname);
    }

    return false;
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

  if (!uploadUrl || !isAllowedMuxUploadUrl(uploadUrl)) {
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
