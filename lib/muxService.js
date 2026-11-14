import crypto from "node:crypto";
import Mux from "@mux/mux-node";

const muxTokenId = process.env.MUX_TOKEN_ID;
const muxTokenSecret = process.env.MUX_TOKEN_SECRET;

export const isMuxConfigured = Boolean(muxTokenId && muxTokenSecret);

let muxClient;

function getMuxClient() {
  if (!isMuxConfigured) return null;
  if (!muxClient) {
    muxClient = new Mux({ tokenId: muxTokenId, tokenSecret: muxTokenSecret });
  }
  return muxClient;
}

// ====================================================================
// Mux Signed Playback JWT Helpers (RS256)
// ====================================================================
function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const RESERVED_JWT_CLAIMS = new Set([
  "sub",
  "aud",
  "exp",
  "nbf",
  "iat",
  "jti",
  "playback_restriction_id",
]);

function requiresSignedPlayback() {
  return process.env.MUX_PLAYBACK_POLICY !== "public";
}

function resolveSigningConfig() {
  const keyId = (process.env.MUX_SIGNING_KEY_ID || "").trim();
  const rawEnv = (process.env.MUX_SIGNING_KEY || "").trim();
  const rawKey = rawEnv.replace(/^(['"])([\s\S]*)\1$/, "$2").trim();
  const restrictionId = (process.env.MUX_PLAYBACK_RESTRICTION_ID || "").trim();
  if (!keyId || !rawKey) return null;

  let pem = rawKey.replace(/\\n/g, "\n");
  if (!pem.includes("-----BEGIN")) {
    try {
      pem = Buffer.from(pem, "base64").toString("utf8").replace(/\\n/g, "\n");
    } catch {
      return null;
    }
  }
  if (!pem.includes("-----BEGIN")) return null;

  try {
    crypto.createPrivateKey(pem);
  } catch {
    return null;
  }

  return { keyId, pem, restrictionId };
}

export function isMuxSigningConfigured() {
  return Boolean(resolveSigningConfig());
}

export function cleanMuxPlaybackId(value) {
  if (!value || typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) {
    const streamMatch = trimmed.match(/stream\.mux\.com\/([A-Za-z0-9]+)/i);
    if (streamMatch) return streamMatch[1];
    const imageMatch = trimmed.match(/image\.mux\.com\/([A-Za-z0-9]+)/i);
    if (imageMatch) return imageMatch[1];
    return "";
  }
  return trimmed.replace(/\?.*$/, "").replace(/\.m3u8$/i, "");
}

export function signMuxPlaybackToken(
  playbackId,
  { audience = "v", ttlSeconds = 14400, params = {} } = {}
) {
  const cleanId = cleanMuxPlaybackId(playbackId);
  const cfg = resolveSigningConfig();
  if (!cleanId || !cfg) return null;

  const header = base64UrlEncode(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
      kid: cfg.keyId,
    })
  );

  const sanitizedParams =
    params && typeof params === "object"
      ? Object.fromEntries(
          Object.entries(params).filter(([k]) => !RESERVED_JWT_CLAIMS.has(k))
        )
      : {};

  const payloadObj = {
    ...sanitizedParams,
    sub: cleanId,
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
    ...(cfg.restrictionId ? { playback_restriction_id: cfg.restrictionId } : {}),
  };

  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signingInput = `${header}.${payload}`;
  try {
    const signer = crypto.createSign("RSA-SHA256");
    signer.update(signingInput);
    signer.end();
    const signature = signer.sign(cfg.pem, "base64url");
    return `${signingInput}.${signature}`;
  } catch (error) {
    console.warn("[MUX SIGNING] Failed to sign playback token:", error?.message || error);
    return null;
  }
}

export function buildMuxStreamUrl(playbackId, { defaultLang = "", ttlSeconds = 14400 } = {}) {
  const cleanId = cleanMuxPlaybackId(playbackId);
  if (!cleanId) {
    return typeof playbackId === "string" && /^https?:\/\//i.test(playbackId.trim())
      ? playbackId.trim()
      : "";
  }

  const token = signMuxPlaybackToken(cleanId, { audience: "v", ttlSeconds });
  if (!token && requiresSignedPlayback()) {
    return null;
  }

  const params = new URLSearchParams();
  if (token) {
    params.set("token", token);
  }
  if (defaultLang) {
    params.set("default_subtitles_lang", defaultLang);
  }
  const qs = params.toString();
  return `https://stream.mux.com/${cleanId}.m3u8${qs ? `?${qs}` : ""}`;
}

export function buildMuxThumbnailUrl(
  playbackId,
  { width = 640, height = 360, time = 10, fit = "preserve", ttlSeconds = 14400 } = {}
) {
  const cleanId = cleanMuxPlaybackId(playbackId);
  if (!cleanId) return "";

  const token = signMuxPlaybackToken(cleanId, {
    audience: "t",
    ttlSeconds,
    params: {
      width,
      height,
      time,
      fit_mode: fit,
    },
  });

  if (token) {
    return `https://image.mux.com/${cleanId}/thumbnail.png?token=${token}`;
  }
  if (requiresSignedPlayback()) {
    return null;
  }
  return `https://image.mux.com/${cleanId}/thumbnail.png?width=${width}&height=${height}&time=${time}&fit_mode=${fit}`;
}

export function signMuxImageUrl(rawUrl, fallbackPlaybackId = "", fallbackOpts = {}) {
  const trimmed = typeof rawUrl === "string" ? rawUrl.trim() : "";
  if (!trimmed) {
    return fallbackPlaybackId ? buildMuxThumbnailUrl(fallbackPlaybackId, fallbackOpts) : "";
  }

  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return trimmed;
  }

  if (parsed.hostname.toLowerCase() !== "image.mux.com") {
    return trimmed;
  }

  const match = parsed.pathname.match(/^\/([A-Za-z0-9]+)\/(thumbnail\.(?:png|jpg|jpeg|webp)|animated\.(?:gif|webp))$/i);
  if (!match) {
    return trimmed;
  }

  if (!isMuxSigningConfigured()) {
    return trimmed;
  }

  const playbackId = match[1];
  const assetFile = match[2];
  const isGif = assetFile.toLowerCase().startsWith("animated.");
  const params = {};
  for (const [k, v] of parsed.searchParams.entries()) {
    if (k === "token" || RESERVED_JWT_CLAIMS.has(k)) continue;
    const num = Number(v);
    params[k] = v !== "" && Number.isFinite(num) ? num : v;
  }

  const token = signMuxPlaybackToken(playbackId, {
    audience: isGif ? "g" : "t",
    ttlSeconds: fallbackOpts.ttlSeconds ?? 14400,
    params,
  });

  if (!token) return trimmed;
  return `https://image.mux.com/${playbackId}/${assetFile}?token=${token}`;
}

