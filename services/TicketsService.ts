import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheAreas,
  getCachedAreas,
  cacheCategories,
  getCachedCategories,
} from "../utils/offlineDataCache";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import {
  database,
  ticketCollection,
  ticketUpdateCollection,
} from "../database";
import { Q } from "@nozbe/watermelondb";
import { pullRecentTickets } from "../utils/syncTicketStorage";
import { StorageService } from "./StorageService";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Get valid token from Supabase session (auto-refreshed by SDK)
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

    const result = await response.json();

    if (!response.ok) {
      if (response.status >= 500) {
        logger.error(`API Error (${response.status}) on ${endpoint}`, {
          module: "TICKETS_SERVICE",
          error: result.error,
          status: response.status,
          endpoint,
        });
      } else {
        logger.warn(`API Warning (${response.status}) on ${endpoint}`, {
          module: "TICKETS_SERVICE",
          error: result.error,
          status: response.status,
          endpoint,
        });
      }

      if (response.status === 401) {
        // Silent sign-out: avoid intrusive alerts for token issues
        result.error = "No token provided";
        authEvents.emitUnauthorized();
      }
    }

    return result;
  } catch (error: any) {
    logger.warn(`Network Error on ${endpoint}`, {
      module: "TICKETS_SERVICE",
      error: error.message,
      endpoint,
    });

    return {
      success: false,
      error: "Network unavailable. Using offline data.",
      isNetworkError: true,
    };
  }
};

// Types
export interface Ticket {
  id: string;
  ticket_no: string;
  title: string;
  status: string;
  site_code: string;
  site_name?: string;
  created_at: string;
  due_date?: string;
  location: string;
  area_asset?: string;
  category: string;
  internal_remarks?: string;
  customer_inputs?: string;
  assigned_to?: string;
  created_user?: string;
  priority?: string;
  // ... other fields if needed
}

