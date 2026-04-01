import NetInfo from "@react-native-community/netinfo";
import logger from "../utils/logger";
import { authEvents } from "../utils/authEvents";
import { areas, categories as categoriesTable } from "../database";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { db, tickets } from "../database";
import { eq } from "drizzle-orm";
import { StorageService } from "./StorageService";
import { AttachmentQueueService } from "./AttachmentQueueService";
import cacheManager from "./CacheManager";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

const parseCreatedAtMs = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
};

const toBoundaryMs = (value: string | undefined, endOfDay = false) => {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(
      year,
      month - 1,
      day,
      endOfDay ? 23 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 59 : 0,
      endOfDay ? 999 : 0,
    ).getTime();
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
};

// Helper for API requests with auth and retry logic
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const result = await centralApiFetch(`${BACKEND_URL}${endpoint}`, options);

    const data = await result.json();

    if (!result.ok) {
      if (result.status >= 500) {
        logger.error(`API Error (${result.status}) on ${endpoint}`, {
          module: "TICKETS_SERVICE",
          error: data.error,
          status: result.status,
          endpoint,
        });
      } else {
        logger.warn(`API Warning (${result.status}) on ${endpoint}`, {
          module: "TICKETS_SERVICE",
          error: data.error,
          status: result.status,
          endpoint,
        });
      }

      if (result.status === 401) {
        // Silent sign-out: avoid intrusive alerts for token issues
        data.error = "No token provided";
        authEvents.emitUnauthorized();
      }
    }

    return data;
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
  description?: string;
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
  responded_at?: string;
  resolved_at?: string;
  contact_number?: string;
  before_temp?: number | null;
  after_temp?: number | null;
}

interface AssetsPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

