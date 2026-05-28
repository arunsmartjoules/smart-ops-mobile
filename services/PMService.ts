import { eq, and, inArray, or, isNull, gte, lte, asc, sql } from "drizzle-orm";
import { db, pmInstances, pmChecklistMaster, pmChecklistItems, pmResponses, offlineQueue } from "@/database";
import { v4 as uuidv4 } from "uuid";
import cacheManager from "./CacheManager";
import { fetchWithTimeout, apiFetch as centralApiFetch } from "../utils/apiHelper";
import { AttachmentQueueService } from "./AttachmentQueueService";
import logger from "../utils/logger";
import { API_BASE_URL } from "../constants/api";
import NetInfo from "@react-native-community/netinfo";
import { toIstDayMs } from "../utils/istDate";

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
  async prunePendingInstanceUpdates(instanceId: string): Promise<void> {
    const pending = await db
      .select({ id: offlineQueue.id, payload: offlineQueue.payload })
      .from(offlineQueue)
      .where(
        and(
          eq(offlineQueue.entity_type, "pm_instance_update"),
          eq(offlineQueue.status, "pending"),
        ),
      );

    const staleIds = pending
      .filter((row) => {
        try {
          const parsed = JSON.parse(row.payload);
          return parsed?.id === instanceId;
        } catch {
          return false;
        }
      })
      .map((row) => row.id);

    for (const id of staleIds) {
      await db.delete(offlineQueue).where(eq(offlineQueue.id, id));
    }
  },

  /**
   * Fetch PM instances from API and cache them to local DB.
   *
   * `opts.stampSync` (default true) controls whether `cacheManager.write`
   * bumps the domain `last_synced_at`. SyncEngine's multi-site loop passes
   * `false` and stamps once at the end, so a per-site failure can't lock
   * the whole domain "fresh" with a partial pull.
   *
   * `opts.throwOnError` (default false) lets the caller distinguish a real
   * fetch failure from an empty server response — the multi-site loop uses
   * this to abort and leave the domain eligible for the next sync tick.
   */
  async fetchFromAPI(
    siteCode: string,
    limit?: number,
    offset?: number,
    fromDate?: string | Date,
    toDate?: string | Date,
    status?: string,
    opts?: { stampSync?: boolean; throwOnError?: boolean },
  ): Promise<any[]> {
    const stampSync = opts?.stampSync !== false;
    const throwOnError = opts?.throwOnError === true;
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
      if (!response.ok) {
        // Surface real failures (auth, 5xx, etc.) to a sync caller that
        // gates domain freshness on every site succeeding. Otherwise keep
        // the legacy silent-empty contract that the screen relies on.
        if (throwOnError) {
          const err: any = new Error(`pm-instances API ${response.status}`);
          err.statusCode = response.status;
          throw err;
        }
        return [];
      }
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
          start_due_date: toIstDayMs(inst.start_due_date),
          maintenance_id: inst.maintenance_id || inst.checklist_id || null,
          client_sign: inst.client_sign || null,
          before_image: inst.before_image || null,
          after_image: inst.after_image || null,
          completed_on: (() => {
            const d = new Date(inst.completed_on);
            return isNaN(d.getTime()) ? null : d.getTime();
          })(),
          created_at: inst.created_at ? new Date(inst.created_at).getTime() : Date.now(),
          updated_at: Date.now(),
        }));

        // Filter out records that are currently in the local sync queue to avoid overwriting "new" local data with "stale" server data.
        const pendingIds = await this.getPendingInstanceIds();
        const finalRecords = records.filter((r: any) => !pendingIds.includes(r.id));

        if (finalRecords.length > 0) {
          await cacheManager.write("pm_instances", finalRecords, { stampSync });
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
      if (throwOnError) throw error;
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
        .select({ payload: offlineQueue.payload, created_at: offlineQueue.created_at })
        .from(offlineQueue)
        .where(
          and(
            eq(offlineQueue.entity_type, "pm_instance_update"),
            eq(offlineQueue.status, "pending"),
          ),
        );

      const map: Record<string, any> = {};
      const latestById: Record<string, number> = {};
      results.forEach((r) => {
        try {
          const parsed = JSON.parse(r.payload);
          if (!parsed.id) return;
          const ts = Number(r.created_at || 0);
          // Keep only the latest pending update for each instance.
          if (!latestById[parsed.id] || ts >= latestById[parsed.id]) {
            latestById[parsed.id] = ts;
            map[parsed.id] = parsed;
          }
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
          start_due_date: toIstDayMs(inst.start_due_date),
          maintenance_id: inst.maintenance_id || inst.checklist_id || null,
          client_sign: inst.client_sign || null,
          before_image: inst.before_image || null,
          after_image: inst.after_image || null,
          completed_on: (() => {
            const d = new Date(inst.completed_on);
            return isNaN(d.getTime()) ? null : d.getTime();
          })(),
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

  /**
   * Fetches existing responses for a PM instance from the API and caches them.
   */
  async fetchInstanceResponses(instanceId: string): Promise<PMResponseRow[]> {
    try {
      const response = await apiFetch(`/api/pm-response/instance/${instanceId}`);
      if (!response.ok) return [];
      
      const data = await response.json();
      if (data.success && Array.isArray(data.data)) {
        const records = data.data.map((r: any) => ({
          id: r.id,
          instance_id: instanceId,
          checklist_item_id: r.checklist_id, // Server's checklist_id is mobile's checklist_item_id
          response_value: r.response_value || null,
          remarks: r.remarks || null,
          image_url: r.image_url || null,
          readings: r.readings || null,
          created_at: r.created_at ? new Date(r.created_at).getTime() : Date.now(),
          updated_at: r.updated_at ? new Date(r.updated_at).getTime() : Date.now(),
        }));
        
        if (records.length > 0) {
          await cacheManager.write("pm_responses", records);
        }
        return records;
      }
      return [];
    } catch (error) {
      logger.error("Failed to fetch instance responses", { module: "PM_SERVICE", instanceId, error });
      return [];
    }
  },

  async saveExecutionProgress(
    instanceServerId: string,
    responses: PMResponseData[],
    options?: { status?: string; beforeImage?: string | null; afterImage?: string | null; clientSign?: string | null; completed_on?: number | null }
  ): Promise<void> {
    let localInstance = await this.getInstanceByServerId(instanceServerId);
    // If this PM was opened from API before being cached locally, hydrate once
    // so status/progress updates still persist.
    if (!localInstance) {
      localInstance = await this.fetchInstanceFromAPI(instanceServerId);
    }
    // Capture pre-mutation status/completed_on so a server-side rejection on
    // a Completed-transition can roll the local row back. Without this, the
    // local cache shows Completed while the server still says In-progress.
    const previousStatus = localInstance?.status ?? null;
    const previousCompletedOn = localInstance?.completed_on ?? null;

    for (const data of responses) {
      if (data.response_value === undefined) continue;
      
      const [existing] = await db.select().from(pmResponses).where(and(eq(pmResponses.instance_id, instanceServerId), eq(pmResponses.checklist_item_id, data.checklist_item_id)));
      
      let responseId = existing?.id;
      if (existing) {
        await db.update(pmResponses).set({ ...data, updated_at: Date.now() }).where(eq(pmResponses.id, existing.id));
      } else {
        responseId = uuidv4();
        await db.insert(pmResponses).values({ 
          id: responseId, 
          instance_id: instanceServerId, 
          ...data, 
          created_at: Date.now(), 
          updated_at: Date.now() 
        });
      }

      // Enqueue response for synchronization
      await db.insert(offlineQueue).values({
        id: uuidv4(),
        entity_type: "pm_response_upsert",
        operation: "update", // We use 'update' as a general 'upsert' operation in SyncEngine
        payload: JSON.stringify({
          id: responseId,
          instance_id: instanceServerId,
          checklist_id: data.checklist_item_id, // Map checklist_item_id -> checklist_id for backend
          response_value: data.response_value,
          remarks: data.remarks,
          image_url: data.image_url,
          readings: data.readings,
        }),
        created_at: Date.now(),
        retry_count: 0,
        last_error: null,
        status: "pending",
      });
    }

    const currentResponses = await this.getResponsesForInstance(instanceServerId);
    const answeredCount = currentResponses.filter(r => r.response_value).length;
    const checklistItems = localInstance?.maintenance_id
      ? await this.getChecklistItems(localInstance.maintenance_id)
      : [];
    const totalCount =
      checklistItems.length > 0
        ? checklistItems.length
        : Math.max(
            currentResponses.length,
            responses.filter((r) => r.response_value !== undefined).length,
          );
    const progressStr = totalCount > 0 ? `${answeredCount}/${totalCount}` : undefined;

    const updateData: any = { updated_at: Date.now() };
    if (progressStr) updateData.progress = progressStr;
    if (options?.status) updateData.status = options.status;
    if (options?.completed_on !== undefined) {
      updateData.completed_on = options.completed_on;
    }

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

    // Enqueue instance metadata update (drop stale pending updates for same PM first)
    await this.prunePendingInstanceUpdates(instanceServerId);
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

    // Build API-safe payload: convert completed_on from ms-epoch to ISO string
    // so Postgres timestamp columns accept the value.
    const apiPayload = { ...updateData };
    if (apiPayload.completed_on && typeof apiPayload.completed_on === "number") {
      apiPayload.completed_on = new Date(apiPayload.completed_on).toISOString();
    }

    // Try immediate synchronization
    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      // The server validates Completed transitions against its own DB. Any
      // pm_response_upsert items still queued for this instance must reach
      // the server first, otherwise validation reports "missing responses"
      // for the rows the user typed in moments ago while offline.
      if (options?.status === "Completed") {
        try {
          await this.flushPendingResponsesForInstance(instanceServerId);
        } catch (err) {
          logger.warn("Pre-completion response flush failed", {
            module: "PM_SERVICE",
            instanceId: instanceServerId,
            error: err,
          });
        }
      }

      try {
        const response = await apiFetch(`/api/pm-instances/${instanceServerId}`, {
          method: "PUT",
          body: JSON.stringify(apiPayload),
        });
        if (response.ok) {
          await cacheManager.dequeue(queueItemId);
        } else {
          const isCompletionAttempt = options?.status === "Completed";
          const is4xx = response.status >= 400 && response.status < 500;

          if (isCompletionAttempt && is4xx) {
            // Server rejected the completion (mandatory field missing,
            // permission, etc.). Roll back the optimistic local status so
            // cache and server agree, drop the queued PUT — it would 4xx
            // every retry until dead-letter — and surface the message so
            // the caller can show it to the user instead of swallowing it.
            let errorBody: any = null;
            try {
              errorBody = await response.json();
            } catch {
              // No JSON body — fall back to a generic message below.
            }

            // pm_instances.status is NOT NULL — skip the row update if we
            // never had a previous local row to roll back to. Either way,
            // dequeue the bad PUT so SyncEngine doesn't burn retries on a
            // request the server will reject every time.
            if (previousStatus) {
              await db
                .update(pmInstances)
                .set({
                  status: previousStatus,
                  completed_on: previousCompletedOn,
                  updated_at: Date.now(),
                })
                .where(eq(pmInstances.id, instanceServerId));
            }

            await cacheManager.dequeue(queueItemId);

            const message =
              errorBody?.error ||
              "PM completion was rejected by the server.";
            const err: any = new Error(message);
            err.name = "PMCompletionBlockedError";
            err.statusCode = response.status;
            err.details = errorBody?.details?.validation ?? null;
            throw err;
          }

          logger.warn("PM instance PUT returned non-OK, keeping in queue", {
            module: "PM_SERVICE",
            status: response.status,
            instanceId: instanceServerId,
          });
        }
      } catch (err: any) {
        if (err?.name === "PMCompletionBlockedError") throw err;
        logger.warn("Immediate PM update failed, staying in queue", { module: "PM_SERVICE", error: err });
      }
    }
  },

  /**
   * Push any queued pm_response_upsert items for `instanceServerId` to the
   * server before a completion attempt. Items that POST successfully are
   * dequeued; failures are left in the queue for SyncEngine to retry on its
   * next flush.
   */
  async flushPendingResponsesForInstance(instanceServerId: string): Promise<void> {
    const rows = await db
      .select({ id: offlineQueue.id, payload: offlineQueue.payload })
      .from(offlineQueue)
      .where(
        and(
          eq(offlineQueue.entity_type, "pm_response_upsert"),
          eq(offlineQueue.status, "pending"),
        ),
      );

    for (const row of rows) {
      let parsed: any;
      try {
        parsed = JSON.parse(row.payload);
      } catch {
        continue;
      }
      if (parsed?.instance_id !== instanceServerId) continue;

      try {
        const response = await apiFetch(`/api/pm-response`, {
          method: "POST",
          body: JSON.stringify(parsed),
        });
        if (response.ok) {
          await cacheManager.dequeue(row.id);
        }
      } catch {
        // Transient — leave in queue for SyncEngine to retry.
      }
    }
  },

  /**
   * Start a PM from the pre-execution modal: records status In-progress, the
   * captured before_image, and an explicit device-side start_datetime.
   *
   * start_datetime is sent from the device (not left for the backend to
   * auto-stamp) so an offline start preserves the real tap time — the backend
   * only auto-sets start_datetime when it isn't provided
   * (pmInstancesController.update). before_image is captured here precisely so
   * the execution screen never has to mutate it (which previously raced with
   * the post-status-transition instance re-fetch and wiped the image).
   */
  async startExecution(
    instanceServerId: string,
    options: {
      beforeImage: string;
      startDatetime: string;
      assignedToName?: string;
    },
  ): Promise<void> {
    const beforeImageValue = await queueAttachmentIfLocal(
      options.beforeImage,
      "pm-completion",
      "pm_instance",
      instanceServerId,
      "before_image",
    );

    const now = Date.now();
    // Assignment is stamped here — at the moment the PM is started — and
    // never re-touched when the same PM is reopened from the In-progress
    // tab, so it always reflects who actually started the work.
    const assignment = options.assignedToName
      ? { assigned_to_name: options.assignedToName }
      : {};
    // Local pm_instances has no start_datetime column; it lives only in the
    // sync payload (backend pm_instances does have it).
    const localUpdate = {
      status: "In-progress",
      before_image: beforeImageValue,
      updated_at: now,
      ...assignment,
    };
    await db
      .update(pmInstances)
      .set(localUpdate)
      .where(eq(pmInstances.id, instanceServerId));

    const syncPayload = {
      id: instanceServerId,
      status: "In-progress",
      before_image: beforeImageValue,
      start_datetime: options.startDatetime,
      updated_at: now,
      ...assignment,
    };

    await this.prunePendingInstanceUpdates(instanceServerId);
    const queueItemId = uuidv4();
    await db.insert(offlineQueue).values({
      id: queueItemId,
      entity_type: "pm_instance_update",
      operation: "update",
      payload: JSON.stringify(syncPayload),
      created_at: now,
      retry_count: 0,
      last_error: null,
      status: "pending",
    });

    const netState = await NetInfo.fetch();
    if (netState.isConnected) {
      try {
        const response = await apiFetch(
          `/api/pm-instances/${instanceServerId}`,
          { method: "PUT", body: JSON.stringify(syncPayload) },
        );
        if (response.ok) {
          await cacheManager.dequeue(queueItemId);
        } else {
          logger.warn("PM startExecution PUT non-OK, keeping in queue", {
            module: "PM_SERVICE",
            status: response.status,
            instanceId: instanceServerId,
          });
        }
      } catch (err) {
        logger.warn("Immediate startExecution failed, staying in queue", {
          module: "PM_SERVICE",
          error: err,
        });
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
  },

  /**
   * Updates the assigned_to_name locally and sends to backend.
   */
  async updateAssignment(instanceId: string, userName: string): Promise<void> {
    try {
      const updateData = { assigned_to_name: userName, updated_at: Date.now() };
      
      // Update local DB
      await db.update(pmInstances).set(updateData).where(eq(pmInstances.id, instanceId));
      
      // Enqueue sync
      await db.insert(offlineQueue).values({
        id: uuidv4(),
        entity_type: "pm_instance_update",
        operation: "update",
        payload: JSON.stringify({ id: instanceId, ...updateData }),
        created_at: Date.now(),
        retry_count: 0,
        last_error: null,
        status: "pending",
      });

      // Try immediate sync if online
      const netState = await NetInfo.fetch();
      if (netState.isConnected) {
        apiFetch(`/api/pm-instances/${instanceId}`, {
          method: "PUT",
          body: JSON.stringify(updateData),
        }).catch(() => {});
      }
    } catch (error) {
      logger.error("Failed to update PM assignment", { module: "PM_SERVICE", instanceId, error });
    }
  }
};

export default PMService;
