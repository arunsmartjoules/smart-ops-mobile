import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheAreas,
  getCachedAreas,
  cacheCategories,
  getCachedCategories,
} from "../utils/offlineDataCache";
import { authService } from "../services/AuthService";
import { fetchWithTimeout } from "../utils/apiHelper";
import {
  database,
  ticketCollection,
  ticketUpdateCollection,
} from "../database";
import { Q } from "@nozbe/watermelondb";
import { pullRecentTickets } from "../utils/syncTicketStorage";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  // Get valid token (will refresh if needed)
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

    // If 401, try refresh once
    if (response.status === 401) {
      logger.debug(`401 on ${endpoint}, attempting refresh`, {
        module: "TICKETS_SERVICE",
      });
      const newToken = await authService.refreshToken();

      if (newToken) {
        token = newToken;
        // Retry with new token
        response = await fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
          ...options,
          headers: getHeaders(token),
        });
      }
    }

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
        result.error = "Session expired. Please sign in again.";
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
  ticket_id: string;
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
  // ... other fields if needed
}

export const TicketsService = {
  /**
   * Get tickets for a site with filters
   */
  async getTickets(siteCode: string, options: any = {}) {
    const { status, fromDate, toDate, search, page = 1, limit = 50 } = options;

    // 1. Return local data if searching/filtering within standard view
    if (page === 1) {
      try {
        let query = ticketCollection.query(
          Q.where("site_code", siteCode),
          Q.sortBy("created_at", Q.desc),
        );

        const conditions: any[] = [];
        if (status) conditions.push(Q.where("status", status));
        if (search) {
          conditions.push(
            Q.where("title", Q.like(`%${Q.sanitizeLikeString(search)}%`)),
          );
        }

        if (conditions.length > 0) {
          query = ticketCollection.query(
            Q.where("site_code", siteCode),
            ...conditions,
            Q.sortBy("created_at", Q.desc),
          );
        }

        const localTickets = await query.fetch();
        if (localTickets.length > 0) {
          // Fire background sync if online
          const token = await authService.getValidToken();
          if (token) {
            pullRecentTickets(siteCode, token, BACKEND_URL).catch((e) =>
              logger.debug("Background ticket pull failed", {
                error: e.message,
              }),
            );
          }

          return {
            success: true,
            data: localTickets.map((t) => ({
              ticket_id: t.serverId,
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
            })),
            isFromCache: true,
          };
        }
      } catch (err) {
        logger.error("Error fetching local tickets", { error: err });
      }
    }

    // 2. Fallback to API if no local data or requested specific page
    const params = new URLSearchParams();
    if (status) params.append("status", status);
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
  async getTicketById(ticketId: string) {
    return await apiFetch(`/api/complaints/${ticketId}`);
  },

  /**
   * Update ticket status and remarks
   */
  async updateStatus(ticketId: string, status: string, remarks?: string) {
    try {
      // 1. Create offline update record first
      await database.write(async () => {
        await ticketUpdateCollection.create((record) => {
          record.ticketId = ticketId; // This should be local ID or server ID depending on model.
          // Usually we want to find the model by serverId and use its local id.
          record.updateType = "status";
          record.updateData = JSON.stringify({ status, remarks });
          record.isSynced = false;
        });
      });

      // 2. Attempt API update
      const result = await apiFetch(`/api/complaints/${ticketId}/status`, {
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
  async updateTicket(ticketId: string, data: any) {
    try {
      // 1. Queue offline update
      await database.write(async () => {
        await ticketUpdateCollection.create((record) => {
          record.ticketId = ticketId;
          record.updateType = "details";
          record.updateData = JSON.stringify(data);
          record.isSynced = false;
        });
      });

      // 2. Attempt API update
      return await apiFetch(`/api/complaints/${ticketId}`, {
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
  async getLineItems(ticketId: string) {
    return await apiFetch(`/api/complaints/${ticketId}/line-items`);
  },

  /**
   * Add a line item to a ticket
   */
  async addLineItem(
    ticketId: string,
    data: {
      message_text?: string;
      image_url?: string;
      video_url?: string;
      message_id?: string;
    },
  ) {
    // Note: For full offline support, we would add to ticketUpdateCollection here as well.
    // Assuming simple online-first strategy for now to support attachments functionality.
    return await apiFetch(`/api/complaints/${ticketId}/line-items`, {
      method: "POST",
      body: JSON.stringify(data),
    });
  },
};

export default TicketsService;