function signMuxFieldUrl(value) {
  if (typeof value !== "string") return value;
  if (/stream\.mux\.com\//i.test(value)) {
    return buildMuxStreamUrl(value);
  }
  if (/image\.mux\.com\//i.test(value)) {
    return signMuxImageUrl(value, "");
  }
  return value;
}

export function signMediaItemMuxUrls(item) {
  if (!item || typeof item !== "object") return item;
  const playbackId = item.mux_playback_id || item.mux_video_id || "";
  const signedItem = {
    ...item,
    thumbnail: signMuxImageUrl(item.thumbnail, playbackId),
    backdropUrl: item.backdropUrl ? signMuxImageUrl(item.backdropUrl, "") : item.backdropUrl,
    trailer: signMuxFieldUrl(item.trailer),
    streamUrl: signMuxFieldUrl(item.streamUrl),
    movieUrl: signMuxFieldUrl(item.movieUrl),
    videoUrl: signMuxFieldUrl(item.videoUrl),
    previewAnimation: signMuxFieldUrl(item.previewAnimation),
  };

  if (playbackId && isMuxSigningConfigured()) {
    signedItem.signed_playback_token = signMuxPlaybackToken(playbackId, { audience: "v" });
  }

  if (Array.isArray(item.episodes)) {
    signedItem.episodes = item.episodes.map((ep) => {
      if (!ep || typeof ep !== "object") return ep;
      const epPlaybackId = ep.mux_playback_id || ep.mux_video_id || "";
      const signedEp = {
        ...ep,
        thumbnail: signMuxImageUrl(ep.thumbnail, epPlaybackId),
        streamUrl: signMuxFieldUrl(ep.streamUrl),
      };
      if (epPlaybackId && isMuxSigningConfigured()) {
        signedEp.signed_playback_token = signMuxPlaybackToken(epPlaybackId, { audience: "v" });
      }
      return signedEp;
    });
  }

  return signedItem;
}