export const TicketsService = {
  /**
   * Get tickets for a site with filters
   */
  async getTickets(siteCode: string, options: any = {}) {
    const {
      status,
      fromDate,
      toDate,
      search,
      priority,
      page = 1,
      limit = 50,
    } = options;

    // 1. Return local data if searching/filtering within standard view
    if (page === 1) {
      try {
        const queryConditions: any[] = [Q.sortBy("created_at", Q.desc)];
        if (siteCode !== "all") {
          queryConditions.unshift(Q.where("site_code", siteCode));
        }

        const conditions: any[] = [];
        if (status) conditions.push(Q.where("status", status));
        if (priority && priority !== "All")
          conditions.push(Q.where("priority", priority));
        if (search) {
          conditions.push(
            Q.where("title", Q.like(`%${Q.sanitizeLikeString(search)}%`)),
          );
        }

        if (conditions.length > 0) {
          const finalConditions = [
            ...conditions,
            Q.sortBy("created_at", Q.desc),
          ];
          if (siteCode !== "all") {
            finalConditions.unshift(Q.where("site_code", siteCode));
          }
          const localTickets = await ticketCollection
            .query(...finalConditions)
            .fetch();

          if (localTickets.length > 0) {
            // Fire background sync if online
            const { data: { session: bgSession } } = await supabase.auth.getSession();
            const token = bgSession?.access_token ?? null;
            if (token) {
              pullRecentTickets(siteCode, token, BACKEND_URL).catch((e) =>
                logger.debug("Background ticket pull failed", {
                  error: e.message,
                }),
              );
            }

            // Priority Precedence for local sorting
            const priorityOrder: Record<string, number> = {
              "Very High": 1,
              High: 2,
              Medium: 3,
            };

            const sortedTickets = localTickets
              .map((t) => ({
                id: t.serverId,
                ticket_no: t.ticketNumber,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                category: t.category,
                location: t.area,
                assigned_to: t.assignedTo,
                created_user: t.createdBy,
                site_code: t.siteCode,
                created_at: t.createdAt.toISOString(),
              }))
              .sort((a, b) => {
                const pA = priorityOrder[a.priority || ""] || 4;
                const pB = priorityOrder[b.priority || ""] || 4;
                if (pA !== pB) return pA - pB;
                // Secondary sort: Newest first
                return (
                  new Date(b.created_at).getTime() -
                  new Date(a.created_at).getTime()
                );
              });

            return {
              success: true,
              data: sortedTickets,
              isFromCache: true,
            };
          }
        }
      } catch (err) {
        logger.error("Error fetching local tickets", { error: err });
      }
    }

    // 2. Fallback to API if no local data or requested specific page
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (priority) params.append("priority", priority);
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    if (search) params.append("search", search);
    params.append("page", page.toString());
    params.append("limit", limit.toString());

    const result = await apiFetch(
      `/api/complaints/site/${siteCode}?${params.toString()}`,
    );

    return result;
  },

  /**
   * Get ticket by ID
   */
  async getTicketById(id: string) {
    return await apiFetch(`/api/complaints/${id}`);
  },

  /**
   * Update ticket status and remarks
   */
  async updateStatus(id: string, status: string, remarks?: string) {
    try {
      // 1. Create offline update record first
      await database.write(async () => {
        await ticketUpdateCollection.create((record) => {
          record.ticketId = id; // This should be local ID or server ID depending on model.
          // Usually we want to find the model by serverId and use its local id.
          record.updateType = "status";
          record.updateData = JSON.stringify({
            status,
            internal_remarks: remarks,
          });
          record.isSynced = false;
        });
      });

      // 2. Attempt API update
      const result = await apiFetch(`/api/complaints/status?id=${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status, remarks }),
      });

      return result;
    } catch (err: any) {
      return { success: false, error: "Offline: Update queued." };
    }
  },

  /**
   * Update ticket details (Area/Asset, Category)
   */
  async updateTicket(id: string, data: any) {
    try {
      // 1. Queue offline update
      await database.write(async () => {
        await ticketUpdateCollection.create((record) => {
          record.ticketId = id;
          record.updateType = "details";
          record.updateData = JSON.stringify(data);
          record.isSynced = false;
        });
      });

      // 2. Attempt API update
      return await apiFetch(`/api/complaints?id=${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      });
    } catch (err) {
      return { success: false, error: "Offline: Update queued." };
    }
  },

  /**
   * Get assets for a site
   */
  async getAssets(siteCode: string) {
    const result = await apiFetch(`/api/assets/site/${siteCode}`);
    if (result.success) {
      cacheAreas(siteCode, result.data);
      return result;
    }
    if (result.isNetworkError) {
      const cached = await getCachedAreas(siteCode);
      if (cached && cached.length > 0) {
        return { success: true, data: cached, isFromCache: true };
      }
    }
    return result;
  },

  /**
   * Get complaint statistics for a site
   */
  async getStats(siteCode: string) {
    return await apiFetch(`/api/complaints/site/${siteCode}/stats`);
  },

  /**
   * Get complaint categories
   */
  async getComplaintCategories() {
    const result = await apiFetch(`/api/complaint-categories`);
    if (result.success) {
      cacheCategories(result.data);
      return result;
    }
    if (result.isNetworkError) {
      const cached = await getCachedCategories();
      if (cached && cached.length > 0) {
        return { success: true, data: cached, isFromCache: true };
      }
    }
    return result;
  },

  /**
   * Get ticket line items (images/videos/texts)
   */
  async getLineItems(id: string) {
    return await apiFetch(`/api/complaints/${id}/line-items`);
  },

  /**
   * Add a line item to a ticket
   */
  async addLineItem(
    id: string,
    data: {
      message_text?: string;
      image_url?: string;
      video_url?: string;
      message_id?: string;
    },
  ) {
    // Note: For full offline support, we would add to ticketUpdateCollection here as well.
    // Assuming simple online-first strategy for now to support attachments functionality.
    return await apiFetch(`/api/complaints/${id}/line-items`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },

  /**
   * Upload image to Supabase storage
   */
  async uploadImage(uri: string) {
    try {
      const fileName = `tickets/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

      const publicUrl = await StorageService.uploadFile(
        "jouleops-attachments",
        fileName,
        uri,
      );

      if (publicUrl) {
        return { success: true, url: publicUrl };
      } else {
        return { success: false, error: "Upload failed via StorageService" };
      }
    } catch (error: any) {
      logger.error("Upload image exception", { error: error.message });
      return { success: false, error: error.message };
    }
  },
};

export default TicketsService;
