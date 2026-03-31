import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import logger from "../utils/logger";

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
      return result.success ? result.data : [];
    } catch (error: any) {
      logger.error("Error fetching assets", {
        module: "ASSET_SERVICE",
        error: error.message,
      });
      return [];
    }
  },
};

export default AssetService;
