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

export async function createDirectUpload({
  playbackPolicy = ["public"],
  ttl = 3600,
  passthrough,
  corsOrigin,
} = {}) {
  if (!isMuxConfigured) {
    return {
      id: `mock-upload-${Date.now()}`,
      url: "https://stream.mux.com/mock-direct-upload",
      status: "waiting",
      new_asset_settings: {
        playback_policy: playbackPolicy,
      },
      playback_ids: [
        {
          id: "mockplaybackid1234",
          policy: "public",
        },
      ],
    };
  }

  const { video } = getMuxClient();
  return video.uploads.create({
    timeout: ttl,
    new_asset_settings: {
      playback_policy: playbackPolicy,
      passthrough,
    },
    cors_origin: corsOrigin || "*",
  });
}

export async function listAssets({ limit = 10 } = {}) {
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
  for await (const asset of video.assets.list({ limit })) {
    assets.push(asset);
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

// Tambah text tracks (subtitle/captions) ke asset yang sudah ada.
export async function addTextTrack(assetId, {
  url,
  language_code,
  name,
  closed_captions = false,
  type = "subtitles",
} = {}) {
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
    };
  }

  const { video } = getMuxClient();

  try {
    // Gunakan SDK langsung jika ada
    if (video?.textTracks?.create) {
      console.log("[MUX DEBUG] Using SDK textTracks.create()");
      const track = await video.textTracks.create(assetId, {
        url,
        type,
        language_code,
        name,
        closed_captions,
      });
      console.log("[MUX DEBUG] Track created via SDK:", track?.id);
      return track;
    }
  } catch (sdkError) {
    console.error("[MUX DEBUG] SDK create failed, fallback to REST:", sdkError.message);
  }

  // Fallback ke REST API manual
  console.log("[MUX DEBUG] Fallback to REST API for text track...");
  const endpoint = `https://api.mux.com/video/v1/assets/${assetId}/text-tracks`;
  const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");

  const body = JSON.stringify({ url, type, language_code, name, closed_captions });
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body,
  });

  const text = await res.text().catch(() => "");
  if (!res.ok) {
    console.error("[MUX DEBUG] REST API error", res.status, text);
    throw new Error(`Gagal membuat text track (${res.status}): ${text}`);
  }

  const json = JSON.parse(text || "{}");
  console.log("[MUX DEBUG] REST API success:", json);
  return json?.data ?? json;
}

export async function addMultipleTextTracks(assetId, tracks = []) {
  const results = [];
  for (const t of tracks) {
    try {
      const res = await addTextTrack(assetId, t);
      results.push({ ok: true, data: res });
    } catch (error) {
      results.push({ ok: false, error: error.message });
    }
  }
  return results;
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
    if (/^asst_/i.test(candidate)) {
      return candidate;
    }

    const resolved = await lookupAssetIdByPlayback(candidate);
    if (resolved) {
      if (resolved !== candidate) {
        console.log("[MUX DEBUG] Resolved assetId from candidate:", candidate, "->", resolved);
      } else if (!/^asst_/i.test(resolved)) {
        console.log("[MUX DEBUG] Using provided assetId:", resolved);
      }
      return resolved;
    }
  }

  console.warn("[MUX DEBUG] Unable to resolve assetId from candidates", candidates);
  return null;
}

async function lookupAssetIdByPlayback(candidate) {
  try {
    const endpoint = `https://api.mux.com/video/v1/playback-ids/${candidate}`;
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
        console.warn("[MUX DEBUG] resolveAssetId lookup indicates asset id", candidate);
        return candidate;
      }
      console.warn("[MUX DEBUG] resolveAssetId lookup failed", candidate, res.status, textBody);
      return null;
    }

    let json = {};
    try {
      json = JSON.parse(textBody || "{}");
    } catch (parseError) {
      console.warn("[MUX DEBUG] resolveAssetId JSON parse error", candidate, parseError.message);
      return null;
    }

    const resolved = json?.data?.asset_id ?? json?.data?.object?.id ?? null;
    if (!resolved) {
      console.warn("[MUX DEBUG] resolveAssetId missing asset_id in response", candidate, json);
      return null;
    }
    return resolved;
  } catch (error) {
    console.warn("[MUX DEBUG] resolveAssetId error", candidate, error.message);
    return null;
  }
}

export async function normalizeMuxMetadata({ assetId, playbackId, videoId } = {}) {
  const assetCandidates = [assetId, videoId, playbackId];
  const resolvedAssetId = await resolveAssetId(assetCandidates);

  let resolvedPlaybackId = playbackId ?? videoId ?? null;

  if (!resolvedPlaybackId && resolvedAssetId) {
    if (!isMuxConfigured) {
      resolvedPlaybackId = playbackId ?? videoId ?? null;
    } else {
      try {
        const asset = await getAsset(resolvedAssetId);
        const playbackFromAsset = asset?.playback_ids?.find((pb) => pb?.policy === "public")?.id
          ?? asset?.playback_ids?.[0]?.id
          ?? null;
        if (playbackFromAsset) {
          resolvedPlaybackId = playbackFromAsset;
        }
      } catch (err) {
        console.warn("[MUX DEBUG] normalizeMuxMetadata asset lookup failed", err?.message ?? err);
      }
    }
  }

  const finalPlaybackId = resolvedPlaybackId ?? playbackId ?? videoId ?? null;
  const finalVideoId = finalPlaybackId ?? videoId ?? playbackId ?? null;

  return {
    assetId: resolvedAssetId ?? assetId ?? null,
    playbackId: finalPlaybackId ?? null,
    videoId: finalVideoId ?? null,
  };
}
