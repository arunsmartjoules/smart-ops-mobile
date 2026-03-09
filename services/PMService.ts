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
import { authService } from "./AuthService";
import { fetchWithTimeout } from "../utils/apiHelper";
import { syncManager } from "./SyncManager";
import logger from "../utils/logger";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Shared API fetch helper with auth
const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
  const token = await authService.getValidToken();
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
  remarks: string | null;
  image_url: string | null;
}

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
  ): Promise<PMInstance[]> {
    const conditions: any[] = [Q.where("site_code", siteCode)];

    if (statusFilter && statusFilter.length > 0) {
      conditions.push(Q.where("status", Q.oneOf(statusFilter)));
    }
    if (frequencyFilter) {
      conditions.push(Q.where("frequency", frequencyFilter));
    }
    if (assetTypeFilter) {
      conditions.push(Q.where("asset_type", assetTypeFilter));
    }

    return pmInstanceCollection
      .query(Q.and(...conditions), Q.sortBy("start_due_date", Q.asc))
      .fetch();
  },

  /**
   * Get a single PM instance by server ID.
   */
  async getInstanceByServerId(serverId: string): Promise<PMInstance | null> {
    const results = await pmInstanceCollection
      .query(Q.where("server_id", serverId))
      .fetch();
    return results[0] || null;
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
   * Pull PM instances & checklists from backend and cache locally.
   */
  async pullFromServer(siteCode: string): Promise<void> {
    try {
      const response = await apiFetch(
        `/api/pm-instances/site/${siteCode}?limit=200`,
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

          if (existing.length > 0) {
            batch.push(
              existing[0].prepareUpdate((record: any) => {
                record.title = inst.title || "";
                record.assetId = inst.asset_id || null;
                record.status = inst.status || "Pending";
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
          } else {
            batch.push(
              pmInstanceCollection.prepareCreate((record: any) => {
                record.serverId = inst.id;
                record.siteCode = siteCode;
                record.title = inst.title || "";
                record.assetId = inst.asset_id || null;
                record.status = inst.status || "Pending";
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

      logger.info(`Pulled ${instances.length} PM instances for ${siteCode}`, {
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
   * Save a single PM response locally.
   */
  async saveResponseLocally(
    data: PMResponseData & { instanceServerId: string },
  ): Promise<PMResponse> {
    return database.write(async () => {
      // Check if response already exists
      const existing = await pmResponseCollection
        .query(
          Q.where("instance_id", data.instanceServerId),
          Q.where("checklist_item_id", data.checklist_item_id),
        )
        .fetch();

      if (existing.length > 0) {
        await existing[0].update((record: any) => {
          record.responseValue = data.response_value;
          record.remarks = data.remarks;
          record.imageUrl = data.image_url;
          record.isSynced = false;
        });
        return existing[0];
      } else {
        return pmResponseCollection.create((record: any) => {
          record.serverId = null;
          record.instanceId = data.instanceServerId;
          record.checklistItemId = data.checklist_item_id;
          record.responseValue = data.response_value;
          record.remarks = data.remarks;
          record.imageUrl = data.image_url;
          record.isSynced = false;
        });
      }
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
      await database.write(async () => {
        await local.update((r: any) => {
          r.status = "Completed";
          r.progress = 100;
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
    } catch {
      // Offline - sync later
    }
  },

  /**
   * Push pending PM responses to backend.
   */
  async pushPendingResponses(): Promise<void> {
    const pending = await pmResponseCollection
      .query(Q.where("is_synced", false))
      .fetch();

    for (const response of pending) {
      try {
        const res = await apiFetch("/api/pm-checklists/responses", {
          method: "POST",
          body: JSON.stringify({
            instance_id: response.instanceId,
            checklist_id: response.checklistItemId,
            response_value: response.responseValue,
            remarks: response.remarks,
            image_url: response.imageUrl,
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
};

export default PMService;