// ====================================================================
// Mux Asset & Upload Operations
// ====================================================================
export async function createDirectUpload({
  playbackPolicy = ["public"],
  ttl = 3600,
  passthrough,
  meta,
  corsOrigin,
  videoQuality = "basic",
  maxResolutionTier = "1080p",
} = {}) {
  if (!isMuxConfigured) {
    return {
      id: `mock-upload-${Date.now()}`,
      url: "https://stream.mux.com/mock-direct-upload",
      status: "waiting",
      new_asset_settings: {
        playback_policy: playbackPolicy,
        video_quality: videoQuality,
        max_resolution_tier: maxResolutionTier,
      },
      playback_ids: [
        {
          id: "mockplaybackid1234",
          policy: "public",
        },
      ],
    };
  }

  const normalizedMeta =
    meta && typeof meta === "object"
      ? Object.fromEntries(
          Object.entries({
            title: typeof meta.title === "string" ? meta.title.trim().slice(0, 512) : undefined,
            creator_id: typeof meta.creator_id === "string" ? meta.creator_id.trim().slice(0, 128) : undefined,
            external_id: typeof meta.external_id === "string" ? meta.external_id.trim().slice(0, 128) : undefined,
          }).filter(([, value]) => Boolean(value))
        )
      : undefined;

  const safePassthrough =
    typeof passthrough === "string" && passthrough.trim()
      ? passthrough.trim().slice(0, 255)
      : undefined;

  const resolvedCorsOrigin =
    corsOrigin ||
    process.env.ADMIN_PUBLIC_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    undefined;

  const { video } = getMuxClient();
  return video.uploads.create({
    timeout: ttl,
    new_asset_settings: {
      playback_policy: playbackPolicy,
      video_quality: videoQuality,
      max_resolution_tier: maxResolutionTier,
      ...(safePassthrough ? { passthrough: safePassthrough } : {}),
      ...(normalizedMeta && Object.keys(normalizedMeta).length ? { meta: normalizedMeta } : {}),
    },
    ...(resolvedCorsOrigin ? { cors_origin: resolvedCorsOrigin } : {}),
  });
}

export async function updateAssetMetadata(assetId, { title, externalId, creatorId, passthrough } = {}) {
  if (!isMuxConfigured || !assetId) {
    return null;
  }

  const meta = Object.fromEntries(
    Object.entries({
      title: typeof title === "string" ? title.trim().slice(0, 512) : undefined,
      external_id: typeof externalId === "string" ? externalId.trim().slice(0, 128) : undefined,
      creator_id: typeof creatorId === "string" ? creatorId.trim().slice(0, 128) : undefined,
    }).filter(([, value]) => Boolean(value))
  );

  const payload = {};
  if (Object.keys(meta).length > 0) {
    payload.meta = meta;
  }
  if (typeof passthrough === "string" && passthrough.trim()) {
    payload.passthrough = passthrough.trim().slice(0, 255);
  }
  if (Object.keys(payload).length === 0) {
    return null;
  }

  const { video } = getMuxClient();
  return video.assets.update(assetId, payload);
}

export async function syncEpisodeMuxMetadata({ seriesId, seriesTitle, episode, creatorId } = {}) {
  const assetId = episode?.mux_asset_id;
  if (!isMuxConfigured || !assetId) {
    return null;
  }

  const s = String(episode?.seasonNumber ?? 1).padStart(2, "0");
  const e = String(episode?.epNumber ?? 0).padStart(2, "0");
  const epTitle = episode?.title ? `: ${episode.title}` : "";
  const title = `${seriesTitle || "Series"} - S${s}E${e}${epTitle}`.trim();
  const externalId =
    seriesId && episode?.episodeId ? `${seriesId}:${episode.episodeId}` : seriesId || episode?.episodeId;

  return updateAssetMetadata(assetId, {
    title,
    externalId,
    creatorId,
    passthrough: JSON.stringify({
      type: "episode",
      seriesId,
      episodeId: episode?.episodeId,
      season: Number(episode?.seasonNumber ?? 1),
      episode: Number(episode?.epNumber ?? 0),
    }),
  });
}

export async function listAssets({ limit = 10 } = {}) {
  const safeLimit = Math.max(1, Math.min(Number(limit) || 10, 100));
  if (!isMuxConfigured) {
    return [
      {
        id: "mock-asset",
        status: "ready",
        created_at: new Date().toISOString(),
        playback_ids: [
          {
            id: "mockplaybackid1234",
            policy: "public",
          },
        ],
      },
    ];
  }

  const { video } = getMuxClient();
  const assets = [];
  for await (const asset of video.assets.list({ limit: safeLimit })) {
    assets.push(asset);
    if (assets.length >= safeLimit) {
      break;
    }
  }
  return assets;
}

export async function getUploadStatus(uploadId) {
  if (!uploadId) {
    throw new Error("Upload ID wajib diisi.");
  }

  if (!isMuxConfigured) {
    return {
      id: uploadId,
      status: "ready",
      asset_id: "mock-asset",
    };
  }

  const { video } = getMuxClient();
  return video.uploads.retrieve(uploadId);
}

