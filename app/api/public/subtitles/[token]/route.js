import { getTempSubtitle } from "@/lib/tempSubtitles";

export const dynamic = "force-dynamic";

// Endpoint PUBLIK (tanpa login) agar Mux bisa mengunduh file .vtt sementara.
// Aman karena token acak 48 karakter hex, dokumen dihapus setelah Mux sukses, dan kedaluwarsa 24 jam.
export async function GET(_request, { params }) {
  const { token: rawToken } = await params;
  const token = String(rawToken || "").replace(/\.vtt$/i, "");
  const record = await getTempSubtitle(token).catch(() => null);

  if (!record) {
    return new Response("Not Found", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8" } });
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
}
