import NetInfo from "@react-native-community/netinfo";
import { db, incidents as incidentsTable } from "@/database";
import { and, desc, eq, gte, lte } from "drizzle-orm";
import cacheManager from "./CacheManager";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

/** GET-style: returns parsed JSON (legacy shape). */
const apiFetchJson = async (endpoint: string, options: RequestInit = {}) => {
  try {
    const response = await centralApiFetch(`${API_BASE_URL}${endpoint}`, options);
    const data = await response.json().catch(() => ({}));
    return data;
  } catch {
    return { success: false, isNetworkError: true, error: "Network unavailable" };
  }
};

/**
 * Mutations: use HTTP status + body so we do not enqueue after a successful API call.
 * Queue only when offline or likely-transient failure (5xx / network).
 */
async function incidentMutation(
  path: string,
  init: RequestInit,
): Promise<{ ok: boolean; status: number; data: any; enqueueable: boolean }> {
  try {
    const response = await centralApiFetch(`${API_BASE_URL}${path}`, init);
    const data = await response.json().catch(() => ({}));
    const enqueueable =
      !response.ok && (response.status >= 500 || response.status === 0);
    return { ok: response.ok, status: response.status, data, enqueueable };
  } catch {
    return { ok: false, status: 0, data: {}, enqueueable: true };
  }
}

function normalizeMutationSuccess(data: any, ok: boolean): boolean {
  if (!ok) return false;
  if (data?.success === false) return false;
  return true;
}