export async function getAsset(assetId) {
  if (!assetId) {
    throw new Error("Asset ID wajib diisi.");
  }

  if (!isMuxConfigured) {
    return {
      id: assetId,
      status: "ready",
      playback_ids: [
        {
          id: "mockplaybackid1234",
          policy: "public",
        },
      ],
    };
  }

  const { video } = getMuxClient();
  return video.assets.retrieve(assetId);
}

export async function deleteAsset(assetId) {
  if (!assetId) {
    throw new Error("Asset ID wajib diisi.");
  }

  if (!isMuxConfigured) {
    return { success: true };
  }

  const { video } = getMuxClient();
  await video.assets.delete(assetId);
  return { success: true };
}

async function waitForAssetReady(video, assetId, maxAttempts = 12, intervalMs = 2000) {
  let status = null;
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const asset = await video.assets.retrieve(assetId);
      status = asset?.status;
      if (status === "ready") return true;
      if (status === "errored") {
        throw new Error("Asset Mux berada dalam status errored.");
      }
    } catch (error) {
      const code = error?.status ?? error?.statusCode;
      if (code === 401 || code === 403 || code === 404 || error.message?.includes("errored")) {
        throw error;
      }
    }
    if (i < maxAttempts - 1) {
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
  return status === "ready";
}

async function createTrackOnReadyAsset(video, assetId, { url, language_code, name, closed_captions, type, text_type }) {
  try {
    if (typeof video?.assets?.createTrack === "function") {
      return await video.assets.createTrack(assetId, {
        url,
        type,
        text_type,
        language_code,
        name,
        closed_captions,
      });
    }
    if (typeof video?.textTracks?.create === "function") {
      return await video.textTracks.create(assetId, {
        url,
        type,
        text_type,
        language_code,
        name,
        closed_captions,
      });
    }
  } catch (sdkError) {
    const code = sdkError?.status ?? sdkError?.statusCode;
    if (code === 400 || code === 401 || code === 403 || code === 404) {
      throw sdkError;
    }
    console.error("[MUX DEBUG] SDK create failed, fallback to REST:", sdkError.message);
  }

  const endpoint = `https://api.mux.com/video/v1/assets/${assetId}/tracks`;
  const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");

  const body = JSON.stringify({ url, type, text_type, language_code, name, closed_captions });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw new Error(`Gagal membuat text track (${res.status}): ${text}`);
  }

  const json = JSON.parse(text || "{}");
  return json?.data ?? json;
}

export async function addTextTrack(
  assetId,
  url,
  language_code,
  name,
  closed_captions = false,
  type = "text",
  text_type = "subtitles"
) {
  if (!assetId) throw new Error("Asset ID wajib diisi.");
  if (!url) throw new Error("URL track wajib diisi.");

  if (!isMuxConfigured) {
    return {
      id: `mock-track-${Date.now()}`,
      asset_id: assetId,
      url,
      language_code,
      name,
      closed_captions,
      type,
      text_type,
    };
  }

  const { video } = getMuxClient();
  const isReady = await waitForAssetReady(video, assetId);
  if (!isReady) {
    throw new Error("Asset belum siap di Mux, tidak bisa menambah text track.");
  }

  return createTrackOnReadyAsset(video, assetId, {
    url,
    language_code,
    name,
    closed_captions,
    type,
    text_type,
  });
}

export async function addMultipleTextTracks(assetId, tracks = []) {
  if (!assetId) throw new Error("Asset ID wajib diisi.");
  if (!tracks.length) return [];

  if (!isMuxConfigured) {
    return tracks.map((t, idx) => ({
      ok: true,
      data: {
        id: `mock-track-${Date.now()}-${idx}`,
        asset_id: assetId,
        url: t.url,
        language_code: t.language_code ?? t.lang,
        name: t.name ?? t.label,
        closed_captions: t.closed_captions ?? false,
        type: t.type ?? "text",
        text_type: t.text_type ?? "subtitles",
      },
    }));
  }

  const { video } = getMuxClient();
  const isReady = await waitForAssetReady(video, assetId);
  if (!isReady) {
    return tracks.map(() => ({
      ok: false,
      error: "Asset belum siap di Mux, tidak bisa menambah text track.",
    }));
  }

  return Promise.all(
    tracks.map(async (t) => {
      try {
        const res = await createTrackOnReadyAsset(video, assetId, {
          url: t.url,
          language_code: t.language_code ?? t.lang,
          name: t.name ?? t.label,
          closed_captions: t.closed_captions ?? false,
          type: t.type ?? "text",
          text_type: t.text_type ?? "subtitles",
        });
        return { ok: true, data: res };
      } catch (error) {
        return { ok: false, error: error.message };
      }
    })
  );
}

