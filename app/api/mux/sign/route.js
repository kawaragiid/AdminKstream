import { NextResponse } from "next/server";
import { requireRole } from "@/lib/session";
import {
  buildMuxStreamUrl,
  buildMuxThumbnailUrl,
  cleanMuxPlaybackId,
  isMuxSigningConfigured,
  signMuxImageUrl,
  signMuxPlaybackToken,
} from "@/lib/muxService";

export async function GET(request) {
  const { error: authError } = await requireRole();
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const rawPlaybackId = searchParams.get("playbackId") || searchParams.get("url") || "";
  const type = (searchParams.get("type") || "video").toLowerCase();
  const playbackId = cleanMuxPlaybackId(rawPlaybackId);

  if (!playbackId) {
    return NextResponse.json({ error: "playbackId wajib diisi." }, { status: 400 });
  }

  const ttlSeconds = Math.min(Math.max(Number(searchParams.get("ttl")) || 14400, 60), 86400);
  const audience = type === "thumbnail" ? "t" : type === "gif" ? "g" : "v";
  const token = signMuxPlaybackToken(playbackId, { audience, ttlSeconds });

  return NextResponse.json({
    data: {
      playbackId,
      signed: isMuxSigningConfigured(),
      token,
      streamUrl: buildMuxStreamUrl(playbackId, { ttlSeconds }),
      thumbnailUrl: rawPlaybackId.includes("image.mux.com")
        ? signMuxImageUrl(rawPlaybackId, playbackId, { ttlSeconds })
        : buildMuxThumbnailUrl(playbackId, { ttlSeconds }),
    },
  });
}
