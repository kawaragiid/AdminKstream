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

  const normalizedMeta = meta && typeof meta === "object"
    ? Object.fromEntries(
        Object.entries({
          title: typeof meta.title === "string" ? meta.title.trim().slice(0, 512) : undefined,
          creator_id: typeof meta.creator_id === "string" ? meta.creator_id.trim().slice(0, 128) : undefined,
          external_id: typeof meta.external_id === "string" ? meta.external_id.trim().slice(0, 128) : undefined,
        }).filter(([, value]) => Boolean(value))
      )
    : undefined;

  const { video } = getMuxClient();
  return video.uploads.create({
    timeout: ttl,
    new_asset_settings: {
      playback_policy: playbackPolicy,
      video_quality: videoQuality,
      max_resolution_tier: maxResolutionTier,
      passthrough,
      ...(normalizedMeta && Object.keys(normalizedMeta).length ? { meta: normalizedMeta } : {}),
    },
    cors_origin: corsOrigin || "*",
  });
}

export async function updateAssetMetadata(assetId, { title, externalId, creatorId } = {}) {
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
  const externalId = seriesId && episode?.episodeId ? `${seriesId}:${episode.episodeId}` : seriesId || episode?.episodeId;

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
export async function addTextTrack(assetId, url, language_code, name, closed_captions = false, type = "text", text_type = "subtitles") {
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

  // Polling status asset sampai "ready" sebelum request text track
  let status = null;
  for (let i = 0; i < 15; i++) {
    // max ~30s
    try {
      const asset = await video.assets.retrieve(assetId);
      status = asset?.status;
      if (status === "ready") break;
    } catch {}
    await new Promise((r) => setTimeout(r, 2000));
  }
  if (status !== "ready") throw new Error("Asset belum siap di Mux, tidak bisa menambah text track.");

  try {
    // Gunakan SDK langsung jika ada
    if (video?.textTracks?.create) {
      console.log("[MUX DEBUG] Using SDK textTracks.create()");
      const track = await video.textTracks.create(assetId, {
        url,
        type,
        text_type,
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
      const res = await addTextTrack(
        assetId,
        t.url,
        t.language_code ?? t.lang,
        t.name ?? t.label,
        t.closed_captions ?? false,
        t.type ?? "text",
        t.text_type ?? "subtitles"
      );
      results.push({ ok: true, data: res });
    } catch (error) {
      results.push({ ok: false, error: error.message });
    }
  }
  return results;
}

async function lookupAssetIdByUploadId(candidate) {
  try {
    const { video } = getMuxClient() ?? {};
    if (!video?.uploads?.retrieve) return null;
    const upload = await video.uploads.retrieve(candidate);
    const assetId = upload?.asset_id ?? upload?.asset?.id ?? null;
    if (assetId) {
      console.log("[MUX DEBUG] Resolved assetId from uploadId:", candidate, "->", assetId);
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
    if (/^asst_/i.test(candidate)) {
      return candidate;
    }

    const confirmed = await confirmAssetId(candidate);
    if (confirmed) {
      if (confirmed !== candidate) {
        console.log("[MUX DEBUG] Normalized provided assetId:", candidate, "->", confirmed);
      }
      return confirmed;
    }

    const fromUpload = await lookupAssetIdByUploadId(candidate);
    if (fromUpload) {
      return fromUpload;
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
  let resolvedDuration = null;

  if (resolvedAssetId && isMuxConfigured) {
    try {
      const asset = await getAsset(resolvedAssetId);
      if (!resolvedPlaybackId) {
        const playbackFromAsset = asset?.playback_ids?.find((pb) => pb?.policy === "public")?.id ?? asset?.playback_ids?.[0]?.id ?? null;
        if (playbackFromAsset) {
          resolvedPlaybackId = playbackFromAsset;
        }
      }
      if (typeof asset?.duration === "number" && Number.isFinite(asset.duration)) {
        resolvedDuration = Math.round(asset.duration);
      }
    } catch (err) {
      console.warn("[MUX DEBUG] normalizeMuxMetadata asset lookup failed", err?.message ?? err);
    }
  }

  const finalPlaybackId = resolvedPlaybackId ?? playbackId ?? videoId ?? null;
  const finalVideoId = finalPlaybackId ?? videoId ?? playbackId ?? null;

  return {
    assetId: resolvedAssetId ?? assetId ?? null,
    playbackId: finalPlaybackId ?? null,
    videoId: finalVideoId ?? null,
    duration: resolvedDuration,
  };
}

// ====================================================================
// Mux Cost & Usage Monitoring (Server-side only)
// ====================================================================
const MUX_PAYG_PRICING = {
  MONTHLY_CREDIT_USD: 20.0,
  FREE_DELIVERY_MINUTES: 100000,
  STORAGE_PER_MIN_720P: 0.0024,
  STORAGE_PER_MIN_1080P: 0.003, // 1.25x 720p
  STORAGE_PER_MIN_4K: 0.0096, // ~4x 720p
  DELIVERY_PER_MIN_720P: 0.0008,
  DELIVERY_PER_MIN_1080P: 0.001, // 1.25x 720p
  COLD_STORAGE_DISCOUNT_INFREQUENT: 0.4, // 40% off (>30 hari)
  COLD_STORAGE_DISCOUNT_COLD: 0.6, // 60% off (>90 hari)
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
  if (maxRes === "sd" || maxRes === "hd") return "720p";
  if (maxRes === "fhd") return "1080p";
  if (maxRes === "uhd") return "2160p";
  const videoTrack = Array.isArray(asset?.tracks) ? asset.tracks.find((t) => t?.type === "video") : null;
  const height = Number(videoTrack?.max_height ?? 0);
  if (height > 1440) return "2160p";
  if (height > 1080) return "1440p";
  if (height > 720) return "1080p";
  if (height > 0) return "720p";
  return "720p";
}

function storageRateForResolution(resTier) {
  if (resTier === "2160p" || resTier === "1440p") return MUX_PAYG_PRICING.STORAGE_PER_MIN_4K;
  if (resTier === "1080p") return MUX_PAYG_PRICING.STORAGE_PER_MIN_1080P;
  return MUX_PAYG_PRICING.STORAGE_PER_MIN_720P;
}

async function fetchMonthlyDeliveryUsage(startUnix, endUnix) {
  const auth = Buffer.from(`${process.env.MUX_TOKEN_ID}:${process.env.MUX_TOKEN_SECRET}`).toString("base64");
  const records = [];
  const maxPages = 20;

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
  }

  return records;
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
  const assets = [];
  for await (const asset of video.assets.list({ limit: 100 })) {
    assets.push(asset);
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

    storageEstimateUsd += minutes * storageRateForResolution(resTier) * discountMultiplier;
  }

  let deliveryRecords = [];
  let deliveryError = null;
  try {
    deliveryRecords = await fetchMonthlyDeliveryUsage(startUnix, endUnix);
  } catch (err) {
    deliveryError = err?.message ?? "Gagal memuat delivery-usage";
    console.warn("[MUX COST REPORT] delivery-usage warning:", deliveryError);
  }

  let totalDeliveredSeconds = 0;
  let sec720p = 0;
  let sec1080p = 0;
  let secOther = 0;

  for (const rec of deliveryRecords) {
    const delivered = Number(rec?.delivered_seconds ?? 0);
    totalDeliveredSeconds += delivered;
    const byRes = rec?.delivered_seconds_by_resolution ?? {};
    const s1080 = Number(byRes.tier_1080p ?? 0);
    const s720 = Number(byRes.tier_720p ?? 0);
    const sAudio = Number(byRes.tier_audio_only ?? 0);
    const known = s1080 + s720 + sAudio;
    sec1080p += s1080;
    sec720p += s720 + sAudio;
    if (delivered > known) {
      secOther += delivered - known;
    }
  }

  const totalDeliveryMinutes = totalDeliveredSeconds / 60;
  const tier720pMinutes = sec720p / 60;
  const tier1080pMinutes = sec1080p / 60;
  const otherMinutes = secOther / 60;
  const remainingFreeMinutes = Math.max(0, MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES - totalDeliveryMinutes);
  const billableMinutes = Math.max(0, totalDeliveryMinutes - MUX_PAYG_PRICING.FREE_DELIVERY_MINUTES);

  let deliveryCostUsd = 0;
  if (billableMinutes > 0 && totalDeliveryMinutes > 0) {
    const share1080 = tier1080pMinutes / totalDeliveryMinutes;
    const shareOther = 1 - share1080;
    deliveryCostUsd =
      billableMinutes * share1080 * MUX_PAYG_PRICING.DELIVERY_PER_MIN_1080P +
      billableMinutes * shareOther * MUX_PAYG_PRICING.DELIVERY_PER_MIN_720P;
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
    deliveryError,
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
