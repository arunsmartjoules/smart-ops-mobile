import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

// Helper to get the token
const getToken = async (): Promise<string | null> => {
  return await AsyncStorage.getItem("auth_token");
};

// Helper for API requests with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = await getToken();
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers,
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
      result.error = "Session expired. Please sign in again.";
    }
  }

  return result;
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

    return await apiFetch(
      `/api/complaints/site/${siteId}?${params.toString()}`
    );
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
    return await apiFetch(`/api/assets/site/${siteId}`);
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
    return await apiFetch(`/api/complaint-categories`);
  },
};

export default TicketsService;
