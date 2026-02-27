import { Q } from "@nozbe/watermelondb";
import { database, pmInstanceCollection } from "../database";
import PMInstance from "../database/models/PMInstance";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { authService } from "./AuthService";
import { fetchWithTimeout } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  let token = await authService.getValidToken();

  const getHeaders = (t: string | null) => ({
    "Content-Type": "application/json",
    ...(t ? { Authorization: `Bearer ${t}` } : {}),
    ...options.headers,
  });

  try {
    let response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
      ...options,
      headers: getHeaders(token),
    });

    if (response.status === 401) {
      const newToken = await authService.refreshToken();
      if (newToken) {
        response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
          ...options,
          headers: getHeaders(newToken),
        });
      }

      if (response.status === 401) {
        // Silent sign-out: avoid intrusive alerts for token issues
        authEvents.emitUnauthorized();
        // Return a dummy response to prevent further processing
        return {
          ok: false,
          status: 401,
          json: async () => ({ success: false, error: "No token provided" }),
        } as Response;
      }
    }

    return response;
  } catch (error) {
    logger.error(`API Fetch Error: ${endpoint}`, {
      module: "PM_INSTANCE_SERVICE",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

export const PMInstanceService = {
  async pullPMInstances(siteCode: string): Promise<void> {
    try {
      const response = await apiFetch(`/api/pm-instances/site/${siteCode}`);
      if (!response.ok) return;

      const result = await response.json();

      if (result.success && Array.isArray(result.data)) {
        await database.write(async () => {
          for (const serverPM of result.data) {
            const existing = await pmInstanceCollection
              .query(Q.where("server_id", serverPM.id.toString()))
              .fetch();

            if (existing.length > 0) {
              await existing[0].update((record) => {
                record.title = serverPM.title;
                record.assetType = serverPM.asset_type;
                record.location = serverPM.location;
                record.frequency = serverPM.frequency;
                record.status = serverPM.status;
                record.progress = serverPM.progress;
                record.assignedToName = serverPM.assigned_to_name;
                record.startDueDate = serverPM.start_due_date
                  ? new Date(serverPM.start_due_date).getTime()
                  : null;
                record.isSynced = true;
              });
            } else {
              await pmInstanceCollection.create((record) => {
                record.serverId = serverPM.id.toString();
                record.siteCode = siteCode;
                record.title = serverPM.title;
                record.assetType = serverPM.asset_type;
                record.location = serverPM.location;
                record.frequency = serverPM.frequency;
                record.status = serverPM.status;
                record.progress = serverPM.progress;
                record.assignedToName = serverPM.assigned_to_name;
                record.startDueDate = serverPM.start_due_date
                  ? new Date(serverPM.start_due_date).getTime()
                  : null;
                record.isSynced = true;
              });
            }
          }
        });
      }
    } catch (error: any) {
      logger.error("Error pulling PM instances", {
        module: "PM_INSTANCE_SERVICE",
        error: error.message,
      });
    }
  },

  async getAll(siteCode: string): Promise<PMInstance[]> {
    return await pmInstanceCollection
      .query(Q.where("site_code", siteCode), Q.sortBy("created_at", Q.desc))
      .fetch();
  },
};

export default PMInstanceService;
