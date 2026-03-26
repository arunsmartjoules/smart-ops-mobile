import { eq, and, inArray, between, gte, lte, asc } from "drizzle-orm";
import { db, pmInstances, pmChecklistMaster, pmChecklistItems, pmResponses } from "@/database";
import { v4 as uuidv4 } from "uuid";
import { supabase } from "./supabase";
import { fetchWithTimeout } from "../utils/apiHelper";
import { StorageService } from "./StorageService";
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
   * Fetch PM instances from API (fallback when PowerSync hasn't synced yet)
   */
  async fetchFromAPI(
    siteCode: string,
    fromDate?: Date,
    toDate?: Date,
  ): Promise<any[]> {
    try {
      let endpoint = `/api/pm-instances/site/${siteCode}`;
      const params = new URLSearchParams();
      
      if (fromDate) {
        params.append('from_date', fromDate.toISOString());
      }
      if (toDate) {
        params.append('to_date', toDate.toISOString());
      }
      
      if (params.toString()) {
        endpoint += `?${params.toString()}`;
      }

      const response = await apiFetch(endpoint);
      const data = await response.json();
      
      if (data.success && data.data) {
        logger.info("Fetched PM instances from API", {
          module: "PM_SERVICE",
          count: data.data.length,
          siteCode,
        });
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
      conditions.push(eq(pmInstances.site_code, siteCode));
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
    if (fromDate && toDate) {
      conditions.push(between(pmInstances.start_due_date, fromDate, toDate));
    } else if (fromDate) {
      conditions.push(gte(pmInstances.start_due_date, fromDate));
    } else if (toDate) {
      conditions.push(lte(pmInstances.start_due_date, toDate));
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
   * Fetch checklist items from API (fallback when PowerSync hasn't synced yet)
   */
  async fetchChecklistItemsFromAPI(checklistId: string): Promise<any[]> {
    try {
      const response = await apiFetch(`/api/pm-checklists/${checklistId}`);
      const data = await response.json();
      
      if (data.success && data.data) {
        const items = Array.isArray(data.data) ? data.data : [data.data];
        logger.info("Fetched checklist items from API", {
          module: "PM_SERVICE",
          count: items.length,
          checklistId,
        });
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
   * Mark PM instance as In Progress locally.
   * PowerSync handles syncing the change to the backend automatically.
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
    }
  },

  /**
   * Complete a PM instance with signature and images.
   * PowerSync handles syncing the change to the backend automatically.
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

      await db
        .update(pmInstances)
        .set({
          status: "Completed",
          progress: `${total}/${total}`,
          client_sign: clientSign,
          before_image: beforeImage || null,
          after_image: afterImage || null,
          updated_at: Date.now(),
        })
        .where(eq(pmInstances.id, instanceServerId));
    }
  },
};

export default PMService;