async function lookupAssetIdByUploadId(candidate) {
  try {
    const { video } = getMuxClient() ?? {};
    if (!video?.uploads?.retrieve) return null;
    const upload = await video.uploads.retrieve(candidate);
    const assetId = upload?.asset_id ?? upload?.asset?.id ?? null;
    if (assetId) {
      return assetId;
    }
  } catch (error) {
    if (error?.status !== 404 && error?.statusCode !== 404) {
      console.warn("[MUX DEBUG] lookupAssetIdByUploadId error", candidate, error?.message ?? error);
    }
  }
  return null;
}

async function confirmAssetId(candidate) {
  try {
    const asset = await getAsset(candidate);
    if (asset?.id) {
      return asset.id;
    }
  } catch (error) {
    if (error?.status !== 404 && error?.statusCode !== 404) {
      console.warn("[MUX DEBUG] confirmAssetId error", candidate, error?.message ?? error);
    }
  }
  return null;
}

export async function resolveAssetId(rawInput) {
  const candidates = (Array.isArray(rawInput) ? rawInput : [rawInput])
    .map((value) => {
      if (typeof value === "string") return value.trim();
      if (value == null) return "";
      return String(value).trim();
    })
    .filter(Boolean);

  if (!candidates.length) {
    return null;
  }

  if (!isMuxConfigured) {
    return candidates[0];
  }

  for (const candidate of candidates) {
    if (!candidate) continue;

    const confirmed = await confirmAssetId(candidate);
    if (confirmed) {
      return confirmed;
    }

    const fromUpload = await lookupAssetIdByUploadId(candidate);
    if (fromUpload) {
      return fromUpload;
    }

    const resolved = await lookupAssetIdByPlayback(candidate);
    if (resolved) {
      return resolved;
    }
  }

  console.warn("[MUX DEBUG] Unable to resolve assetId from candidates", candidates);
  return null;
}

async function lookupAssetIdByPlayback(candidate) {
  try {
    const endpoint = `https://api.mux.com/video/v1/playback-ids/${encodeURIComponent(candidate)}`;
    const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");

    const res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    });

    const textBody = await res.text().catch(() => "");
    if (!res.ok) {
      if (res.status === 400 && /Asset ID/i.test(textBody ?? "")) {
        return await confirmAssetId(candidate);
      }
      return null;
    }

    let json = {};
    try {
      json = JSON.parse(textBody || "{}");
    } catch {
      return null;
    }

    return json?.data?.asset_id ?? json?.data?.object?.id ?? null;
  } catch (error) {
    console.warn("[MUX DEBUG] resolveAssetId error", candidate, error.message);
    return null;
  }
}

export async function normalizeMuxMetadata({ assetId, playbackId, videoId } = {}) {
  const assetCandidates = [assetId, videoId, playbackId];
  const resolvedAssetId = await resolveAssetId(assetCandidates);

  let resolvedPlaybackId = playbackId ?? videoId ?? null;
  let resolvedDuration = null;
  let playbackPolicy = null;

  if (resolvedAssetId && isMuxConfigured) {
    try {
      const asset = await getAsset(resolvedAssetId);
      const playbackIds = Array.isArray(asset?.playback_ids) ? asset.playback_ids : [];
      const expectedPolicy = process.env.MUX_PLAYBACK_POLICY === "public" ? "public" : "signed";

      const matched = resolvedPlaybackId
        ? playbackIds.find((pb) => pb?.id === resolvedPlaybackId)
        : null;

      if (matched) {
        resolvedPlaybackId = matched.id;
        playbackPolicy = matched.policy ?? null;
      } else {
        const preferred =
          playbackIds.find((pb) => pb?.policy === expectedPolicy) ??
          playbackIds[0] ??
          null;
        if (preferred?.id) {
          resolvedPlaybackId = preferred.id;
          playbackPolicy = preferred.policy ?? null;
        }
      }

      if (typeof asset?.duration === "number" && Number.isFinite(asset.duration)) {
        resolvedDuration = Math.round(asset.duration);
      }
    } catch (err) {
      console.warn("[MUX DEBUG] normalizeMuxMetadata asset lookup failed", err?.message ?? err);
    }
  }

  const finalPlaybackId = resolvedPlaybackId ?? null;
  const finalVideoId = videoId ?? finalPlaybackId ?? null;

  return {
    assetId: resolvedAssetId ?? null,
    playbackId: finalPlaybackId,
    videoId: finalVideoId,
    playbackPolicy,
    duration: resolvedDuration,
  };
}

