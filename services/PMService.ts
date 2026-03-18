import { Q } from "@nozbe/watermelondb";
import {
  database,
  pmInstanceCollection,
  pmChecklistItemCollection,
  pmResponseCollection,
} from "../database";
import PMInstance from "../database/models/PMInstance";
import PMChecklistItem from "../database/models/PMChecklistItem";
import PMResponse from "../database/models/PMResponse";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { syncManager } from "./SyncManager";
import { StorageService } from "./StorageService";
import NetInfo from "@react-native-community/netinfo";
import { format } from "date-fns";
import logger from "../utils/logger";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Shared API fetch helper with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? null;
  return fetchWithTimeout(`${BACKEND_URL}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
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

const LOCAL_URI_PREFIXES = ["file://", "content://", "ph://", "asset-library://"];

const isLikelyLocalUri = (value?: string | null) =>
  !!value && LOCAL_URI_PREFIXES.some((prefix) => value.startsWith(prefix));

const uploadPendingAssetIfNeeded = async (
  uriOrUrl: string | null | undefined,
  folder: "pm-checklists" | "pm-completion",
  recordId: string,
): Promise<string | null> => {
  if (!uriOrUrl) return null;
  if (!isLikelyLocalUri(uriOrUrl)) return uriOrUrl;

  const fileName = `${folder}/${recordId}_${Date.now()}.jpg`;
  const uploadedUrl = await StorageService.uploadFile(
    "jouleops-attachments",
    fileName,
    uriOrUrl,
  );

  return uploadedUrl;
};

const PMService = {
  /**
   * Get PM instances for a site from local WatermelonDB.
   * Filters by status if provided.
   */
  async getLocalInstances(
    siteCode: string,
    statusFilter?: string[],
    frequencyFilter?: string,
    assetTypeFilter?: string,
    fromDate?: number | null,
    toDate?: number | null,
  ): Promise<PMInstance[]> {
    const conditions: any[] = [];

    if (siteCode && siteCode !== "all") {
      conditions.push(Q.where("site_code", siteCode));
    }

    if (statusFilter && statusFilter.length > 0) {
      conditions.push(Q.where("status", Q.oneOf(statusFilter)));
    }
    if (frequencyFilter) {
      conditions.push(Q.where("frequency", frequencyFilter));
    }
    if (assetTypeFilter) {
      conditions.push(Q.where("asset_type", assetTypeFilter));
    }
    if (fromDate && toDate) {
      conditions.push(Q.where("start_due_date", Q.between(fromDate, toDate)));
    } else if (fromDate) {
      conditions.push(Q.where("start_due_date", Q.gte(fromDate)));
    } else if (toDate) {
      conditions.push(Q.where("start_due_date", Q.lte(toDate)));
    }

    return pmInstanceCollection
      .query(Q.and(...conditions), Q.sortBy("start_due_date", Q.asc))
      .fetch();
  },

  /**
   * Get a single PM instance by server ID.
   */
  async getInstanceByServerId(serverId: string): Promise<PMInstance | null> {
    // Try by server_id first
    const results = await pmInstanceCollection
      .query(Q.where("server_id", serverId))
      .fetch();
    if (results.length > 0) return results[0];

    // Fallback: try by internal WatermelonDB id
    try {
      return await pmInstanceCollection.find(serverId);
    } catch {
      return null;
    }
  },

  /**
   * Get checklist items for a specific maintenance_id (checklist_id on server).
   */
  async getChecklistItems(checklistId: string): Promise<PMChecklistItem[]> {
    return pmChecklistItemCollection
      .query(
        Q.where("checklist_master_id", checklistId),
        Q.sortBy("sequence_no", Q.asc),
      )
      .fetch();
  },

  /**
   * Get all local responses for an instance.
   */
  async getResponsesForInstance(
    instanceServerId: string,
  ): Promise<PMResponse[]> {
    return pmResponseCollection
      .query(Q.where("instance_id", instanceServerId))
      .fetch();
  },

  /**
   * Pull PM instances from backend for a specific date and site.
   * Fetches all statuses for the given date to ensure complete local data.
   */
  async pullFromServer(siteCode: string, fromDate?: Date, toDate?: Date): Promise<void> {
    try {
      const siteParam = siteCode === "all" ? "all" : siteCode;
      
      let fromDateStr: string;
      let toDateStr: string;

      if (fromDate && toDate) {
        fromDateStr = format(fromDate, "yyyy-MM-dd");
        toDateStr = format(toDate, "yyyy-MM-dd");
      } else if (fromDate) {
        fromDateStr = format(fromDate, "yyyy-MM-dd");
        toDateStr = fromDateStr;
      } else {
        const today = new Date();
        toDateStr = format(today, "yyyy-MM-dd");

        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(today.getDate() - 90);
        fromDateStr = format(ninetyDaysAgo, "yyyy-MM-dd");
      }

      // Fetch instances for the specific date range
      const filters = JSON.stringify([
        { fieldId: "start_due_date", operator: "between", value: fromDateStr, valueEnd: toDateStr }
      ]);

      const response = await apiFetch(
        `/api/pm-instances/site/${siteParam}?limit=500&filters=${encodeURIComponent(filters)}`,
      );
      if (!response.ok) return;

      const json = await response.json();
      const instances: any[] = json.data || json || [];

      await database.write(async () => {
        const batch = [];
        for (const inst of instances) {
          const existing = await pmInstanceCollection
            .query(Q.where("server_id", inst.id))
            .fetch();

          // Normalize status
          let normalizedStatus = inst.status || "Pending";
          if (normalizedStatus === "In Progress" || normalizedStatus === "Inprogress") {
            normalizedStatus = "In-progress";
          }

          if (existing.length > 0) {
            const record = existing[0];
            // Only update if local is already synced to avoid overwriting local changes
            if (record.isSynced) {
              batch.push(
                record.prepareUpdate((r: any) => {
                  r.title = inst.title || "";
                  r.assetId = inst.asset_id || null;
                  r.status = normalizedStatus;
                  r.progress = String(inst.progress || "0");
                  r.frequency = inst.frequency || "";
                  r.assetType = inst.asset_type || "";
                  r.location = inst.location || "";
                  r.assignedToName = inst.assigned_to_name || null;
                  r.startDueDate = inst.start_due_date
                    ? new Date(inst.start_due_date).getTime()
                    : null;
                  r.maintenanceId =
                    inst.maintenance_id || inst.checklist_id || null;
                  r.clientSign = inst.client_sign || null;
                  r.beforeImage = inst.before_image || null;
                  r.afterImage = inst.after_image || null;
                  r.isSynced = true;
                }),
              );
            }
          } else {
            batch.push(
              pmInstanceCollection.prepareCreate((record: any) => {
                record.serverId = inst.id;
                record.siteCode = inst.site_code || siteCode;
                record.title = inst.title || "";
                record.assetId = inst.asset_id || null;
                record.status = normalizedStatus;
                record.progress = String(inst.progress || "0");
                record.frequency = inst.frequency || "";
                record.assetType = inst.asset_type || "";
                record.location = inst.location || "";
                record.assignedToName = inst.assigned_to_name || null;
                record.startDueDate = inst.start_due_date
                  ? new Date(inst.start_due_date).getTime()
                  : null;
                record.maintenanceId =
                  inst.maintenance_id || inst.checklist_id || null;
                record.clientSign = inst.client_sign || null;
                record.beforeImage = inst.before_image || null;
                record.afterImage = inst.after_image || null;
                record.isSynced = true;
              }),
            );
          }
        }
        await database.batch(batch);
      });

      logger.info(`Pulled ${instances.length} PM instances for ${siteCode} from ${fromDateStr} to ${toDateStr}`, {
        module: "PM_SERVICE",
      });
    } catch (error: any) {
      logger.error("Failed to pull PM instances", {
        module: "PM_SERVICE",
        error: error.message,
      });
    }
  },

  /**
   * Pull checklist items for a given maintenance_id from backend.
   */
  async pullChecklistItems(maintenanceId: string): Promise<void> {
    try {
      const response = await apiFetch(
        `/api/pm-checklist?checklist_id=${encodeURIComponent(maintenanceId)}&status=All`,
      );
      if (!response.ok) return;

      const json = await response.json();
      const items: any[] = json.data || json || [];

      await database.write(async () => {
        const existing = await pmChecklistItemCollection
          .query(Q.where("checklist_master_id", maintenanceId))
          .fetch();

        const existingMap = new Map(existing.map((e) => [e.serverId || "", e]));

        const batch = [];
        for (const item of items) {
          const ex = existingMap.get(item.id);
          if (ex) {
            batch.push(
              ex.prepareUpdate((record: any) => {
                record.taskName = item.task_name;
                record.fieldType = item.field_type;
                record.sequenceNo = item.sequence_no ?? null;
                record.imageMandatory = item.image_mandatory ?? false;
                record.remarksMandatory = item.remarks_mandatory ?? false;
                record.cachedAt = Date.now();
              }),
            );
          } else {
            batch.push(
              pmChecklistItemCollection.prepareCreate((record: any) => {
                record.serverId = item.id;
                record.checklistMasterId = maintenanceId;
                record.taskName = item.task_name;
                record.fieldType = item.field_type;
                record.sequenceNo = item.sequence_no ?? null;
                record.imageMandatory = item.image_mandatory ?? false;
                record.remarksMandatory = item.remarks_mandatory ?? false;
                record.cachedAt = Date.now();
              }),
            );
          }
        }
        await database.batch(batch);
      });
    } catch (error: any) {
      logger.error("Failed to pull PM checklist items", {
        module: "PM_SERVICE",
        error: error.message,
        maintenanceId,
      });
    }
  },

  /**
   * Save multiple PM responses locally in a single batch.
   */
  async saveResponsesBatch(
    instanceServerId: string,
    responses: PMResponseData[],
  ): Promise<void> {
    await database.write(async () => {
      const recordsToBatch = [];

      for (const data of responses) {
        const existing = await pmResponseCollection
          .query(
            Q.where("instance_id", instanceServerId),
            Q.where("checklist_item_id", data.checklist_item_id),
          )
          .fetch();

        if (existing.length > 0) {
          recordsToBatch.push(
            existing[0].prepareUpdate((record: any) => {
              record.responseValue = data.response_value;
              record.readings = data.readings;
              record.remarks = data.remarks;
              record.imageUrl = data.image_url;
              record.isSynced = false;
            }),
          );
        } else {
          recordsToBatch.push(
            pmResponseCollection.prepareCreate((record: any) => {
              record.serverId = null;
              record.instanceId = instanceServerId;
              record.checklistItemId = data.checklist_item_id;
              record.responseValue = data.response_value;
              record.readings = data.readings;
              record.remarks = data.remarks;
              record.imageUrl = data.image_url;
              record.isSynced = false;
            }),
          );
        }
      }

      // Prepare instance progress update
      const local = await this.getInstanceByServerId(instanceServerId);
      if (local) {
        const checklistItems = await this.getChecklistItems(
          local.maintenanceId!,
        );
        const answered = responses.filter((r) => r.response_value).length;
        // Note: we might need to count existing ones not in this batch,
        // but typically responses passed here are the full current state.
        // For reliability, let's fetch all responses after batch (but we are in a transaction).
        // Actually, we can just calculate it here if 'responses' is the full set.
        // In pm-execution, 'responses' IS the full set.
        const total = checklistItems.length;
        const progressStr = `${answered}/${total}`;

        recordsToBatch.push(
          local.prepareUpdate((r: any) => {
            r.progress = progressStr;
            r.isSynced = false;
          }),
        );
      }

      await database.batch(...recordsToBatch);
    });

    syncManager.triggerSync("manual").catch(() => {});
  },

  /**
   * Save a single PM response locally. (Legacy, still useful for single updates)
   */
  async saveResponseLocally(
    data: PMResponseData & { instanceServerId: string },
  ): Promise<PMResponse> {
    const result = await database.write(async () => {
      // Check if response already exists
      const existing = await pmResponseCollection
        .query(
          Q.where("instance_id", data.instanceServerId),
          Q.where("checklist_item_id", data.checklist_item_id),
        )
        .fetch();

      let resultRecord;
      if (existing.length > 0) {
        await existing[0].update((record: any) => {
          record.responseValue = data.response_value;
          record.readings = data.readings;
          record.remarks = data.remarks;
          record.imageUrl = data.image_url;
          record.isSynced = false;
        });
        resultRecord = existing[0];
      } else {
        resultRecord = await pmResponseCollection.create((record: any) => {
          record.serverId = null;
          record.instanceId = data.instanceServerId;
          record.checklistItemId = data.checklist_item_id;
          record.responseValue = data.response_value;
          record.readings = data.readings;
          record.remarks = data.remarks;
          record.imageUrl = data.image_url;
          record.isSynced = false;
        });
      }

      // Inline progress update into the same transaction to avoid nested write
      const local = await this.getInstanceByServerId(data.instanceServerId);
      if (local) {
        const checklistItems = await this.getChecklistItems(
          local.maintenanceId!,
        );
        const currentResponses = await this.getResponsesForInstance(
          data.instanceServerId,
        );
        const answered = currentResponses.filter((r) => r.responseValue).length;
        const total = checklistItems.length;
        await local.update((r: any) => {
          r.progress = `${answered}/${total}`;
          r.isSynced = false;
        });
      }

      return resultRecord;
    });

    syncManager.triggerSync("manual").catch(() => {});
    return result;
  },

  /**
   * Update local instance progress string 'X/Y'
   */
  async updateLocalInstanceProgress(instanceServerId: string): Promise<void> {
    const local = await this.getInstanceByServerId(instanceServerId);
    if (!local) return;

    const checklistItems = await this.getChecklistItems(local.maintenanceId!);
    const responses = await this.getResponsesForInstance(instanceServerId);

    const answered = responses.filter((r) => r.responseValue).length;
    const total = checklistItems.length;
    const progressStr = `${answered}/${total}`;

    // Ensure we only write if not already in a transaction (though safe call usually handles it)
    // Best practice: this method should only be called if NOT in a write block,
    // or we should allow passing the current record to update.
    await database.write(async () => {
      await local.update((r: any) => {
        r.progress = progressStr;
        r.isSynced = false;
      });
    });
  },

  /**
   * Mark PM instance as In Progress locally and attempt server sync.
   */
  async startInstance(instanceServerId: string): Promise<void> {
    // Update locally
    const local = await this.getInstanceByServerId(instanceServerId);
    if (local) {
      await database.write(async () => {
        await local.update((r: any) => {
          r.status = "In-progress";
          r.isSynced = false;
        });
      });
    }
    // Trigger sync
    syncManager.triggerSync("manual").catch(() => {});
  },

  /**
   * Complete a PM instance with signature and images.
   */
  async completeInstance(
    instanceServerId: string,
    clientSign: string,
    beforeImage?: string,
    afterImage?: string,
  ): Promise<void> {
    // Update locally
    const local = await this.getInstanceByServerId(instanceServerId);
    if (local) {
      const checklistItems = await this.getChecklistItems(local.maintenanceId!);
      const total = checklistItems.length;

      await database.write(async () => {
        await local.update((r: any) => {
          r.status = "Completed";
          r.progress = `${total}/${total}`;
          r.clientSign = clientSign;
          r.beforeImage = beforeImage || null;
          r.afterImage = afterImage || null;
          r.isSynced = false;
        });
      });
    }

    // Try syncing to backend
    try {
      const response = await apiFetch(
        `/api/pm-instances/${instanceServerId}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: "Completed",
            client_sign: clientSign,
            before_image: beforeImage,
            after_image: afterImage,
          }),
        },
      );
      if (response.ok && local) {
        await database.write(async () => {
          await local.update((r: any) => {
            r.isSynced = true;
          });
        });
      }
    } catch (err) {
      logger.error("Failed to sync PM completion immediately, will retry", {
        instanceId: instanceServerId,
        error: err,
      });
      // Already marked isSynced = false above, so it will be retried
    } finally {
      syncManager.triggerSync("manual").catch(() => {});
    }
  },

  /**
   * Push pending PM responses to backend.
   */
  async pushPendingResponses(): Promise<void> {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected || networkState.isInternetReachable === false) {
      return;
    }

    const pending = await pmResponseCollection
      .query(Q.where("is_synced", false))
      .fetch();

    for (const response of pending) {
      try {
        let resolvedImageUrl = response.imageUrl;

        if (isLikelyLocalUri(resolvedImageUrl)) {
          const uploadedUrl = await uploadPendingAssetIfNeeded(
            resolvedImageUrl,
            "pm-checklists",
            response.id,
          );

          if (!uploadedUrl) {
            logger.warn("Skipping PM response sync - image upload pending", {
              module: "PM_SERVICE",
              responseId: response.id,
            });
            continue;
          }

          resolvedImageUrl = uploadedUrl;
          await database.write(async () => {
            await response.update((r: any) => {
              r.imageUrl = uploadedUrl;
            });
          });
        }

        const res = await apiFetch("/api/pm-checklists/responses", {
          method: "POST",
          body: JSON.stringify({
            instance_id: response.instanceId,
            checklist_id: response.checklistItemId,
            response_value: response.responseValue,
            readings: response.readings,
            remarks: response.remarks,
            image_url: resolvedImageUrl,
          }),
        });
        if (res.ok) {
          const result = await res.json();
          await database.write(async () => {
            await response.update((r: any) => {
              r.serverId = result.data?.id || null;
              r.isSynced = true;
            });
          });
        }
      } catch {
        // Skip - will retry on next sync
      }
    }
  },

  /**
   * Push pending PM instance status updates to backend.
   */
  async pushPendingInstances(): Promise<void> {
    const networkState = await NetInfo.fetch();
    if (!networkState.isConnected || networkState.isInternetReachable === false) {
      return;
    }

    const pending = await pmInstanceCollection
      .query(Q.where("is_synced", false))
      .fetch();

    for (const instance of pending) {
      if (!instance.serverId) continue;
      try {
        let resolvedBeforeImage = instance.beforeImage;
        let resolvedAfterImage = instance.afterImage;

        if (isLikelyLocalUri(resolvedBeforeImage)) {
          const uploadedBefore = await uploadPendingAssetIfNeeded(
            resolvedBeforeImage,
            "pm-completion",
            `${instance.id}_before`,
          );
          if (!uploadedBefore) {
            logger.warn("Skipping PM instance sync - before image upload pending", {
              module: "PM_SERVICE",
              instanceId: instance.serverId,
            });
            continue;
          }
          resolvedBeforeImage = uploadedBefore;
        }

        if (isLikelyLocalUri(resolvedAfterImage)) {
          const uploadedAfter = await uploadPendingAssetIfNeeded(
            resolvedAfterImage,
            "pm-completion",
            `${instance.id}_after`,
          );
          if (!uploadedAfter) {
            logger.warn("Skipping PM instance sync - after image upload pending", {
              module: "PM_SERVICE",
              instanceId: instance.serverId,
            });
            continue;
          }
          resolvedAfterImage = uploadedAfter;
        }

        if (
          resolvedBeforeImage !== instance.beforeImage ||
          resolvedAfterImage !== instance.afterImage
        ) {
          await database.write(async () => {
            await instance.update((r: any) => {
              r.beforeImage = resolvedBeforeImage || null;
              r.afterImage = resolvedAfterImage || null;
            });
          });
        }

        const res = await apiFetch(
          `/api/pm-instances/${instance.serverId}/status`,
          {
            method: "PATCH",
            body: JSON.stringify({
              status: instance.status,
              client_sign: instance.clientSign,
              before_image: resolvedBeforeImage,
              after_image: resolvedAfterImage,
            }),
          },
        );

        if (res.ok) {
          await database.write(async () => {
            await instance.update((r: any) => {
              r.isSynced = true;
            });
          });
        }
      } catch (err) {
        logger.error("Failed to sync pending PM instance", {
          instanceId: instance.serverId,
          error: err,
        });
      }
    }
  },
};

export default PMService;
