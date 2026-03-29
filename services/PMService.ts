import { eq, and, inArray, or, isNull, gte, lte, asc } from "drizzle-orm";
import { db, pmInstances, pmChecklistMaster, pmChecklistItems, pmResponses } from "@/database";
import { v4 as uuidv4 } from "uuid";
import cacheManager from "./CacheManager";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { StorageService } from "./StorageService";
import { AttachmentQueueService } from "./AttachmentQueueService";
import { format } from "date-fns";
import logger from "../utils/logger";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Shared API fetch helper with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}, customTimeout?: number) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  return fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  }, customTimeout);
};

const LOCAL_URI_PREFIXES = ["file://", "content://", "ph://", "asset-library://"];

const isLikelyLocalUri = (value?: string | null) =>
  !!value && LOCAL_URI_PREFIXES.some((prefix) => value.startsWith(prefix));

const isLocalUri = isLikelyLocalUri;

/**
 * If the given URI is a local file, queue it for deferred upload
 * and return the persistent local URI. Otherwise return the URI as-is.
 */
const queuePMAttachmentIfLocal = async (
  uri: string | null | undefined,
  entityType: "pm_instance" | "pm_response",
  entityId: string,
  field: string,
): Promise<string | null> => {
  if (!uri) return null;
  if (!isLocalUri(uri)) return uri;
  return AttachmentQueueService.queueAttachment({
    localUri: uri,
    bucketName: "jouleops-attachments",
    remotePath: `pm/${entityType}/${entityId}_${field}_${Date.now()}.jpg`,
    relatedEntityType: entityType,
    relatedEntityId: entityId,
    relatedField: field,
  });
};

export interface PMChecklistItemData {
  id: string;
  task_name: string;
  field_type: string | null;
  sequence_no: number | null;
  image_mandatory: boolean;
  remarks_mandatory: boolean;
}

export interface PMResponseData {
  checklist_item_id: string;
  response_value: string | null;
  readings: string | null;
  remarks: string | null;
  image_url: string | null;
}

/**
 * Upload pending asset if online, or queue for deferred upload if offline.
 * Uses AttachmentQueueService for offline-safe handling.
 */
const uploadPendingAssetIfNeeded = async (
  uriOrUrl: string | null | undefined,
  folder: "pm-checklists" | "pm-completion",
  recordId: string,
  entityType: "pm_instance" | "pm_response" = "pm_instance",
  field: string = "image_url",
): Promise<string | null> => {
  if (!uriOrUrl) return null;
  if (!isLikelyLocalUri(uriOrUrl)) return uriOrUrl;

  return queuePMAttachmentIfLocal(uriOrUrl, entityType, recordId, field);
};

// Helper type for PM instance rows returned by Drizzle
type PMInstanceRow = typeof pmInstances.$inferSelect;
type PMChecklistItemRow = typeof pmChecklistItems.$inferSelect;
type PMResponseRow = typeof pmResponses.$inferSelect;

