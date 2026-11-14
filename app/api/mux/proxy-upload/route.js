import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";

const MAX_PROXY_BYTES = 100 * 1024 * 1024; // 100 MB batas aman untuk proxy fallback
const ALLOWED_METHODS = new Set(["PUT", "POST"]);
const ALLOWED_MUX_UPLOAD_HOSTS = new Set(["direct-uploads.mux.com", "uploads.mux.com"]);

function hasSafeUploadPathname(pathname) {
  if (!pathname || pathname === "/" || pathname.length < 2) return false;
  if (pathname.includes("..") || pathname.includes("\\") || pathname.includes("//")) return false;
  return /^\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]+)*$/.test(pathname);
}

function isAllowedMuxUploadUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    if (u.username || u.password) return false;

    const host = u.hostname.toLowerCase();
    if (ALLOWED_MUX_UPLOAD_HOSTS.has(host)) {
      return hasSafeUploadPathname(u.pathname);
    }

    if (host === "storage.googleapis.com") {
      const hasGoogV4Sig = Boolean(u.searchParams.get("X-Goog-Signature"));
      const hasGoogV2Sig =
        Boolean(u.searchParams.get("Signature")) &&
        Boolean(u.searchParams.get("GoogleAccessId")) &&
        Boolean(u.searchParams.get("upload_id"));
      const isMuxBucketPath = u.pathname.startsWith("/mux-") || u.pathname.includes("/mux-");
      return (hasGoogV4Sig || hasGoogV2Sig) && hasSafeUploadPathname(u.pathname) && isMuxBucketPath;
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

function createByteLimitedStream(sourceStream, maxBytes) {
  let total = 0;
  const limiter = new TransformStream({
    transform(chunk, controller) {
      total += chunk.byteLength;
      if (total > maxBytes) {
        const err = new Error("Ukuran file melebihi batas proxy (100 MB).");
        err.statusCode = 413;
        controller.error(err);
        return;
      }
      controller.enqueue(chunk);
    },
  });
  return sourceStream.pipeThrough(limiter);
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

  const contentLengthHeader = request.headers.get("content-length");
  const contentLength = contentLengthHeader ? Number(contentLengthHeader) : null;
  if (contentLength !== null && (!Number.isFinite(contentLength) || contentLength > MAX_PROXY_BYTES)) {
    return NextResponse.json(
      { error: "Ukuran file melebihi batas proxy (100 MB). Gunakan direct upload." },
      { status: 413 }
    );
  }

  if (!request.body) {
    return NextResponse.json({ error: "Body upload kosong." }, { status: 400 });
  }

  try {
    const forwardHeaders = {
      "Content-Type": request.headers.get("content-type") || "application/octet-stream",
    };
    if (contentLength !== null && contentLength > 0) {
      forwardHeaders["Content-Length"] = String(contentLength);
    }

    const limitedBody = createByteLimitedStream(request.body, MAX_PROXY_BYTES);
    const res = await fetch(uploadUrl, {
      method,
      headers: forwardHeaders,
      body: limitedBody,
      duplex: "half",
      redirect: "error",
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Gagal mem-forward ke Mux (${res.status}).` }, { status: 502 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error?.statusCode === 413) {
      return NextResponse.json({ error: error.message }, { status: 413 });
    }
    console.error("POST /api/mux/proxy-upload", error);
    return NextResponse.json({ error: "Proxy upload gagal." }, { status: 500 });
  }
}
