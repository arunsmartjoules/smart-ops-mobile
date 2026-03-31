import { eq, and, inArray, or, isNull, gte, lte, asc, sql } from "drizzle-orm";
import { db, pmInstances, pmChecklistMaster, pmChecklistItems, pmResponses, offlineQueue } from "@/database";
import { v4 as uuidv4 } from "uuid";
import cacheManager from "./CacheManager";
import { fetchWithTimeout, apiFetch as centralApiFetch } from "../utils/apiHelper";
import { AttachmentQueueService } from "./AttachmentQueueService";
import logger from "../utils/logger";
import { API_BASE_URL } from "../constants/api";
import NetInfo from "@react-native-community/netinfo";

const BACKEND_URL = API_BASE_URL;

const apiFetch = async (endpoint: string, options: RequestInit = {}, customTimeout?: number) => {
  return centralApiFetch(`${BACKEND_URL}${endpoint}`, options, customTimeout);
};

export interface PMResponseData {
  checklist_item_id: string;
  response_value: string | null;
  readings: string | null;
  remarks: string | null;
  image_url: string | null;
}

const LOCAL_URI_PREFIXES = ["file://", "content://", "ph://", "asset-library://"];
const isLocalUri = (uri?: string | null) =>
  !!uri && LOCAL_URI_PREFIXES.some((p) => uri.startsWith(p));

/**
 * If the given URI is a local file, queue it for deferred upload and
 * return the persistent local URI. Otherwise return the URI as-is.
 */
const queueAttachmentIfLocal = async (
  uri: string | null | undefined,
  folder: string,
  entityType: "pm_instance",
  entityId: string,
  field: string,
): Promise<string | null> => {
  if (!uri) return null;
  if (!isLocalUri(uri)) return uri;
  return AttachmentQueueService.queueAttachment({
    localUri: uri,
    bucketName: "jouleops-attachments",
    remotePath: `${folder}/${entityId}_${Date.now()}.jpg`,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    relatedField: field,
  });
};

type PMInstanceRow = typeof pmInstances.$inferSelect;
type PMChecklistItemRow = typeof pmChecklistItems.$inferSelect;
type PMResponseRow = typeof pmResponses.$inferSelect;