const PMService = {
  /**
   * Fetch a single PM instance from API by ID
   */
  async fetchInstanceFromAPI(instanceId: string): Promise<any | null> {
    try {
      const response = await apiFetch(`/api/pm-instances/${instanceId}`);
      const data = await response.json();
      if (data.success && data.data) return data.data;
      return null;
    } catch (error) {
      logger.error("Failed to fetch PM instance from API", { module: "PM_SERVICE", error, instanceId });
      return null;
    }
  },

  /**
   * Fetch PM instances from API and cache them to local DB.
   * After caching instances, pre-fetches all linked checklists that aren't
   * already cached so every PM can show its checklist offline.
   */
  async fetchFromAPI(
    siteCode: string,
    fromDate?: Date,
    toDate?: Date,
    limit?: number,
    offset?: number,
    status?: string,
  ): Promise<any[]> {
    try {
      let endpoint = `/api/pm-instances/site/${siteCode}`;
      const params = new URLSearchParams();
      if (fromDate) params.append("from_date", fromDate.toISOString());
      if (toDate) params.append("to_date", toDate.toISOString());
      
      // Pagination support: Backend expects 'page' instead of 'offset'
      const requestedLimit = limit || 50;
      params.append("limit", requestedLimit.toString());
      
      if (offset !== undefined) {
        const page = Math.floor(offset / requestedLimit) + 1;
        params.append("page", page.toString());
      }
      
      if (status && status !== "All") {
        params.append("status", status);
      }
      
      if (params.toString()) endpoint += `?${params.toString()}`;


      const response = await apiFetch(endpoint);
      const data = await response.json();

      if (data.success && data.data?.length > 0) {
        logger.info("Fetched PM instances from API", {
          module: "PM_SERVICE",
          count: data.data.length,
          siteCode,
        });

        // Cache instances to local DB via CacheManager (best-effort)
        try {
          const records = data.data.map((inst: any) => ({
            id: inst.id,
            site_code: inst.site_code || siteCode,
            title: inst.title || "",
            asset_id: inst.asset_id || null,
            asset_type: inst.asset_type || "",
            location: inst.location || "",
            frequency: inst.frequency || "",
            status: inst.status || "",
            progress: inst.progress || "0/0",
            assigned_to_name: inst.assigned_to_name || null,
            start_due_date: inst.start_due_date
              ? new Date(inst.start_due_date).getTime()
              : null,
            maintenance_id: inst.maintenance_id || inst.checklist_id || null,
            client_sign: inst.client_sign || null,
            before_image: inst.before_image || null,
            after_image: inst.after_image || null,
            created_at: inst.created_at
              ? new Date(inst.created_at).getTime()
              : Date.now(),
            updated_at: Date.now(),
          }));

          // ── Merge pending offline changes ─────────────────────────────
          // If the user made changes offline (e.g. moved a PM to In-progress),
          // those changes are in the offline_queue but may not be on the server yet.
          // We must overlay the local state so the API doesn't overwrite it.
          try {
            const pendingUpdates = await cacheManager.getPendingQueueItemsByType("pm_instance_update");
            if (pendingUpdates.length > 0) {
              const pendingMap = new Map<string, Record<string, any>>();
              for (const item of pendingUpdates) {
                const id = item.payload?.id;
                if (id) pendingMap.set(id, item.payload);
              }

              let mergedCount = 0;
              for (const record of records) {
                const pending = pendingMap.get(record.id);
                if (pending) {
                  // Overlay local fields onto the API record
                  if (pending.status) record.status = pending.status;
                  if (pending.progress) record.progress = pending.progress;
                  if (pending.before_image !== undefined) record.before_image = pending.before_image;
                  if (pending.after_image !== undefined) record.after_image = pending.after_image;
                  if (pending.client_sign !== undefined) record.client_sign = pending.client_sign;
                  mergedCount++;
                }
              }

              if (mergedCount > 0) {
                logger.info("PMService: merged pending syncs into fetched records", {
                  module: "PM_SERVICE",
                  mergedCount,
                  totalPending: pendingUpdates.length,
                });
              }
            }
          } catch (mergeErr) {
            logger.debug("PMService: could not merge pending syncs", {
              module: "PM_SERVICE",
              error: mergeErr,
            });
          }

          if (records.length > 0) {
            logger.debug("PMService: caching records sample", {
              siteCode,
              firstRecordSiteCode: records[0].site_code,
              totalRecords: records.length,
            });
          }

          await cacheManager.write("pm_instances", records);
          logger.info("Cached PM instances to local DB", {
            module: "PM_SERVICE",
            count: data.data.length,
            siteCode,
          });
        } catch (cacheErr) {
          logger.warn("Failed to cache PM instances to local DB", {
            module: "PM_SERVICE",
            error: cacheErr,
            siteCode,
          });
        }

        // Pre-fetch all checklists that aren't already cached locally
        const checklistIds: string[] = [
          ...new Set(
            data.data
              .map((inst: any) => inst.maintenance_id || inst.checklist_id)
              .filter(Boolean) as string[],
          ),
        ];

        if (checklistIds.length > 0) {
          // Find which ones are already cached
          const alreadyCached = new Set<string>();
          try {
            for (const cid of checklistIds) {
              const existing = await db
                .select({ id: pmChecklistItems.id })
                .from(pmChecklistItems)
                .where(eq(pmChecklistItems.checklist_id, cid))
                .limit(1);
              if (existing.length > 0) alreadyCached.add(cid);
            }
          } catch {
            // DB not ready yet — fetch all
          }

          const toFetch = checklistIds.filter((id) => !alreadyCached.has(id));

          logger.info("Pre-fetching checklists", {
            module: "PM_SERVICE",
            total: checklistIds.length,
            toFetch: toFetch.length,
            alreadyCached: alreadyCached.size,
          });

          // Fetch concurrently in small batches to avoid hammering the API
          const BATCH = 5;
          for (let i = 0; i < toFetch.length; i += BATCH) {
            await Promise.all(
              toFetch.slice(i, i + BATCH).map((cid) =>
                this.fetchChecklistItemsFromAPI(cid).catch((err) =>
                  logger.warn("Failed to pre-fetch checklist", {
                    module: "PM_SERVICE",
                    checklistId: cid,
                    error: err,
                  }),
                ),
              ),
            );
          }
        }

        return data.data;
      }

      return [];
    } catch (error) {
      logger.error("Failed to fetch PM instances from API", {
        module: "PM_SERVICE",
        error,
        siteCode,
      });
      return [];
    }
  },

  /**
   * Get PM instances for a site from local database.
   * Filters by status if provided.
   */
  async getLocalInstances(
    siteCode: string,
    statusFilter?: string[],
    frequencyFilter?: string,
    assetTypeFilter?: string,
    fromDate?: number | null,
    toDate?: number | null,
  ): Promise<PMInstanceRow[]> {
    const conditions: any[] = [];

    if (siteCode && siteCode !== "all") {
      conditions.push(eq(pmInstances.site_code, siteCode.trim().toUpperCase()));
    }

    if (statusFilter && statusFilter.length > 0) {
      conditions.push(inArray(pmInstances.status, statusFilter));
    }
    if (frequencyFilter) {
      conditions.push(eq(pmInstances.frequency, frequencyFilter));
    }
    if (assetTypeFilter) {
      conditions.push(eq(pmInstances.asset_type, assetTypeFilter));
    }
    if (fromDate && toDate && fromDate !== 0) {
      conditions.push(
        or(
          isNull(pmInstances.start_due_date),
          and(
            gte(pmInstances.start_due_date, fromDate),
            lte(pmInstances.start_due_date, toDate),
          ),
        ) as any,
      );
    } else if (fromDate && fromDate !== 0) {
      conditions.push(
        or(isNull(pmInstances.start_due_date), gte(pmInstances.start_due_date, fromDate)) as any,
      );
    } else if (toDate) {
      conditions.push(
        or(isNull(pmInstances.start_due_date), lte(pmInstances.start_due_date, toDate)) as any,
      );
    }

    return db
      .select()
      .from(pmInstances)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(pmInstances.start_due_date));
  },

  /**
   * Get a single PM instance by its ID.
   */
  async getInstanceByServerId(serverId: string): Promise<PMInstanceRow | null> {
    const results = await db
      .select()
      .from(pmInstances)
      .where(eq(pmInstances.id, serverId));

    return results.length > 0 ? results[0] : null;
  },

  /**
   * Fetch checklist items from API and cache them to local DB.
   */
  async fetchChecklistItemsFromAPI(checklistId: string): Promise<any[]> {
    try {
      const response = await apiFetch(`/api/pm-checklists/${checklistId}`);
      const data = await response.json();

      if (data.success && data.data) {
        const items: any[] = Array.isArray(data.data) ? data.data : [data.data];

        // Cache to local DB via CacheManager (best-effort)
        try {
          // Cache checklist master row (direct write — no CacheManager domain for pm_checklist_master)
          const master = items[0];
          if (master?.checklist_id || master?.id) {
            const masterId = master.checklist_id || checklistId;
            await db
              .insert(pmChecklistMaster)
              .values({
                id: masterId,
                title: master.title || master.checklist_title || "",
                asset_type: master.asset_type || null,
                frequency: master.frequency || null,
                created_at: master.created_at
                  ? new Date(master.created_at).getTime()
                  : Date.now(),
              })
              .onConflictDoUpdate({
                target: pmChecklistMaster.id,
                set: { title: master.title || master.checklist_title || "" },
              });
          }

          // Cache checklist items via CacheManager
          const itemRecords = items
            .map((item: any) => {
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
            })
            .filter(Boolean) as Record<string, any>[];

          await cacheManager.write("pm_checklist_items", itemRecords);

          logger.info("Fetched and cached checklist items", {
            module: "PM_SERVICE",
            count: items.length,
            checklistId,
          });
        } catch (cacheErr) {
          logger.warn("Failed to cache checklist items to local DB", {
            module: "PM_SERVICE",
            error: cacheErr,
            checklistId,
          });
        }

        return items;
      }

      return [];
    } catch (error) {
      logger.error("Failed to fetch checklist items from API", {
        module: "PM_SERVICE",
        error,
        checklistId,
      });
      return [];
    }
  },

  /**
   * Get checklist items for a specific checklist_id.
   */
  async getChecklistItems(checklistId: string): Promise<PMChecklistItemRow[]> {
    return db
      .select()
      .from(pmChecklistItems)
      .where(eq(pmChecklistItems.checklist_id, checklistId))
      .orderBy(asc(pmChecklistItems.sequence_no));
  },

  /**
   * Get all local responses for an instance.
   */
  async getResponsesForInstance(
    instanceId: string,
  ): Promise<PMResponseRow[]> {
    return db
      .select()
      .from(pmResponses)
      .where(eq(pmResponses.instance_id, instanceId));
  },

  /**
   * Save PM execution progress in a single batch (Responses + Instance Status + Images).
   */
  async saveExecutionProgress(
    instanceServerId: string,
    responses: PMResponseData[],
    options?: {
      status?: string;
      beforeImage?: string | null;
      afterImage?: string | null;
      clientSign?: string | null;
    }
  ): Promise<void> {
    const local = await this.getInstanceByServerId(instanceServerId);

    if (!local) {
      logger.warn("Cannot save progress - Instance not found locally", { instanceServerId });
      return;
    }

    // Handle responses
    const existingResponses = await db
      .select()
      .from(pmResponses)
      .where(eq(pmResponses.instance_id, instanceServerId));

    const existingMap = new Map(existingResponses.map(r => [r.checklist_item_id, r]));

    for (const data of responses) {
      // Skip explicitly undefined responses to avoid corrupting previous ones
      if (data.response_value === undefined) continue;

      const existingItem = existingMap.get(data.checklist_item_id);

      if (existingItem) {
        await db
          .update(pmResponses)
          .set({
            response_value: data.response_value,
            readings: data.readings || null,
            remarks: data.remarks || null,
            image_url: data.image_url || null,
            updated_at: Date.now(),
          })
          .where(eq(pmResponses.id, existingItem.id));
      } else {
        await db.insert(pmResponses).values({
          id: uuidv4(),
          instance_id: instanceServerId,
          checklist_item_id: data.checklist_item_id,
          response_value: data.response_value,
          readings: data.readings || null,
          remarks: data.remarks || null,
          image_url: data.image_url || null,
          created_at: Date.now(),
          updated_at: Date.now(),
        });
      }
    }

    // Determine progress string
    const checklistItemsList = await this.getChecklistItems(local.maintenance_id!);
    // Calculate answered by combining newly passed responses AND existing responses that weren't modified
    const newlyPassedIds = new Set(responses.map(r => r.checklist_item_id));

    let answeredCount = 0;

    // Count newly passed that have proper response
    answeredCount += responses.filter(r => r.response_value).length;

    // Count existing that HAVE NOT been passed but already had a response
    existingMap.forEach((val, id) => {
      if (!newlyPassedIds.has(id as string) && val.response_value) {
        answeredCount++;
      }
    });

    const total = checklistItemsList.length;
    const progressStr = `${answeredCount}/${total}`;

    // Update Instance record
    const updateData: Partial<typeof pmInstances.$inferInsert> = {
      progress: progressStr,
      updated_at: Date.now(),
    };
    if (options?.status) updateData.status = options.status;
    if (options?.beforeImage !== undefined) updateData.before_image = options.beforeImage ?? null;
    if (options?.afterImage !== undefined) updateData.after_image = options.afterImage ?? null;
    if (options?.clientSign !== undefined) updateData.client_sign = options.clientSign ?? null;

    await db
      .update(pmInstances)
      .set(updateData)
      .where(eq(pmInstances.id, instanceServerId));

    // Enqueue each response for offline sync
    for (const data of responses) {
      if (data.response_value === undefined) continue;
      const existingItem = existingMap.get(data.checklist_item_id);
      await cacheManager.enqueue({
        entity_type: "pm_response_upsert",
        operation: existingItem ? "update" : "create",
        payload: {
          id: existingItem?.id || undefined,
          instance_id: instanceServerId,
          checklist_item_id: data.checklist_item_id,
          response_value: data.response_value,
          readings: data.readings || null,
          remarks: data.remarks || null,
          image_url: data.image_url || null,
        },
      });
    }

    // Enqueue instance update if status/images changed
    if (options?.status || options?.beforeImage !== undefined || options?.afterImage !== undefined || options?.clientSign !== undefined) {
      await cacheManager.enqueue({
        entity_type: "pm_instance_update",
        operation: "update",
        payload: {
          id: instanceServerId,
          ...updateData,
        },
      });
    }

    // Best-effort API calls
    try {
      for (const data of responses) {
        if (data.response_value === undefined) continue;
        await apiFetch("/api/pm-response", {
          method: "POST",
          body: JSON.stringify({
            instance_id: instanceServerId,
            checklist_item_id: data.checklist_item_id,
            response_value: data.response_value,
            readings: data.readings || null,
            remarks: data.remarks || null,
            image_url: data.image_url || null,
          }),
        });
      }
      if (options?.status) {
        await apiFetch(`/api/pm-instances/${instanceServerId}`, {
          method: "PUT",
          body: JSON.stringify(updateData),
        });
      }
    } catch {
      logger.debug("saveExecutionProgress: API call failed, will sync later", { module: "PM_SERVICE" });
    }
  },

  /**
   * Save a single PM response locally.
   */
  async saveResponseLocally(
    data: PMResponseData & { instanceServerId: string },
  ): Promise<PMResponseRow> {
    // Check if response already exists
    const existing = await db
      .select()
      .from(pmResponses)
      .where(
        and(
          eq(pmResponses.instance_id, data.instanceServerId),
          eq(pmResponses.checklist_item_id, data.checklist_item_id),
        ),
      );

    let resultRecord: PMResponseRow;
    if (existing.length > 0) {
      await db
        .update(pmResponses)
        .set({
          response_value: data.response_value,
          readings: data.readings,
          remarks: data.remarks,
          image_url: data.image_url,
          updated_at: Date.now(),
        })
        .where(eq(pmResponses.id, existing[0].id));

      // Re-fetch the updated record
      const updated = await db
        .select()
        .from(pmResponses)
        .where(eq(pmResponses.id, existing[0].id));
      resultRecord = updated[0];
    } else {
      const newId = uuidv4();
      await db.insert(pmResponses).values({
        id: newId,
        instance_id: data.instanceServerId,
        checklist_item_id: data.checklist_item_id,
        response_value: data.response_value,
        readings: data.readings,
        remarks: data.remarks,
        image_url: data.image_url,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const inserted = await db
        .select()
        .from(pmResponses)
        .where(eq(pmResponses.id, newId));
      resultRecord = inserted[0];
    }

    // Inline progress update
    const local = await this.getInstanceByServerId(data.instanceServerId);
    if (local) {
      const checklistItemsList = await this.getChecklistItems(local.maintenance_id!);
      const currentResponses = await this.getResponsesForInstance(data.instanceServerId);
      const answered = currentResponses.filter((r) => r.response_value).length;
      const total = checklistItemsList.length;

      await db
        .update(pmInstances)
        .set({
          progress: `${answered}/${total}`,
          updated_at: Date.now(),
        })
        .where(eq(pmInstances.id, data.instanceServerId));
    }

    // Enqueue for offline sync
    await cacheManager.enqueue({
      entity_type: "pm_response_upsert",
      operation: existing.length > 0 ? "update" : "create",
      payload: {
        id: resultRecord.id,
        instance_id: data.instanceServerId,
        checklist_item_id: data.checklist_item_id,
        response_value: data.response_value,
        readings: data.readings || null,
        remarks: data.remarks || null,
        image_url: data.image_url || null,
      },
    });

    // Best-effort API call
    try {
      await apiFetch("/api/pm-response", {
        method: "POST",
        body: JSON.stringify({
          id: resultRecord.id,
          instance_id: data.instanceServerId,
          checklist_item_id: data.checklist_item_id,
          response_value: data.response_value,
          readings: data.readings || null,
          remarks: data.remarks || null,
          image_url: data.image_url || null,
        }),
      });
    } catch {
      logger.debug("saveResponseLocally: API call failed, will sync later", { module: "PM_SERVICE" });
    }

    return resultRecord;
  },

  /**
   * Update local instance progress string 'X/Y'
   */
  async updateLocalInstanceProgress(instanceServerId: string): Promise<void> {
    const local = await this.getInstanceByServerId(instanceServerId);
    if (!local) return;

    const checklistItemsList = await this.getChecklistItems(local.maintenance_id!);
    const responses = await this.getResponsesForInstance(instanceServerId);

    const answered = responses.filter((r) => r.response_value).length;
    const total = checklistItemsList.length;
    const progressStr = `${answered}/${total}`;

    await db
      .update(pmInstances)
      .set({
        progress: progressStr,
        updated_at: Date.now(),
      })
      .where(eq(pmInstances.id, instanceServerId));
  },

  /**
   * Mark PM instance as In Progress locally and queue for sync.
   */
  async startInstance(instanceServerId: string): Promise<void> {
    const local = await this.getInstanceByServerId(instanceServerId);
    if (local) {
      await db
        .update(pmInstances)
        .set({
          status: "In-progress",
          updated_at: Date.now(),
        })
        .where(eq(pmInstances.id, instanceServerId));

      // Enqueue for offline sync
      await cacheManager.enqueue({
        entity_type: "pm_instance_update",
        operation: "update",
        payload: { id: instanceServerId, status: "In-progress" },
      });

      // Best-effort API call
      try {
        await apiFetch(`/api/pm-instances/${instanceServerId}`, {
          method: "PUT",
          body: JSON.stringify({ status: "In-progress" }),
        });
      } catch {
        logger.debug("startInstance: API call failed, will sync later", { module: "PM_SERVICE" });
      }
    }
  },

  /**
   * Complete a PM instance with signature and images.
   * Changes are queued for sync to the backend.
   */
  async completeInstance(
    instanceServerId: string,
    clientSign: string,
    beforeImage?: string,
    afterImage?: string,
  ): Promise<void> {
    const local = await this.getInstanceByServerId(instanceServerId);
    if (local) {
      const checklistItemsList = await this.getChecklistItems(local.maintenance_id!);
      const total = checklistItemsList.length;

      const updateData = {
        status: "Completed",
        progress: `${total}/${total}`,
        client_sign: clientSign,
        before_image: beforeImage || null,
        after_image: afterImage || null,
        updated_at: Date.now(),
      };

      await db
        .update(pmInstances)
        .set(updateData)
        .where(eq(pmInstances.id, instanceServerId));

      // Enqueue for offline sync
      await cacheManager.enqueue({
        entity_type: "pm_instance_update",
        operation: "update",
        payload: { id: instanceServerId, ...updateData },
      });

      // Best-effort API call
      try {
        await apiFetch(`/api/pm-instances/${instanceServerId}`, {
          method: "PUT",
          body: JSON.stringify(updateData),
        });
      } catch {
        logger.debug("completeInstance: API call failed, will sync later", { module: "PM_SERVICE" });
      }
    }
  },
};

export default PMService;