export const IncidentsService = {
  async getSiteUsers(siteCode: string) {
    return apiFetchJson(`/api/site-users/site/${encodeURIComponent(siteCode)}`);
  },

  async getIncidents(siteCode: string, options: any = {}) {
    const { status, rca_status, page = 1, limit = 50, search, fromDate, toDate } = options;
    const net = await NetInfo.fetch();

    if (!net.isConnected) {
      const whereParts: any[] = [eq(incidentsTable.site_code, siteCode)];
      if (status && status !== "All") whereParts.push(eq(incidentsTable.status, status));
      if (fromDate) {
        const from = Date.parse(fromDate);
        if (!Number.isNaN(from)) whereParts.push(gte(incidentsTable.incident_created_time, from));
      }
      if (toDate) {
        const to = Date.parse(toDate);
        if (!Number.isNaN(to)) whereParts.push(lte(incidentsTable.incident_created_time, to));
      }
      const rows = await db
        .select()
        .from(incidentsTable)
        .where(whereParts.length > 1 ? and(...whereParts) : whereParts[0])
        .orderBy(desc(incidentsTable.incident_created_time));

      const filtered = rows.filter((r) => {
        if (rca_status && rca_status !== "All" && r.rca_status !== rca_status) return false;
        if (!search?.trim()) return true;
        const hay = `${r.incident_id} ${r.fault_symptom} ${r.asset_location || ""}`.toLowerCase();
        return hay.includes(search.trim().toLowerCase());
      });
      return { success: true, data: filtered.slice((page - 1) * limit, page * limit), isFromCache: true };
    }

    const params = new URLSearchParams();
    params.append("site_code", siteCode);
    params.append("page", String(page));
    params.append("limit", String(limit));
    if (status) params.append("status", status);
    if (rca_status) params.append("rca_status", rca_status);
    if (search) params.append("search", search);
    if (fromDate) params.append("fromDate", fromDate);
    if (toDate) params.append("toDate", toDate);
    const result = await apiFetchJson(`/api/incidents?${params.toString()}`);
    if (result?.success && Array.isArray(result.data)) {
      const records = result.data.map((i: any) => ({
        id: i.id,
        incident_id: i.incident_id,
        source: i.source || "Incident",
        ticket_id: i.ticket_id || null,
        site_code: i.site_code || siteCode,
        asset_location: i.asset_location || null,
        raised_by: i.raised_by || null,
        incident_created_time: i.incident_created_time ? new Date(i.incident_created_time).getTime() : Date.now(),
        incident_updated_time: i.incident_updated_time ? new Date(i.incident_updated_time).getTime() : null,
        incident_resolved_time: i.incident_resolved_time ? new Date(i.incident_resolved_time).getTime() : null,
        fault_symptom: i.fault_symptom || "",
        fault_type: i.fault_type || "Others",
        severity: i.severity || "Moderate",
        operating_condition: i.operating_condition || null,
        immediate_action_taken: i.immediate_action_taken || null,
        attachments: JSON.stringify(i.attachments || []),
        rca_attachments: JSON.stringify(i.rca_attachments || []),
        remarks: i.remarks || null,
        status: i.status || "Open",
        rca_status: i.rca_status || "Open",
        assigned_by: i.assigned_by || null,
        assignment_type: i.assignment_type || null,
        vendor_tagged: i.vendor_tagged || null,
        rca_maker: i.rca_maker || null,
        rca_checker: i.rca_checker || null,
        assigned_to: JSON.stringify(i.assigned_to || []),
        created_at: i.created_at ? new Date(i.created_at).getTime() : Date.now(),
        updated_at: i.updated_at ? new Date(i.updated_at).getTime() : Date.now(),
      }));
      await cacheManager.write("incidents", records);
    }
    return result;
  },

  async getStats(siteCode: string) {
    return apiFetchJson(`/api/incidents/stats?site_code=${encodeURIComponent(siteCode)}`);
  },

  async createIncident(payload: any) {
    try {
      const netState = await NetInfo.fetch();

      if (netState.isConnected) {
        const { ok, data, enqueueable } = await incidentMutation("/api/incidents", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (normalizeMutationSuccess(data, ok)) {
          return data?.success === true ? data : { ...data, success: true };
        }

        if (enqueueable) {
          await cacheManager.enqueue({
            entity_type: "incident_create",
            operation: "create",
            payload,
          });
          return {
            success: false,
            queued: true,
            error: "Offline: Incident queued for sync.",
          };
        }

        return data?.success === false
          ? data
          : { success: false, error: data?.error || "Failed to create incident" };
      }

      await cacheManager.enqueue({
        entity_type: "incident_create",
        operation: "create",
        payload,
      });
      return {
        success: false,
        queued: true,
        error: "Offline: Incident queued for sync.",
      };
    } catch {
      await cacheManager.enqueue({
        entity_type: "incident_create",
        operation: "create",
        payload,
      });
      return {
        success: false,
        queued: true,
        error: "Offline: Incident queued for sync.",
      };
    }
  },

  async updateIncident(id: string, payload: any) {
    const body = JSON.stringify(payload);
    const queuePayload = { id, ...payload };

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await cacheManager.enqueue({
          entity_type: "incident_update",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Offline: Incident update queued for sync." };
      }

      const { ok, data, enqueueable } = await incidentMutation(`/api/incidents/${id}`, {
        method: "PUT",
        body,
      });

      if (normalizeMutationSuccess(data, ok)) {
        return data?.success === true ? data : { ...data, success: true };
      }

      if (enqueueable) {
        await cacheManager.enqueue({
          entity_type: "incident_update",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Network error: Incident update queued." };
      }
      return data?.success === false
        ? data
        : { success: false, error: data?.error || "Failed to update incident" };
    } catch {
      await cacheManager.enqueue({
        entity_type: "incident_update",
        operation: "update",
        payload: queuePayload,
      });
      return { success: false, queued: true, error: "Offline: Incident update queued for sync." };
    }
  },

  async updateStatus(id: string, payload: {
    status: string;
    remarks?: string;
    incident_updated_time?: string;
    incident_resolved_time?: string;
    assigned_to?: string | string[];
  }) {
    const queuePayload = { id, ...payload };
    const body = JSON.stringify(payload);

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await cacheManager.enqueue({
          entity_type: "incident_status_update",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Offline: Status update queued for sync." };
      }

      const { ok, data, enqueueable } = await incidentMutation(`/api/incidents/${id}/status`, {
        method: "PATCH",
        body,
      });

      if (normalizeMutationSuccess(data, ok)) {
        return data?.success === true ? data : { ...data, success: true };
      }

      if (enqueueable) {
        await cacheManager.enqueue({
          entity_type: "incident_status_update",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Network error: Status update queued." };
      }
      return data?.success === false
        ? data
        : { success: false, error: data?.error || "Failed to update status" };
    } catch {
      await cacheManager.enqueue({
        entity_type: "incident_status_update",
        operation: "update",
        payload: queuePayload,
      });
      return { success: false, queued: true, error: "Offline: Status update queued for sync." };
    }
  },

  async updateRcaStatus(id: string, payload: {
    rca_status: string;
    rca_checker?: string;
    rca_attachments?: string[];
  }) {
    const queuePayload = { id, ...payload };
    const body = JSON.stringify(payload);

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await cacheManager.enqueue({
          entity_type: "incident_rca_status_update",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Offline: RCA update queued for sync." };
      }

      const { ok, data, enqueueable } = await incidentMutation(`/api/incidents/${id}/rca-status`, {
        method: "PATCH",
        body,
      });

      if (normalizeMutationSuccess(data, ok)) {
        return data?.success === true ? data : { ...data, success: true };
      }

      if (enqueueable) {
        await cacheManager.enqueue({
          entity_type: "incident_rca_status_update",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Network error: RCA update queued." };
      }
      return data?.success === false
        ? data
        : { success: false, error: data?.error || "Failed to update RCA status" };
    } catch {
      await cacheManager.enqueue({
        entity_type: "incident_rca_status_update",
        operation: "update",
        payload: queuePayload,
      });
      return { success: false, queued: true, error: "Offline: RCA update queued for sync." };
    }
  },

  async addAttachment(id: string, attachment: any) {
    const queuePayload = { id, attachment };
    const body = JSON.stringify({ attachment });

    try {
      const netState = await NetInfo.fetch();
      if (!netState.isConnected) {
        await cacheManager.enqueue({
          entity_type: "incident_attachment_add",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Offline: Attachment queued for sync." };
      }

      const { ok, data, enqueueable } = await incidentMutation(`/api/incidents/${id}/attachments`, {
        method: "POST",
        body,
      });

      if (normalizeMutationSuccess(data, ok)) {
        return data?.success === true ? data : { ...data, success: true };
      }

      if (enqueueable) {
        await cacheManager.enqueue({
          entity_type: "incident_attachment_add",
          operation: "update",
          payload: queuePayload,
        });
        return { success: false, queued: true, error: "Network error: Attachment queued." };
      }
      return data?.success === false
        ? data
        : { success: false, error: data?.error || "Failed to add attachment" };
    } catch {
      await cacheManager.enqueue({
        entity_type: "incident_attachment_add",
        operation: "update",
        payload: queuePayload,
      });
      return { success: false, queued: true, error: "Offline: Attachment queued for sync." };
    }
  },
};

export default IncidentsService;
