import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { areas, categories as categoriesTable } from "../database";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { db, tickets, ticketUpdates } from "../database";
import { eq, desc, and, like } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";
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
        const conditions: any[] = [];

        if (siteCode !== "all") {
          conditions.push(eq(tickets.site_code, siteCode));
        }
        if (status) {
          conditions.push(eq(tickets.status, status));
        }
        if (priority && priority !== "All") {
          conditions.push(eq(tickets.priority, priority));
        }
        if (search) {
          conditions.push(like(tickets.title, `%${search}%`));
        }

        if (conditions.length > 0) {
          const query =
            conditions.length === 1
              ? db
                  .select()
                  .from(tickets)
                  .where(conditions[0])
                  .orderBy(desc(tickets.created_at))
              : db
                  .select()
                  .from(tickets)
                  .where(and(...conditions))
                  .orderBy(desc(tickets.created_at));

          const localTickets = await query;

          if (localTickets.length > 0) {
            // PowerSync handles background sync automatically
            // No need for manual pullRecentTickets call

            // Priority Precedence for local sorting
            const priorityOrder: Record<string, number> = {
              "Very High": 1,
              High: 2,
              Medium: 3,
            };

            const sortedTickets = localTickets
              .map((t) => ({
                id: t.id,
                ticket_no: t.ticket_number,
                title: t.title,
                description: t.description,
                status: t.status,
                priority: t.priority,
                category: t.category,
                location: t.area,
                assigned_to: t.assigned_to,
                created_user: t.created_by,
                site_code: t.site_code,
                created_at: new Date(t.created_at).toISOString(),
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

    // Cache API response to local DB for offline use
    if (result?.success && result.data?.length > 0) {
      try {
        const { isCacheEnabled } = await import("../app/app-settings");
        const enabled = await isCacheEnabled("tickets");
        if (enabled) {
          for (const t of result.data) {
            await db.insert(tickets).values({
              id: t.id,
              site_code: t.site_code || siteCode,
              ticket_number: t.ticket_no || t.ticket_number || "",
              title: t.title || "",
              description: t.internal_remarks || t.description || "",
              status: t.status || "",
              priority: t.priority || "",
              category: t.category || "",
              area: t.area_asset || t.location || "",
              assigned_to: t.assigned_to || "",
              created_by: t.created_user || "",
              created_at: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
              updated_at: Date.now(),
            }).onConflictDoUpdate({
              target: tickets.id,
              set: {
                status: t.status || "",
                priority: t.priority || "",
                assigned_to: t.assigned_to || "",
                updated_at: Date.now(),
              },
            });
          }
        }
      } catch (cacheErr) {
        logger.warn("Failed to cache tickets", { error: cacheErr });
      }
    }

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
   * Updates both the offline queue AND the local ticket via Drizzle/PowerSync
   */
  async updateStatus(id: string, status: string, remarks?: string) {
    try {
      let serverId = id;

      // 1. Update the local ticket in Drizzle/PowerSync immediately for offline persistence
      // Try to find ticket by id
      let localRows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, id));

      if (localRows.length > 0) {
        const localTicket = localRows[0];
        serverId = localTicket.id;

        const updateFields: Record<string, any> = { status };
        if (remarks !== undefined) updateFields.description = remarks;

        await db
          .update(tickets)
          .set(updateFields)
          .where(eq(tickets.id, localTicket.id));

        logger.info("Updated local ticket status via Drizzle", {
          module: "TICKETS_SERVICE",
          ticketId: localTicket.id,
          status,
        });
      } else {
        logger.warn("Ticket not found in local database for status update", {
          module: "TICKETS_SERVICE",
          ticketId: id,
        });
      }

      // 2. Create offline update record for sync
      await db.insert(ticketUpdates).values({
        id: uuidv4(),
        ticket_id: localRows.length > 0 ? localRows[0].id : id,
        update_type: "status",
        update_data: JSON.stringify({
          status,
          internal_remarks: remarks,
        }),
        created_at: Date.now(),
      });

      // 3. Attempt API update if online (use server ID)
      const result = await apiFetch(`/api/complaints/status?id=${serverId}`, {
        method: "PATCH",
        body: JSON.stringify({ status, remarks }),
      });

      return result;
    } catch (err: any) {
      return { success: false, error: "Offline: Update queued." };
    }
  },

  /**
   * Update ticket details (Area/Asset, Category, Status)
   * Updates both the offline queue AND the local ticket via Drizzle/PowerSync
   */
  async updateTicket(id: string, data: any) {
    try {
      let serverId = id;

      // 1. Update the local ticket in Drizzle/PowerSync immediately for offline persistence
      let localRows = await db
        .select()
        .from(tickets)
        .where(eq(tickets.id, id));

      if (localRows.length > 0) {
        const localTicket = localRows[0];
        serverId = localTicket.id;

        const updateFields: Record<string, any> = {};
        if (data.status !== undefined) updateFields.status = data.status;
        if (data.internal_remarks !== undefined) updateFields.description = data.internal_remarks;
        if (data.area_asset !== undefined) updateFields.area = data.area_asset;
        if (data.category !== undefined) updateFields.category = data.category;
        if (data.priority !== undefined) updateFields.priority = data.priority;
        if (data.assigned_to !== undefined) updateFields.assigned_to = data.assigned_to;

        if (Object.keys(updateFields).length > 0) {
          await db
            .update(tickets)
            .set(updateFields)
            .where(eq(tickets.id, localTicket.id));
        }

        logger.info("Updated local ticket via Drizzle", {
          module: "TICKETS_SERVICE",
          ticketId: localTicket.id,
          updates: Object.keys(data),
        });
      } else {
        logger.warn("Ticket not found in local database for offline update", {
          module: "TICKETS_SERVICE",
          ticketId: id,
        });
      }

      // 2. Queue offline update for sync
      await db.insert(ticketUpdates).values({
        id: uuidv4(),
        ticket_id: localRows.length > 0 ? localRows[0].id : id,
        update_type: "details",
        update_data: JSON.stringify(data),
        created_at: Date.now(),
      });

      // 3. Attempt API update if online (use server ID)
      return await apiFetch(`/api/complaints?id=${serverId}`, {
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
      return result;
    }
    if (result.isNetworkError) {
      // Fallback to local PowerSync-synced areas table
      const cached = await db.select().from(areas).where(eq(areas.site_code, siteCode)).catch(() => []);
      if (cached.length > 0) {
        return { success: true, data: cached, isFromCache: true };
      }
    }
    return result;
  },

  /**
   * Get complaint statistics for a site
   */
  async getStats(siteCode: string) {
    const result = await apiFetch(`/api/complaints/site/${siteCode}/stats`);
    if (result.success) {
      return result;
    }
    // Stats are not stored locally; return the error result as-is when offline
    return result;
  },

  /**
   * Get complaint categories
   */
  async getComplaintCategories() {
    const result = await apiFetch(`/api/complaint-categories`);
    if (result.success) {
      return result;
    }
    if (result.isNetworkError) {
      // Fallback to local PowerSync-synced categories table
      const cached = await db.select().from(categoriesTable).catch(() => []);
      if (cached.length > 0) {
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
    // Note: For full offline support, we would add to ticketUpdates here as well.
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