// ====================================================================
// Mux Cost & Usage Monitoring (Server-side only)
// ====================================================================
const MUX_PAYG_PRICING = {
  MONTHLY_CREDIT_USD: 20.0,
  FREE_DELIVERY_MINUTES: 100000,
  STORAGE_PER_MIN_AUDIO: 0.0012,
  STORAGE_PER_MIN_720P: 0.0024,
  STORAGE_PER_MIN_1080P: 0.003,
  STORAGE_PER_MIN_4K: 0.0096,
  DELIVERY_PER_MIN_AUDIO: 0.0004,
  DELIVERY_PER_MIN_720P: 0.0008,
  DELIVERY_PER_MIN_1080P: 0.001,
  DELIVERY_PER_MIN_4K: 0.0032,
  COLD_STORAGE_DISCOUNT_INFREQUENT: 0.4,
  COLD_STORAGE_DISCOUNT_COLD: 0.6,
};

function normalizeVideoQuality(asset) {
  const raw = String(asset?.video_quality ?? asset?.encoding_tier ?? "basic").toLowerCase();
  if (raw === "baseline" || raw === "basic") return "basic";
  if (raw === "smart" || raw === "plus") return "plus";
  if (raw === "premium") return "premium";
  return raw;
}

function normalizeResolutionTier(asset) {
  const tier = String(asset?.resolution_tier ?? "").toLowerCase();
  if (tier === "720p" || tier === "1080p" || tier === "1440p" || tier === "2160p" || tier === "audio-only") {
    return tier;
  }
  const maxRes = String(asset?.max_stored_resolution ?? "").toLowerCase();
  if (maxRes === "audio-only") return "audio-only";
  if (maxRes === "sd" || maxRes === "hd") return "720p";
  if (maxRes === "fhd") return "1080p";
  if (maxRes === "uhd") return "2160p";
  const tracks = Array.isArray(asset?.tracks) ? asset.tracks : [];
  const videoTrack = tracks.find((t) => t?.type === "video");
  const audioTrack = tracks.find((t) => t?.type === "audio");
  if (!videoTrack && audioTrack) return "audio-only";
  const height = Number(videoTrack?.max_height ?? 0);
  if (height > 1440) return "2160p";
  if (height > 1080) return "1440p";
  if (height > 720) return "1080p";
  if (height > 0) return "720p";
  return "720p";
}

function storageRateForResolution(resTier, quality = "basic") {
  let baseRate = MUX_PAYG_PRICING.STORAGE_PER_MIN_720P;
  if (resTier === "audio-only") {
    baseRate = MUX_PAYG_PRICING.STORAGE_PER_MIN_AUDIO;
  } else if (resTier === "2160p" || resTier === "1440p") {
    baseRate = MUX_PAYG_PRICING.STORAGE_PER_MIN_4K;
  } else if (resTier === "1080p") {
    baseRate = MUX_PAYG_PRICING.STORAGE_PER_MIN_1080P;
  }
  // Plus/Premium quality carries higher storage overhead than Basic
  if (quality === "plus") return baseRate * 1.5;
  if (quality === "premium") return baseRate * 2;
  return baseRate;
}

async function fetchMonthlyDeliveryUsage(startUnix, endUnix) {
  const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");
  const records = [];
  const maxPages = 200;
  let truncated = false;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL("https://api.mux.com/video/v1/delivery-usage");
    url.searchParams.append("timeframe[]", String(startUnix));
    url.searchParams.append("timeframe[]", String(endUnix));
    url.searchParams.set("limit", "100");
    url.searchParams.set("page", String(page));

    const res = await fetch(url.toString(), {
      method: "GET",
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      throw new Error(`Mux delivery-usage API error (${res.status}): ${errText}`);
    }

    const json = await res.json().catch(() => ({}));
    const items = Array.isArray(json?.data) ? json.data : [];
    records.push(...items);
    if (items.length < 100) break;
    if (page === maxPages) truncated = true;
  }

  return { records, truncated };
}

