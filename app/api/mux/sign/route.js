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

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function buildAnimatedUrl(playbackId, { start, end, width, height, ttlSeconds } = {}) {
  const params = {};
  if (start !== undefined) params.start = start;
  if (end !== undefined) params.end = end;
  if (width !== undefined) params.width = width;
  if (height !== undefined) params.height = height;

  const token = signMuxPlaybackToken(playbackId, {
    audience: "g",
    ttlSeconds,
    params,
  });
  if (token) {
    return `https://image.mux.com/${playbackId}/animated.gif?token=${token}`;
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    qs.set(k, String(v));
  }
  const query = qs.toString();
  return `https://image.mux.com/${playbackId}/animated.gif${query ? `?${query}` : ""}`;
}

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
  const time = parseOptionalNumber(searchParams.get("time"));
  const width = parseOptionalNumber(searchParams.get("width"));
  const height = parseOptionalNumber(searchParams.get("height"));
  const fit = searchParams.get("fit")?.trim() || undefined;
  const start = parseOptionalNumber(searchParams.get("start"));
  const end = parseOptionalNumber(searchParams.get("end"));

  const signed = isMuxSigningConfigured();

  if (type === "gif") {
    const tokenParams = {};
    if (start !== undefined) tokenParams.start = start;
    if (end !== undefined) tokenParams.end = end;
    if (width !== undefined) tokenParams.width = width;
    if (height !== undefined) tokenParams.height = height;
    const token = signMuxPlaybackToken(playbackId, { audience: "g", ttlSeconds, params: tokenParams });
    const thumbnailUrl = rawPlaybackId.includes("image.mux.com")
      ? signMuxImageUrl(rawPlaybackId, playbackId, { ttlSeconds })
      : buildAnimatedUrl(playbackId, { start, end, width, height, ttlSeconds });

    return NextResponse.json({
      data: {
        playbackId,
        signed,
        token,
        thumbnailUrl,
        url: thumbnailUrl,
      },
    });
  }

  if (type === "thumbnail") {
    const thumbOpts = {
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      ...(time !== undefined ? { time } : {}),
      ...(fit ? { fit } : {}),
      ttlSeconds,
    };
    const token = signMuxPlaybackToken(playbackId, {
      audience: "t",
      ttlSeconds,
      params: {
        width: thumbOpts.width ?? 640,
        height: thumbOpts.height ?? 360,
        time: thumbOpts.time ?? 10,
        fit_mode: thumbOpts.fit ?? "preserve",
      },
    });
    const thumbnailUrl = rawPlaybackId.includes("image.mux.com")
      ? signMuxImageUrl(rawPlaybackId, playbackId, { ttlSeconds })
      : buildMuxThumbnailUrl(playbackId, thumbOpts);

    return NextResponse.json({
      data: {
        playbackId,
        signed,
        token,
        thumbnailUrl,
        url: thumbnailUrl,
      },
    });
  }

  const token = signMuxPlaybackToken(playbackId, { audience: "v", ttlSeconds });
  const streamUrl = buildMuxStreamUrl(playbackId, { ttlSeconds });

  return NextResponse.json({
    data: {
      playbackId,
      signed,
      token,
      streamUrl,
      url: streamUrl,
    },
  });
}