interface GetAssetsOptions {
  page?: number;
  limit?: number;
  search?: string;
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
      refresh = false,
    } = options;

    const netState = await NetInfo.fetch();

    // 1. Return local data ONLY if not refreshing and on page 1
    if (page === 1 && !refresh) {
      try {
        const whereFilter: Record<string, any> = {};
        if (siteCode !== "all") whereFilter.site_code = siteCode;
        if (status) whereFilter.status = status;
        if (priority && priority !== "All") whereFilter.priority = priority;

        const allCached = await cacheManager.read<typeof tickets.$inferSelect>(
          "tickets",
          { where: Object.keys(whereFilter).length > 0 ? whereFilter : undefined },
        );

        const normalizedSearch = search?.trim().toLowerCase() || "";
        const fromDateMs = toBoundaryMs(fromDate, false);
        const toDateMs = toBoundaryMs(toDate, true);
        const localTickets = allCached.filter((t) => {
          if (fromDateMs != null || toDateMs != null) {
            const createdAtMs = parseCreatedAtMs(t.created_at);
            if (createdAtMs == null) return false;
            if (fromDateMs != null && createdAtMs < fromDateMs) return false;
            if (toDateMs != null && createdAtMs > toDateMs) return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          const haystack = [
            t.ticket_number,
            t.title,
            t.description,
            t.category,
            t.area,
            t.status,
            t.priority,
            t.assigned_to,
            t.created_by,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return haystack.includes(normalizedSearch);
        });

        if (localTickets.length > 0) {
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
              before_temp: t.before_temp,
              after_temp: t.after_temp,
            }))
            .sort((a, b) => {
              const pA = priorityOrder[a.priority || ""] || 4;
              const pB = priorityOrder[b.priority || ""] || 4;
              if (pA !== pB) return pA - pB;
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
        const records = result.data.map((t: any) => ({
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
          before_temp: t.before_temp ?? null,
          after_temp: t.after_temp ?? null,
          created_at: t.created_at ? new Date(t.created_at).getTime() : Date.now(),
          updated_at: Date.now(),
        }));
        await cacheManager.write("tickets", records);
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
   * Updates both the offline queue AND the local ticket via Drizzle/SQLite
   */
  async updateStatus(id: string, status: string, remarks?: string) {
    try {
      let serverId = id;

      // 1. Update the local ticket in Drizzle/SQLite immediately for offline persistence
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
      await cacheManager.enqueue({
        entity_type: "ticket_update",
        operation: "update",
        payload: {
          ticket_id: localRows.length > 0 ? localRows[0].id : id,
          update_type: "status",
          status,
          internal_remarks: remarks,
        },
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
   * Updates both the offline queue AND the local ticket via Drizzle/SQLite
   */
  async updateTicket(id: string, data: any) {
    try {
      let serverId = id;

      // 1. Update the local ticket in Drizzle/SQLite immediately for offline persistence
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
        if (data.before_temp !== undefined) updateFields.before_temp = data.before_temp;
        if (data.after_temp !== undefined) updateFields.after_temp = data.after_temp;

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
      await cacheManager.enqueue({
        entity_type: "ticket_update",
        operation: "update",
        payload: {
          ticket_id: localRows.length > 0 ? localRows[0].id : id,
          ...data,
        },
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
  async getAssets(siteCode: string, options: GetAssetsOptions = {}) {
    const { page = 1, limit = 50, search } = options;
    const params = new URLSearchParams();
    params.append("page", page.toString());
    params.append("limit", limit.toString());
    if (search?.trim()) params.append("search", search.trim());

    const result = await apiFetch(`/api/assets/site/${siteCode}?${params.toString()}`);
    if (result.success) {
      return result;
    }
    if (result.isNetworkError) {
      // Fallback to local SQLite-synced areas table
      const cached = await db.select().from(areas).where(eq(areas.site_code, siteCode)).catch(() => []);
      if (cached.length > 0) {
        const normalizedSearch = search?.trim().toLowerCase() || "";
        const filtered = cached.filter((asset: any) => {
          if (!normalizedSearch) return true;
          return [
            asset.asset_name,
            asset.asset_id,
            asset.location,
            asset.asset_type,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch);
        });

        const start = (page - 1) * limit;
        const pageData = filtered.slice(start, start + limit);
        const pagination: AssetsPagination = {
          page,
          limit,
          total: filtered.length,
          totalPages: Math.max(1, Math.ceil(filtered.length / limit)),
        };

        return {
          success: true,
          data: pageData,
          pagination,
          isFromCache: true,
        };
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
      // Fallback to local SQLite-synced categories table
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
    // Enqueue for offline sync
    await cacheManager.enqueue({
      entity_type: "ticket_line_item",
      operation: "create",
      payload: { ticket_id: id, ...data },
    });

    // Best-effort API call
    try {
      const result = await apiFetch(`/api/complaints/${id}/line-items`, {
        method: "POST",
        body: JSON.stringify(data),
      });
      return result;
    } catch {
      return { success: false, error: "Offline: Line item queued for sync.", queued: true };
    }
  },

  /**
   * Upload image to Supabase storage, or queue for deferred upload.
   * Returns { success, url } with either the remote URL or a local persistent URI.
   */
  async uploadImage(uri: string, relatedTicketId?: string) {
    try {
      const fileName = `tickets/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;

      // Try immediate upload first
      const publicUrl = await StorageService.uploadFile(
        "jouleops-attachments",
        fileName,
        uri,
      );

      if (publicUrl) {
        return { success: true, url: publicUrl };
      }

      // Upload failed (likely offline) — queue for deferred upload
      const persistentUri = await AttachmentQueueService.queueAttachment({
        localUri: uri,
        bucketName: "jouleops-attachments",
        remotePath: fileName,
        relatedEntityType: "ticket_line_item",
        relatedEntityId: relatedTicketId || "unknown",
        relatedField: "image_url",
      });

      return { success: true, url: persistentUri, queued: true };
    } catch (error: any) {
      // Even if exception, try to queue
      try {
        const fileName = `tickets/${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const persistentUri = await AttachmentQueueService.queueAttachment({
          localUri: uri,
          bucketName: "jouleops-attachments",
          remotePath: fileName,
          relatedEntityType: "ticket_line_item",
          relatedEntityId: relatedTicketId || "unknown",
          relatedField: "image_url",
        });
        return { success: true, url: persistentUri, queued: true };
      } catch {
        logger.error("Upload image exception", { error: error.message });
        return { success: false, error: error.message };
      }
    }
  },
};

export default TicketsService;