export async function getMuxCostReport() {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  const startUnix = Math.floor(periodStart.getTime() / 1000);
  const endUnix = Math.floor(now.getTime() / 1000);

  if (!isMuxConfigured) {
    return {
      configured: false,
      generatedAt: now.toISOString(),
      billingPeriod: {
        start: periodStart.toISOString(),
        end: now.toISOString(),
      },
      summary: {
        totalAssets: 0,
        totalStoredMinutes: 0,
        basic720p: { count: 0, minutes: 0 },
        basic1080p: { count: 0, minutes: 0 },
        basicOther: { count: 0, minutes: 0 },
        plusOrPremium: { count: 0, minutes: 0, assets: [] },
        storageTiers: {
          availableFromApi: false,
          standard: { count: 0, minutes: 0 },
          infrequent: { count: 0, minutes: 0 },
          cold: { count: 0, minutes: 0 },
        },
        storageEstimateUsd: 0,
        delivery: {
          totalMinutes: 0,
          freeQuotaMinutes: MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES,
          remainingFreeMinutes: MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES,
          billableMinutes: 0,
          tier720pMinutes: 0,
          tier1080pMinutes: 0,
          audioOnlyMinutes: 0,
          otherMinutes: 0,
          estimatedCostUsd: 0,
        },
        creditTotalUsd: MUX_PAYG_PRICING.MONTHLY_CREDIT_USD,
        totalEstimatedUsageUsd: 0,
        remainingCreditUsd: MUX_PAYG_PRICING.MONTHLY_CREDIT_USD,
        estimatedInvoiceUsd: 0,
      },
      pricingAssumptions: MUX_PAYG_PRICING,
    };
  }

  const { video } = getMuxClient();
  const MAX_ASSET_PAGES = 50;
  const MAX_ASSETS = MAX_ASSET_PAGES * 100;
  const assets = [];
  let assetsTruncated = false;
  for await (const asset of video.assets.list({ limit: 100 })) {
    assets.push(asset);
    if (assets.length >= MAX_ASSETS) {
      assetsTruncated = true;
      break;
    }
  }

  const basic720p = { count: 0, minutes: 0 };
  const basic1080p = { count: 0, minutes: 0 };
  const basicOther = { count: 0, minutes: 0 };
  const plusOrPremium = { count: 0, minutes: 0, assets: [] };
  const storageTiers = {
    availableFromApi: false,
    standard: { count: 0, minutes: 0 },
    infrequent: { count: 0, minutes: 0 },
    cold: { count: 0, minutes: 0 },
  };

  let totalStoredMinutes = 0;
  let storageEstimateUsd = 0;

  for (const asset of assets) {
    const minutes = Number(asset?.duration ?? 0) / 60;
    const quality = normalizeVideoQuality(asset);
    const resTier = normalizeResolutionTier(asset);
    totalStoredMinutes += minutes;

    if (quality === "basic") {
      if (resTier === "720p") {
        basic720p.count += 1;
        basic720p.minutes += minutes;
      } else if (resTier === "1080p") {
        basic1080p.count += 1;
        basic1080p.minutes += minutes;
      } else {
        basicOther.count += 1;
        basicOther.minutes += minutes;
      }
    } else {
      plusOrPremium.count += 1;
      plusOrPremium.minutes += minutes;
      if (plusOrPremium.assets.length < 25) {
        plusOrPremium.assets.push({
          id: asset.id,
          quality,
          resolutionTier: resTier,
          minutes: Number(minutes.toFixed(2)),
          title: asset?.meta?.title ?? null,
        });
      }
    }

    let discountMultiplier = 1;
    const rawTier = String(asset?.storage_tier ?? "").toLowerCase();
    if (rawTier === "cold" || rawTier === "infrequent" || rawTier === "standard") {
      storageTiers.availableFromApi = true;
      storageTiers[rawTier].count += 1;
      storageTiers[rawTier].minutes += minutes;
      if (rawTier === "infrequent") discountMultiplier = 1 - MUX_PAYG_PRICING.COLD_STORAGE_DISCOUNT_INFREQUENT;
      if (rawTier === "cold") discountMultiplier = 1 - MUX_PAYG_PRICING.COLD_STORAGE_DISCOUNT_COLD;
    } else {
      storageTiers.standard.count += 1;
      storageTiers.standard.minutes += minutes;
    }

    storageEstimateUsd += minutes * storageRateForResolution(resTier, quality) * discountMultiplier;
  }

  let deliveryRecords = [];
  let deliveryTruncated = false;
  let deliveryError = null;
  try {
    const res = await fetchMonthlyDeliveryUsage(startUnix, endUnix);
    deliveryRecords = res.records;
    deliveryTruncated = res.truncated;
  } catch (err) {
    deliveryError = err?.message ?? "Gagal memuat delivery-usage";
    console.warn("[MUX COST REPORT] delivery-usage warning:", deliveryError);
  }

  let totalDeliveredSeconds = 0;
  let sec720p = 0;
  let sec1080p = 0;
  let secAudio = 0;
  let sec4k = 0;
  let secUnclassified = 0;

  for (const rec of deliveryRecords) {
    const delivered = Number(rec?.delivered_seconds ?? 0);
    totalDeliveredSeconds += delivered;
    const byRes = rec?.delivered_seconds_by_resolution ?? {};
    const s1080 = Number(byRes.tier_1080p ?? 0);
    const s720 = Number(byRes.tier_720p ?? 0);
    const sAudio = Number(byRes.tier_audio_only ?? 0);
    const s1440 = Number(byRes.tier_1440p ?? 0);
    const s2160 = Number(byRes.tier_2160p ?? 0);
    const known = s1080 + s720 + sAudio + s1440 + s2160;
    sec1080p += s1080;
    sec720p += s720;
    secAudio += sAudio;
    sec4k += s1440 + s2160;
    secUnclassified += Math.max(0, delivered - known);
  }

  const totalDeliveryMinutes = totalDeliveredSeconds / 60;
  const tier720pMinutes = sec720p / 60;
  const tier1080pMinutes = sec1080p / 60;
  const audioOnlyMinutes = secAudio / 60;
  const tier4kMinutes = sec4k / 60;
  const unclassifiedMinutes = secUnclassified / 60;
  const otherMinutes = tier4kMinutes + unclassifiedMinutes;
  const remainingFreeMinutes = Math.max(0, MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES - totalDeliveryMinutes);
  const billableMinutes = Math.max(0, totalDeliveryMinutes - MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES);

  let deliveryCostUsd = 0;
  if (billableMinutes > 0 && totalDeliveryMinutes > 0) {
    const share1080 = tier1080pMinutes / totalDeliveryMinutes;
    const share720 = tier720pMinutes / totalDeliveryMinutes;
    const shareAudio = audioOnlyMinutes / totalDeliveryMinutes;
    const share4k = tier4kMinutes / totalDeliveryMinutes;
    const shareUnclassified = unclassifiedMinutes / totalDeliveryMinutes;
    deliveryCostUsd =
      billableMinutes * share1080 * MUX_PAYG_PRICING.DELIVERY_PER_MIN_1080P +
      billableMinutes * share720 * MUX_PAYG_PRICING.DELIVERY_PER_MIN_720P +
      billableMinutes * shareAudio * MUX_PAYG_PRICING.DELIVERY_PER_MIN_AUDIO +
      billableMinutes * share4k * MUX_PAYG_PRICING.DELIVERY_PER_MIN_4K +
      billableMinutes * shareUnclassified * MUX_PAYG_PRICING.DELIVERY_PER_MIN_1080P;
  }

  const totalEstimatedUsageUsd = storageEstimateUsd + deliveryCostUsd;
  const remainingCreditUsd = Math.max(0, MUX_PAYG_PRICING.MONTHLY_CREDIT_USD - totalEstimatedUsageUsd);
  const estimatedInvoiceUsd = Math.max(0, totalEstimatedUsageUsd - MUX_PAYG_PRICING.MONTHLY_CREDIT_USD);

  const round2 = (n) => Math.round(n * 100) / 100;
  const round4 = (n) => Math.round(n * 10000) / 10000;

  return {
    configured: true,
    generatedAt: now.toISOString(),
    billingPeriod: {
      start: periodStart.toISOString(),
      end: now.toISOString(),
    },
    assetsTruncated,
    deliveryError,
    deliveryTruncated,
    summary: {
      totalAssets: assets.length,
      totalStoredMinutes: round2(totalStoredMinutes),
      basic720p: { count: basic720p.count, minutes: round2(basic720p.minutes) },
      basic1080p: { count: basic1080p.count, minutes: round2(basic1080p.minutes) },
      basicOther: { count: basicOther.count, minutes: round2(basicOther.minutes) },
      plusOrPremium: {
        count: plusOrPremium.count,
        minutes: round2(plusOrPremium.minutes),
        assets: plusOrPremium.assets,
      },
      storageTiers: {
        availableFromApi: storageTiers.availableFromApi,
        standard: { count: storageTiers.standard.count, minutes: round2(storageTiers.standard.minutes) },
        infrequent: { count: storageTiers.infrequent.count, minutes: round2(storageTiers.infrequent.minutes) },
        cold: { count: storageTiers.cold.count, minutes: round2(storageTiers.cold.minutes) },
      },
      storageEstimateUsd: round4(storageEstimateUsd),
      delivery: {
        totalMinutes: round2(totalDeliveryMinutes),
        freeQuotaMinutes: MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES,
        remainingFreeMinutes: round2(remainingFreeMinutes),
        billableMinutes: round2(billableMinutes),
        tier720pMinutes: round2(tier720pMinutes),
        tier1080pMinutes: round2(tier1080pMinutes),
        audioOnlyMinutes: round2(audioOnlyMinutes),
        otherMinutes: round2(otherMinutes),
        estimatedCostUsd: round4(deliveryCostUsd),
      },
      creditTotalUsd: MUX_PAYG_PRICING.MONTHLY_CREDIT_USD,
      totalEstimatedUsageUsd: round4(totalEstimatedUsageUsd),
      remainingCreditUsd: round4(remainingCreditUsd),
      estimatedInvoiceUsd: round4(estimatedInvoiceUsd),
    },
    pricingAssumptions: MUX_PAYG_PRICING,
  };
}
