import { getTempSubtitle } from "@/lib/tempSubtitles";

export const dynamic = "force-dynamic";

const SUBTITLE_TOKEN_REGEX = /^[a-f0-9-]{16,64}$/i;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 60;
const requestsByIp = new Map();

function getClientIp(request) {
  const forwarded = request?.headers?.get?.("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim() || "unknown";
  }
  return request?.headers?.get?.("x-real-ip")?.trim() || "unknown";
}

function checkSubtitleRateLimit(ip) {
  const now = Date.now();
  if (requestsByIp.size > 500) {
    for (const [key, entry] of requestsByIp.entries()) {
      if (now >= entry.resetAt) requestsByIp.delete(key);
    }
  }
  const existing = requestsByIp.get(ip);
  if (!existing || now >= existing.resetAt) {
    requestsByIp.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, retryAfter: 0 };
  }
  if (existing.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      allowed: false,
      retryAfter: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }
  existing.count += 1;
  return { allowed: true, retryAfter: 0 };
}

// Endpoint PUBLIK (tanpa login) agar Mux bisa mengunduh file .vtt sementara.
export async function GET(request, { params }) {
  try {
    const rateLimit = checkSubtitleRateLimit(getClientIp(request));
    if (!rateLimit.allowed) {
      return new Response("Too Many Requests", {
        status: 429,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Retry-After": String(rateLimit.retryAfter),
        },
      });
    }

    const { token: rawToken } = await params;
    const token = String(rawToken || "").replace(/\.vtt$/i, "");
    if (!SUBTITLE_TOKEN_REGEX.test(token)) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    const record = await getTempSubtitle(token);

    if (!record) {
      return new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    return new Response(record.vtt, {
      status: 200,
      headers: {
        "Content-Type": "text/vtt; charset=utf-8",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*",
        "X-Robots-Tag": "noindex",
      },
    });
  } catch (error) {
    console.error("GET /api/public/subtitles/[token]", error);
    return new Response("Service Unavailable", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8", "Retry-After": "5" },
    });
  }
}
