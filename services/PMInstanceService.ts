import { eq, desc, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
import { db, pmInstances } from "@/database";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  let token = session?.access_token ?? null;

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
      // Silent sign-out: avoid intrusive alerts for token issues
      authEvents.emitUnauthorized();
      // Return a dummy response to prevent further processing
      return {
        ok: false,
        status: 401,
        json: async () => ({ success: false, error: "No token provided" }),
      } as Response;
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
        for (const serverPM of result.data) {
          const serverId = serverPM.id.toString();
          const existing = await db
            .select()
            .from(pmInstances)
            .where(eq(pmInstances.id, serverId));

          const now = Date.now();
          const startDueDate = serverPM.start_due_date
            ? new Date(serverPM.start_due_date).getTime()
            : null;

          if (existing.length > 0) {
            await db
              .update(pmInstances)
              .set({
                title: serverPM.title,
                asset_type: serverPM.asset_type,
                location: serverPM.location,
                frequency: serverPM.frequency,
                status: serverPM.status,
                progress: serverPM.progress,
                assigned_to_name: serverPM.assigned_to_name,
                start_due_date: startDueDate,
                updated_at: now,
              })
              .where(eq(pmInstances.id, serverId));
          } else {
            await db.insert(pmInstances).values({
              id: serverId,
              site_code: siteCode,
              title: serverPM.title,
              asset_type: serverPM.asset_type,
              location: serverPM.location,
              frequency: serverPM.frequency,
              status: serverPM.status,
              progress: serverPM.progress,
              assigned_to_name: serverPM.assigned_to_name,
              start_due_date: startDueDate,
              created_at: now,
              updated_at: now,
            });
          }
        }
      }
    } catch (error: any) {
      logger.error("Error pulling PM instances", {
        module: "PM_INSTANCE_SERVICE",
        error: error.message,
      });
    }
  },

  async getAll(siteCode: string) {
    return await db
      .select()
      .from(pmInstances)
      .where(eq(pmInstances.site_code, siteCode))
      .orderBy(desc(pmInstances.created_at));
  },
};

export default PMInstanceService;
