/**
 * Asset Mapping — API client for the Assets tab.
 *
 * Online-only by design. Photos go to S3 through the usual presigned PUT,
 * then their URLs are posted to the mapping endpoints. A nameplate upload
 * returns at once — the backend reads it with Claude (Bedrock) in the
 * background and pushes the result ("read" or "couldn't be read") to the
 * uploader.
 *
 * Separate from asset status and every other asset flow — see
 * backend/services/rbac/src/repositories/assetMappingRepository.ts.
 */
import { API_URL } from "@/constants/api";
import { apiFetch } from "@/utils/apiHelper";
import { StorageService } from "@/services/StorageService";
import logger from "@/utils/logger";

/**
 * This flow's own status (not the asset's status):
 *   pending   — waiting for photos / nameplate data (or the nameplate is
 *               still being read — `nameplate_processing`)
 *   review    — documented, waiting for a manager's approval
 *   completed — approved
 *   failed    — the AI couldn't read the nameplate; re-upload it
 *   no_access — logged as non-accessible with proof
 */
export type MappingStatus = "pending" | "review" | "completed" | "failed" | "no_access";

/** Roles that may approve review → completed (superadmins always can). */
export const MAPPING_APPROVER_ROLES = ["manager", "regional_manager", "admin", "superadmin"];

export const canApproveMapping = (user: { role?: string | null; is_superadmin?: boolean } | null | undefined) =>
  !!user && (!!user.is_superadmin || MAPPING_APPROVER_ROLES.includes(String(user.role ?? "").toLowerCase()));

export interface NameplateData {
  state: "processing" | "ok" | "manual" | "failed";
  failure_reason?: string;
  text: string;
  raw_text: string;
  fields: { label: string; value: string }[];
  tag_no: string;
  extracted_by_model: string;
  saved_at: string;
}

/** A piece of equipment documented under an asset. */
export interface MappingEquipment {
  id: string;
  asset_id: string;
  name: string;
  nameplate_photo_url: string | null;
  nameplate_data: NameplateData | null;
  photos: string[];
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface MappedAsset {
  asset_id: string;
  site_code: string;
  site_name: string | null;
  asset_name: string;
  asset_type: string | null;
  equipment_type: string | null;
  /** High Side / Low Side. */
  category: string | null;
  /** Critical / Non Critical. */
  criticality: string | null;
  location: string | null;
  floor: string | null;
  qr_id: string | null;
  mapping_status: MappingStatus;
  /** The AI is still reading the uploaded nameplate. */
  nameplate_processing: boolean;
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
  approved_at: string | null;
  approved_by_name: string | null;
  /** Row version — sent back on approve so changed documentation isn't approved unseen. */
  mapping_updated_at: string | null;
  /** Equipment line items under this asset, oldest first. */
  equipment: MappingEquipment[];
}

export type PhotoKind = "nameplate" | "location" | "no-access" | "equipment";

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return body?.error || body?.message || fallback;
  } catch {
    return fallback;
  }
}

const equipmentPath = (assetId: string, equipmentId: string) =>
  `/asset-mapping/${encodeURIComponent(assetId)}/equipment/${encodeURIComponent(equipmentId)}`;

async function send<T>(
  method: "POST" | "PATCH" | "DELETE",
  path: string,
  body: unknown,
  fallback: string,
): Promise<T> {
  let res: Response;
  try {
    res = await apiFetch(
      `${API_URL}${path}`,
      { method, body: JSON.stringify(body) },
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

const post = <T,>(path: string, body: unknown, fallback: string) =>
  send<T>("POST", path, body, fallback);

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

export const AssetMappingService = {
  async getSiteAssets(siteCode: string): Promise<MappedAsset[]> {
    const res = await apiFetch(
      `${API_URL}/asset-mapping/site/${encodeURIComponent(siteCode)}`,
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

  /** Save the nameplate photo; the read happens in the background. */
  uploadNameplate(assetId: string, photoUrl: string) {
    return post<MappedAsset>(
      `/asset-mapping/${encodeURIComponent(assetId)}/nameplate/upload`,
      { photo_url: photoUrl },
      "Couldn't save the nameplate photo.",
    );
  },

  /** Save edited nameplate text (a corrected AI read, or typed by hand). */
  saveNameplateText(assetId: string, input: { photoUrl: string; text: string }) {
    return post<MappedAsset>(
      `/asset-mapping/${encodeURIComponent(assetId)}/nameplate/confirm`,
      { photo_url: input.photoUrl, text: input.text },
      "Couldn't save the nameplate data.",
    );
  },

  /* ── equipment line items ── */

  addEquipment(assetId: string, name: string) {
    return post<MappedAsset>(
      `/asset-mapping/${encodeURIComponent(assetId)}/equipment`,
      { name },
      "Couldn't add the equipment.",
    );
  },

  renameEquipment(assetId: string, equipmentId: string, name: string) {
    return send<MappedAsset>(
      "PATCH",
      `${equipmentPath(assetId, equipmentId)}`,
      { name },
      "Couldn't rename the equipment.",
    );
  },

  deleteEquipment(assetId: string, equipmentId: string) {
    return send<MappedAsset>(
      "DELETE",
      `${equipmentPath(assetId, equipmentId)}`,
      {},
      "Couldn't remove the equipment.",
    );
  },

  /** Nameplate photo for a line item; read in the background like the asset's. */
  uploadEquipmentNameplate(assetId: string, equipmentId: string, photoUrl: string) {
    return post<MappedAsset>(
      `${equipmentPath(assetId, equipmentId)}/nameplate/upload`,
      { photo_url: photoUrl },
      "Couldn't save the nameplate photo.",
    );
  },

  saveEquipmentText(assetId: string, equipmentId: string, text: string) {
    return post<MappedAsset>(
      `${equipmentPath(assetId, equipmentId)}/nameplate/specs`,
      { text },
      "Couldn't save the nameplate data.",
    );
  },

  addEquipmentPhoto(assetId: string, equipmentId: string, photoUrl: string) {
    return post<MappedAsset>(
      `${equipmentPath(assetId, equipmentId)}/photos`,
      { photo_url: photoUrl },
      "Couldn't add the photo.",
    );
  },

  removeEquipmentPhoto(assetId: string, equipmentId: string, photoUrl: string) {
    return send<MappedAsset>(
      "DELETE",
      `${equipmentPath(assetId, equipmentId)}/photos`,
      { photo_url: photoUrl },
      "Couldn't remove the photo.",
    );
  },

  saveLocation(assetId: string, photoUrl: string) {
    return post<MappedAsset>(
      `/asset-mapping/${encodeURIComponent(assetId)}/location`,
      { photo_url: photoUrl },
      "Couldn't save the location photo.",
    );
  },

  logNoAccess(assetId: string, input: { reason: string; notes: string; proofPhotoUrl: string }) {
    return post<MappedAsset>(
      `/asset-mapping/${encodeURIComponent(assetId)}/no-access`,
      { reason: input.reason, notes: input.notes, proof_photo_url: input.proofPhotoUrl },
      "Couldn't log this asset as non-accessible.",
    );
  },

  /** Manager / admin: review → completed. */
  approve(asset: MappedAsset) {
    return post<MappedAsset>(
      `/asset-mapping/${encodeURIComponent(asset.asset_id)}/approve`,
      { seen_updated_at: asset.mapping_updated_at },
      "Couldn't approve this asset.",
    );
  },
};

export default AssetMappingService;
