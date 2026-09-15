/**
 * Asset Mapping — API client for the Assets tab.
 *
 * Online-only by design: the nameplate step is the backend reading the photo
 * with Claude (Bedrock) and answering on the spot, so there's nothing useful
 * to queue offline. Photos go to S3 through the usual presigned PUT, then
 * their URLs are posted to the mapping endpoints.
 *
 * Separate from asset status and every other asset flow — see
 * backend/services/rbac/src/repositories/assetMappingRepository.ts.
 */
import { API_URL } from "@/constants/api";
import { apiFetch } from "@/utils/apiHelper";
import { StorageService } from "@/services/StorageService";
import logger from "@/utils/logger";

export type MappingStatus = "pending" | "mapped" | "no_access";

export type NameplateQualityIssue =
  | "blurry"
  | "glare"
  | "too_dark"
  | "cropped"
  | "not_a_nameplate";

export interface NameplateData {
  state: "ok" | "manual" | "failed";
  text: string;
  raw_text: string;
  fields: { label: string; value: string }[];
  tag_no: string;
  extracted_by_model: string;
  saved_at: string;
}

export interface MappedAsset {
  asset_id: string;
  site_code: string;
  asset_name: string;
  asset_type: string | null;
  equipment_type: string | null;
  location: string | null;
  floor: string | null;
  qr_id: string | null;
  mapping_status: MappingStatus;
  data_pending: boolean;
  nameplate_photo_url: string | null;
  nameplate_data: NameplateData | null;
  nameplate_captured_at: string | null;
  nameplate_captured_by_name: string | null;
  location_photo_url: string | null;
  location_captured_at: string | null;
  location_captured_by_name: string | null;
  no_access_reason: string | null;
  no_access_notes: string | null;
  no_access_proof_url: string | null;
  no_access_logged_at: string | null;
  no_access_logged_by_name: string | null;
}

export type ScanResult =
  | { outcome: "poor_quality"; issues: NameplateQualityIssue[] }
  | { outcome: "failed"; asset: MappedAsset }
  | { outcome: "ok"; text: string; raw_text: string; point_count: number; tag_no: string };

export type PhotoKind = "nameplate" | "location" | "no-access";

/** Upload + Claude read of a phone photo routinely takes 10–30s. */
const SCAN_TIMEOUT_MS = 90_000;

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || body?.message || fallback;
  } catch {
    return fallback;
  }
}

async function post<T>(path: string, body: unknown, fallback: string, timeout?: number): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(
      `${API_URL}${path}`,
      { method: "POST", body: JSON.stringify(body) },
      timeout,
    );
  } catch (error: any) {
    logger.error("Asset mapping request failed", {
      module: "ASSET_MAPPING",
      path,
      error: error?.message,
    });
    throw new Error("Couldn't reach the server. Check your connection and try again.");
  }
  if (!res.ok) throw new Error(await readError(res, fallback));
  const json = await res.json();
  if (!json?.data) throw new Error(fallback);
  return json.data as T;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

export const AssetMappingService = {
  async getSiteAssets(siteCode: string): Promise<MappedAsset[]> {
    const res = await apiFetch(
      `${API_URL}/assets/site/${encodeURIComponent(siteCode)}/mapping`,
    );
    if (!res.ok) throw new Error(await readError(res, "Couldn't load assets."));
    const body = await res.json();
    return Array.isArray(body?.data) ? body.data : [];
  },

  /** Upload a captured photo to S3 and return its public URL. */
  async uploadPhoto(asset: MappedAsset, kind: PhotoKind, localUri: string): Promise<string> {
    const ext = (localUri.split("?")[0]?.split(".").pop() || "jpg").toLowerCase();
    const key = `asset-mapping/${safe(asset.site_code)}/${safe(asset.asset_id)}/${kind}-${Date.now()}.${
      ["jpg", "jpeg", "png", "webp"].includes(ext) ? ext : "jpg"
    }`;
    const url = await StorageService.uploadFile("", key, localUri);
    if (!url) {
      throw new Error("Couldn't upload the photo. Check your connection and try again.");
    }
    return url;
  },

  scanNameplate(assetId: string, photoUrl: string, acceptPoorQuality = false) {
    return post<ScanResult>(
      `/assets/${encodeURIComponent(assetId)}/mapping/nameplate/scan`,
      { photo_url: photoUrl, accept_poor_quality: acceptPoorQuality },
      "Couldn't read this nameplate. Please try again.",
      SCAN_TIMEOUT_MS,
    );
  },

  confirmNameplate(assetId: string, input: { photoUrl: string; text: string; manual: boolean }) {
    return post<MappedAsset>(
      `/assets/${encodeURIComponent(assetId)}/mapping/nameplate/confirm`,
      { photo_url: input.photoUrl, text: input.text, manual: input.manual },
      "Couldn't save the nameplate data.",
    );
  },

  saveLocation(assetId: string, photoUrl: string) {
    return post<MappedAsset>(
      `/assets/${encodeURIComponent(assetId)}/mapping/location`,
      { photo_url: photoUrl },
      "Couldn't save the location photo.",
    );
  },

  logNoAccess(assetId: string, input: { reason: string; notes: string; proofPhotoUrl: string }) {
    return post<MappedAsset>(
      `/assets/${encodeURIComponent(assetId)}/mapping/no-access`,
      { reason: input.reason, notes: input.notes, proof_photo_url: input.proofPhotoUrl },
      "Couldn't log this asset as non-accessible.",
    );
  },
};

export default AssetMappingService;
