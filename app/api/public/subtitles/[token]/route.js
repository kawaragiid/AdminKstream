import { getTempSubtitle } from "@/lib/tempSubtitles";

export const dynamic = "force-dynamic";

// Endpoint PUBLIK (tanpa login) agar Mux bisa mengunduh file .vtt sementara.
export async function GET(_request, { params }) {
  try {
    const { token: rawToken } = await params;
    const token = String(rawToken || "").replace(/\.vtt$/i, "");
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