const PMService = {
  /**
   * Fetch PM instances from API and cache them to local DB.
   */
  async fetchFromAPI(
    siteCode: string,
    limit?: number,
    offset?: number,
    fromDate?: string | Date,
    toDate?: string | Date,
    status?: string,
  ): Promise<any[]> {
    try {
      let endpoint = `/api/pm-instances/site/${siteCode}`;
      const params = new URLSearchParams();
      
      const formatDate = (d: any) => {
        if (!d) return undefined;
        if (typeof d === "string") return d;
        if (typeof d === "number") return new Date(d).toISOString();
        if (d instanceof Date) return d.toISOString();
        // Fallback for cases like invalid Date objects or other types
        try {
          const parsed = new Date(d);
          return isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
        } catch {
          return undefined;
        }
      };

      const requestedLimit = limit || 50;
      params.append("limit", requestedLimit.toString());
      if (offset !== undefined) params.append("page", (Math.floor(offset / requestedLimit) + 1).toString());
      
      const formattedFromDate = formatDate(fromDate);
      if (formattedFromDate) params.append("from_date", formattedFromDate);
      
      const formattedToDate = formatDate(toDate);
      if (formattedToDate) params.append("to_date", formattedToDate);
      
      if (status && status !== "All") params.append("status", status);
      
      if (params.toString()) endpoint += `?${params.toString()}`;

      const response = await apiFetch(endpoint);
      const data = await response.json();

      if (data.success && data.data?.length > 0) {
        const records = data.data.map((inst: any) => ({
          id: inst.id,
          site_code: (inst.site_code || siteCode).trim().toUpperCase(),
          title: inst.title || "",
          asset_id: inst.asset_id || null,
          asset_type: inst.asset_type || "",
          location: inst.location || "",
          frequency: inst.frequency || "",
          status: inst.status || "",
          progress: inst.progress || "0/0",
          assigned_to_name: inst.assigned_to_name || null,
          start_due_date: inst.start_due_date ? new Date(inst.start_due_date).getTime() : null,
          maintenance_id: inst.maintenance_id || inst.checklist_id || null,
          client_sign: inst.client_sign || null,
          before_image: inst.before_image || null,
          after_image: inst.after_image || null,
          created_at: inst.created_at ? new Date(inst.created_at).getTime() : Date.now(),
          updated_at: Date.now(),
        }));

        // Filter out records that are currently in the local sync queue to avoid overwriting "new" local data with "stale" server data.
        const pendingIds = await this.getPendingInstanceIds();
        const finalRecords = records.filter((r: any) => !pendingIds.includes(r.id));

        if (finalRecords.length > 0) {
          await cacheManager.write("pm_instances", finalRecords);
        }
        
        // Pre-fetch linked checklists
        const checklistIds = [...new Set(data.data.map((i: any) => i.maintenance_id || i.checklist_id).filter(Boolean))] as string[];
        for (const cid of checklistIds) {
           this.fetchChecklistItemsFromAPI(cid).catch(() => {});
        }

        return data.data;
      }
      return [];
    } catch (error) {
      logger.error("Failed to fetch PM instances from API", { module: "PM_SERVICE", error, siteCode });
      return [];
    }
  },

  /**
   * Helper to identify PM instances that have pending local changes.
   */
  async getPendingInstanceIds(): Promise<string[]> {
    try {
      const results = await db
        .select({ payload: offlineQueue.payload })
        .from(offlineQueue)
        .where(
          and(
            eq(offlineQueue.entity_type, "pm_instance_update"),
            eq(offlineQueue.status, "pending"),
          ),
        );

      return results
        .map((r) => {
          try {
            const parsed = JSON.parse(r.payload);
            return parsed.id;
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (error) {
      logger.error("Error fetching pending instance IDs", { module: "PM_SERVICE", error });
      return [];
    }
  },

  /**
   * Get all pending updates from the queue as an ID-to-Update map.
   */
  async getPendingUpdatesMap(): Promise<Record<string, Partial<any>>> {
    try {
      const results = await db
        .select({ payload: offlineQueue.payload })
        .from(offlineQueue)
        .where(
          and(
            eq(offlineQueue.entity_type, "pm_instance_update"),
            eq(offlineQueue.status, "pending"),
          ),
        );

      const map: Record<string, any> = {};
      results.forEach((r) => {
        try {
          const parsed = JSON.parse(r.payload);
          if (parsed.id) map[parsed.id] = parsed;
        } catch {}
      });
      return map;
    } catch (error) {
      return {};
    }
  },

  async fetchInstanceFromAPI(instanceId: string): Promise<PMInstanceRow | null> {
    try {
      const response = await apiFetch(`/api/pm-instances/${instanceId}`);
      const data = await response.json();
      if (data.success && data.data) {
        const inst = data.data;
        const record = {
          id: inst.id,
          site_code: inst.site_code?.trim().toUpperCase() || "",
          title: inst.title || "",
          asset_id: inst.asset_id || null,
          asset_type: inst.asset_type || "",
          location: inst.location || "",
          frequency: inst.frequency || "",
          status: inst.status || "",
          progress: inst.progress || "0/0",
          assigned_to_name: inst.assigned_to_name || null,
          start_due_date: inst.start_due_date ? new Date(inst.start_due_date).getTime() : null,
          maintenance_id: inst.maintenance_id || inst.checklist_id || null,
          client_sign: inst.client_sign || null,
          before_image: inst.before_image || null,
          after_image: inst.after_image || null,
          created_at: inst.created_at ? new Date(inst.created_at).getTime() : Date.now(),
          updated_at: Date.now(),
        };
        // Avoid overwriting if this specific instance has a pending local change
        const pendingIds = await this.getPendingInstanceIds();
        if (!pendingIds.includes(record.id)) {
          await cacheManager.write("pm_instances", [record]);
        }
        return record as PMInstanceRow;
      }
      return null;
    } catch (error) {
      logger.error("Failed to fetch single PM instance", { module: "PM_SERVICE", instanceId, error });
      return null;
    }
  },

  /**
   * Get all PM instances for a site from local database.
   * Filtering is handled in memory for stability.
   */
  async getLocalInstances(siteCode: string) {
    try {
      if (!siteCode || siteCode === "all") return [];
      
      const cleanSiteCode = siteCode.trim().toUpperCase();
      
      return await db
        .select()
        .from(pmInstances)
        .where(eq(pmInstances.site_code, cleanSiteCode))
        .orderBy(asc(pmInstances.start_due_date));
    } catch (error: any) {
      logger.error("Error fetching local PM instances", { module: "PM_SERVICE", error: error.message });
      return [];
    }
  },

  async getInstanceByServerId(serverId: string): Promise<PMInstanceRow | null> {
    const results = await db.select().from(pmInstances).where(eq(pmInstances.id, serverId));
    return results.length > 0 ? results[0] : null;
  },

  async fetchChecklistItemsFromAPI(checklistId: string): Promise<any[]> {
    try {
      const response = await apiFetch(`/api/pm-checklists/${checklistId}`);
      const data = await response.json();
      if (data.success && data.data) {
        const items = Array.isArray(data.data) ? data.data : [data.data];
        const master = items[0];
        if (master?.id || master?.checklist_id) {
          await db.insert(pmChecklistMaster).values({
            id: master.checklist_id || master.id,
            title: master.title || master.checklist_title || "",
            asset_type: master.asset_type || null,
            frequency: master.frequency || null,
            created_at: master.created_at ? new Date(master.created_at).getTime() : Date.now(),
          }).onConflictDoUpdate({ target: pmChecklistMaster.id, set: { title: master.title || "" } });
        }
        const itemRecords = items.map((item: any) => {
          const itemId = item.id || item.checklist_item_id;
          if (!itemId) return null;
          return {
            id: itemId,
            checklist_id: item.checklist_id || checklistId,
            task_name: item.task_name || "",
            field_type: item.field_type || null,
            sequence_no: item.sequence_no ?? null,
            image_mandatory: !!item.image_mandatory,
            remarks_mandatory: !!item.remarks_mandatory,
          };
        }).filter(Boolean) as Record<string, any>[];
        await cacheManager.write("pm_checklist_items", itemRecords);
        return items;
      }
      return [];
    } catch (error) {
      logger.error("Failed to fetch checklist items", { module: "PM_SERVICE", checklistId, error });
      return [];
    }
  },

  async getChecklistItems(checklistId: string): Promise<PMChecklistItemRow[]> {
    return db.select().from(pmChecklistItems).where(eq(pmChecklistItems.checklist_id, checklistId)).orderBy(asc(pmChecklistItems.sequence_no));
  },

  async getResponsesForInstance(instanceId: string): Promise<PMResponseRow[]> {
    return db.select().from(pmResponses).where(eq(pmResponses.instance_id, instanceId));
  },

  async saveExecutionProgress(
    instanceServerId: string,
    responses: PMResponseData[],
    options?: { status?: string; beforeImage?: string | null; afterImage?: string | null; clientSign?: string | null }
  ): Promise<void> {
    const localInstance = await this.getInstanceByServerId(instanceServerId);
    if (!localInstance) return;

    for (const data of responses) {
      if (data.response_value === undefined) continue;
      const [existing] = await db.select().from(pmResponses).where(and(eq(pmResponses.instance_id, instanceServerId), eq(pmResponses.checklist_item_id, data.checklist_item_id)));
      if (existing) {
        await db.update(pmResponses).set({ ...data, updated_at: Date.now() }).where(eq(pmResponses.id, existing.id));
      } else {
        await db.insert(pmResponses).values({ id: uuidv4(), instance_id: instanceServerId, ...data, created_at: Date.now(), updated_at: Date.now() });
      }
    }

    const checklistItems = await this.getChecklistItems(localInstance.maintenance_id!);
    const currentResponses = await this.getResponsesForInstance(instanceServerId);
    const answeredCount = currentResponses.filter(r => r.response_value).length;
    const progressStr = `${answeredCount}/${checklistItems.length}`;

    const updateData: any = { progress: progressStr, updated_at: Date.now() };
    if (options?.status) updateData.status = options.status;

    if (options?.beforeImage !== undefined) {
      updateData.before_image = await queueAttachmentIfLocal(
        options.beforeImage, "pm-completion", "pm_instance", instanceServerId, "before_image"
      );
    }
    
    if (options?.afterImage !== undefined) {
      updateData.after_image = await queueAttachmentIfLocal(
        options.afterImage, "pm-completion", "pm_instance", instanceServerId, "after_image"
      );
    }
    
    if (options?.clientSign !== undefined) {
      updateData.client_sign = await queueAttachmentIfLocal(
        options.clientSign, "pm-signatures", "pm_instance", instanceServerId, "client_sign"
      );
    }

    await db.update(pmInstances).set(updateData).where(eq(pmInstances.id, instanceServerId));

    // 1. Lock to sync queue immediately to protect local status during background refreshes
    const queueItemId = uuidv4();
    await db.insert(offlineQueue).values({
      id: queueItemId,
      entity_type: "pm_instance_update",
      operation: "update",
      payload: JSON.stringify({ id: instanceServerId, ...updateData }),
      created_at: Date.now(),
      retry_count: 0,
      last_error: null,
      status: "pending",
    });

    // 2. Try immediate synchronization if online
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        const response = await apiFetch(`/api/pm-instances/${instanceServerId}`, {
          method: "PUT",
          body: JSON.stringify(updateData),
        });
        if (response.ok) {
          logger.info("Immediate PM update successful, dequeueing", { module: "PM_SERVICE", instanceServerId });
          await cacheManager.dequeue(queueItemId);
          return;
        }
      } catch (err) {
        logger.warn("Immediate PM update failed, staying in queue", { module: "PM_SERVICE", error: err });
      }
    }
  },

  async startInstance(instanceServerId: string): Promise<void> {
    const updateData = { status: "In-progress", updated_at: Date.now() };
    await db.update(pmInstances).set(updateData).where(eq(pmInstances.id, instanceServerId));

    // 1. Lock to sync queue immediately
    const queueItemId = uuidv4();
    await db.insert(offlineQueue).values({
      id: queueItemId,
      entity_type: "pm_instance_update",
      operation: "update",
      payload: JSON.stringify({ id: instanceServerId, ...updateData }),
      created_at: Date.now(),
      retry_count: 0,
      last_error: null,
      status: "pending",
    });

    // 2. Try immediate synchronization
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        const response = await apiFetch(`/api/pm-instances/${instanceServerId}`, {
          method: "PUT",
          body: JSON.stringify(updateData),
        });
        if (response.ok) {
          await cacheManager.dequeue(queueItemId);
          return;
        }
      } catch (err) {
        logger.warn("Immediate startInstance failed, staying in queue", { module: "PM_SERVICE", error: err });
      }
    }
  },

  async getStats(siteCode: string, fromDate?: string | Date, toDate?: string | Date): Promise<any> {
    try {
      let endpoint = `/api/pm-instances/site/${siteCode}/stats`;
      const params = new URLSearchParams();
      const formatDate = (d: any) => {
        if (!d) return undefined;
        if (typeof d === "string") return d;
        if (typeof d === "number") return new Date(d).toISOString();
        if (d instanceof Date) return d.toISOString();
        return undefined;
      };

      if (fromDate) {
        const formatted = formatDate(fromDate);
        if (formatted) params.append("from_date", formatted);
      }
      if (toDate) {
        const formatted = formatDate(toDate);
        if (formatted) params.append("to_date", formatted);
      }
      if (params.toString()) endpoint += `?${params.toString()}`;

      const response = await apiFetch(endpoint);
      const data = await response.json();
      return data.success ? data.data : null;
    } catch (error) {
      logger.error("Failed to fetch PM stats", { module: "PM_SERVICE", siteCode, error });
      return null;
    }
  }
};

export default PMService;
