import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import {
  cacheTickets,
  getCachedTickets,
  cacheAreas,
  getCachedAreas,
  cacheCategories,
  getCachedCategories,
} from "../utils/offlineDataCache";
import { authService } from "../services/AuthService";
import { fetchWithTimeout } from "../utils/apiHelper";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

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
  site_id: string;
  site_code?: string;
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
  async getTickets(siteId: string, options: any = {}) {
    const { status, fromDate, toDate, search, page = 1, limit = 50 } = options;
    const params = new URLSearchParams();
    if (status) params.append("status", status);
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    if (search) params.append("search", search);
    params.append("page", page.toString());
    params.append("limit", limit.toString());

    const result = await apiFetch(
      `/api/complaints/site/${siteId}?${params.toString()}`,
    );

    if (result.success) {
      // Background: update cache if first page and no search/filter (standard view)
      if (page === 1 && !status && !fromDate && !toDate && !search) {
        cacheTickets(siteId, result.data);
      }
      return result;
    }

    // Fallback to cache if network error
    if (
      result.isNetworkError &&
      page === 1 &&
      !status &&
      !fromDate &&
      !toDate &&
      !search
    ) {
      const cached = await getCachedTickets(siteId);
      if (cached && cached.length > 0) {
        return { success: true, data: cached, isFromCache: true };
      }
    }

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
    return await apiFetch(`/api/complaints/${ticketId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status, remarks }),
    });
  },

  /**
   * Update ticket details (Area/Asset, Category)
   */
  async updateTicket(ticketId: string, data: any) {
    return await apiFetch(`/api/complaints/${ticketId}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  },

  /**
   * Get assets for a site
   */
  async getAssets(siteId: string) {
    const result = await apiFetch(`/api/assets/site/${siteId}`);
    if (result.success) {
      cacheAreas(siteId, result.data);
      return result;
    }
    if (result.isNetworkError) {
      const cached = await getCachedAreas(siteId);
      if (cached && cached.length > 0) {
        return { success: true, data: cached, isFromCache: true };
      }
    }
    return result;
  },

  /**
   * Get complaint statistics for a site
   */
  async getStats(siteId: string) {
    return await apiFetch(`/api/complaints/site/${siteId}/stats`);
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
};

export default TicketsService;
