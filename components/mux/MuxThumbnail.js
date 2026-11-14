"use client";

import { useEffect, useState } from "react";

const signedUrlCache = new Map();

/**
 * Extracts a Mux playbackId from an image.mux.com or stream.mux.com URL, or returns bare IDs.
 */
export function extractMuxPlaybackId(value) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      if (parsed.hostname === "image.mux.com" || parsed.hostname === "stream.mux.com") {
        const seg = parsed.pathname.split("/").filter(Boolean)[0] || "";
        return seg.replace(/\.(m3u8|jpg|jpeg|png|webp|gif)$/i, "");
      }
    } catch {
      return "";
    }
    return "";
  }
  return trimmed.replace(/\.(m3u8|jpg|jpeg|png|webp|gif)$/i, "");
}

/**
 * Requests a signed Mux URL from /api/mux/sign when available, falling back to unsigned URL.
 */
export async function resolveMuxSignedUrl({ playbackId, type = "thumbnail", time = 5, start, end, signal } = {}) {
  const cleanId = extractMuxPlaybackId(playbackId);
  if (!cleanId) return "";

  const fallbackUrl =
    type === "stream"
      ? `https://stream.mux.com/${cleanId}.m3u8${
          start !== undefined && end !== undefined ? `?start=${start}&end=${end}` : ""
        }`
      : `https://image.mux.com/${cleanId}/thumbnail.jpg?time=${time}`;

  const cacheKey = `${type}:${cleanId}:${time}:${start ?? ""}:${end ?? ""}`;
  if (signedUrlCache.has(cacheKey)) {
    return signedUrlCache.get(cacheKey);
  }

  try {
    const params = new URLSearchParams({ playbackId: cleanId, type });
    if (type === "thumbnail" && time !== undefined) params.set("time", String(time));
    if (start !== undefined) params.set("start", String(start));
    if (end !== undefined) params.set("end", String(end));

    const res = await fetch(`/api/mux/sign?${params.toString()}`, { signal });
    if (!res.ok) return "";
    const json = await res.json().catch(() => ({}));
    const signed = json?.data?.thumbnailUrl || json?.data?.url || json?.url || "";
    if (signed) {
      signedUrlCache.set(cacheKey, signed);
      return signed;
    }
    if (json?.data?.signed === false) {
      return fallbackUrl;
    }
    return "";
  } catch {
    return "";
  }
}

/**
 * Renders a thumbnail <img> with automatic Mux signing (for image.mux.com without token)
 * and a graceful fallback UI on load error.
 */
export default function MuxThumbnail({
  src,
  playbackId,
  alt = "Thumbnail",
  className = "h-full w-full object-cover",
  fallback = null,
}) {
  const trimmedInitial = (src ?? "").trim();
  const initialNeedsSign =
    (!trimmedInitial && Boolean(extractMuxPlaybackId(playbackId))) ||
    (trimmedInitial.includes("image.mux.com/") && !trimmedInitial.includes("token="));

  const [resolvedSrc, setResolvedSrc] = useState(initialNeedsSign ? "" : trimmedInitial);
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
    const trimmedSrc = (src ?? "").trim();
    const cleanPlayback = extractMuxPlaybackId(playbackId || trimmedSrc);
    const isUnsignedMuxImage =
      (!trimmedSrc && Boolean(cleanPlayback)) ||
      (trimmedSrc.includes("image.mux.com/") && !trimmedSrc.includes("token="));

    if (!isUnsignedMuxImage) {
      setResolvedSrc(trimmedSrc);
      return;
    }

    setResolvedSrc("");
    const controller = new AbortController();
    resolveMuxSignedUrl({
      playbackId: cleanPlayback,
      type: "thumbnail",
      time: 5,
      signal: controller.signal,
    }).then((url) => {
      if (!controller.signal.aborted) {
        if (url) {
          setResolvedSrc(url);
        } else {
          setResolvedSrc("");
          setHasError(true);
        }
      }
    });

    return () => controller.abort();
  }, [src, playbackId]);

  if (!resolvedSrc || hasError) {
    return (
      fallback ?? (
        <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 text-xs text-slate-500">
          <span className="text-xl">🎬</span>
        </div>
      )
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
    />
  );
}
