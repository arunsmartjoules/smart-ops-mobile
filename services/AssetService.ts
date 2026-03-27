import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import logger from "../utils/logger";

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers,
    });
    return response;
  } catch (error) {
    logger.error(`Asset API Fetch Error: ${endpoint}`, {
      module: "ASSET_SERVICE",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const AssetService = {
  /**
   * Look up an asset by its QR code ID.
   * Returns { asset_name, site_code } or null if not found.
   */
  async getAssetByQrId(
    qrId: string,
    siteCode: string,
  ): Promise<{ asset_name: string; site_code: string } | null> {
    try {
      const { data, error } = await supabase
        .from("assets")
        .select("asset_name, site_code")
        .eq("qr_id", qrId)
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      return data as { asset_name: string; site_code: string };
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
