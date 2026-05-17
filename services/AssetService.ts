import { eq } from "drizzle-orm";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import { db, areas } from "../database";
import logger from "../utils/logger";

/**
 * Offline fallback: read assets for a site from the locally-synced `areas`
 * table when the live request fails or returns nothing. Field operators are
 * routinely in chiller plant rooms / basements with no signal, so the chiller
 * dropdown must work from cache like the rest of the offline-first app.
 *
 * Matching is case-insensitive and checks both `equipment_type` and the
 * legacy `asset_type` column, so rows synced before the schema migration
 * (asset_id / equipment_type still null) still resolve.
 */
async function getCachedAssetsBySite(siteCode: string, equipmentType?: string) {
  try {
    const rows = await db
      .select()
      .from(areas)
      .where(eq(areas.site_code, siteCode));

    const wanted = equipmentType?.trim().toLowerCase();
    return rows
      .filter((r: any) => {
        if (!wanted) return true;
        const et = (r.equipment_type ?? "").trim().toLowerCase();
        const at = (r.asset_type ?? "").trim().toLowerCase();
        return et === wanted || at === wanted;
      })
      .map((r: any) => ({
        asset_id: r.asset_id || r.id,
        asset_name: r.asset_name || r.asset_id || r.id,
        equipment_type: r.equipment_type ?? r.asset_type ?? null,
        asset_type: r.asset_type ?? null,
        location: r.location ?? null,
      }));
  } catch (error: any) {
    logger.error("Error reading cached assets", {
      module: "ASSET_SERVICE",
      error: error.message,
    });
    return [];
  }
}

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  return centralApiFetch(`${BACKEND_URL}${endpoint}`, options);
};

export const AssetService = {
  /**
   * Look up an asset by its QR code ID.
   * Returns { asset_name, site_code } or null if not found.
   */
  async getAssetByQrId(
    qrId: string,
    _siteCode: string, // Kept for parameter parity
  ): Promise<{ asset_name: string; site_id: string } | null> {
    try {
      const response = await apiFetch(`/api/assets/qr/${encodeURIComponent(qrId)}`);
      
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error(`Asset lookup failed with status: ${response.status}`);
      }

      const result = await response.json();
      return result.success ? result.data : null;
    } catch (error: any) {
      logger.error("Error fetching asset by QR ID", {
        module: "ASSET_SERVICE",
        error: error.message,
      });
      return null;
    }
  },

  /**
   * Get assets by site and equipment type
   */
  async getAssetsBySite(siteCode: string, equipmentType?: string) {
    try {
      let endpoint = `/api/assets/site/${siteCode}`;
      if (equipmentType) {
        endpoint += `?equipment_type=${encodeURIComponent(equipmentType)}`;
      }

      const response = await apiFetch(endpoint);
      if (!response.ok) {
        throw new Error(`Failed to fetch assets: ${response.status}`);
      }

      const result = await response.json();
      const data = result.success ? result.data : [];

      // Server returned an empty list — fall back to cache rather than
      // showing "no chiller found" on a transient/empty response.
      if (!Array.isArray(data) || data.length === 0) {
        const cached = await getCachedAssetsBySite(siteCode, equipmentType);
        if (cached.length > 0) {
          logger.info("Serving assets from offline cache (empty response)", {
            module: "ASSET_SERVICE",
            siteCode,
            count: cached.length,
          });
          return cached;
        }
        return data;
      }

      return data;
    } catch (error: any) {
      logger.error("Error fetching assets, falling back to offline cache", {
        module: "ASSET_SERVICE",
        error: error.message,
      });
      return getCachedAssetsBySite(siteCode, equipmentType);
    }
  },
};

export default AssetService;
