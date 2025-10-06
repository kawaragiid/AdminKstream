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
  // Mux API mengharuskan track berformat VTT dan dapat diakses publik melalui URL
  if (video?.textTracks?.create) {
    return video.textTracks.create(assetId, {
      url,
      type,
      language_code,
      name,
      closed_captions,
    });
  }

  // Fallback ke REST API bila SDK tidak expose helper textTracks
  const endpoint = `https://api.mux.com/video/v1/assets/${assetId}/text-tracks`;
  const tokenId = process.env.MUX_TOKEN_ID;
  const tokenSecret = process.env.MUX_TOKEN_SECRET;
  const auth = Buffer.from(`${tokenId}:${tokenSecret}`).toString("base64");
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url, type, language_code, name, closed_captions }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Gagal membuat text track (${res.status}). ${text}`);
  }
  const json = await res.json();
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
