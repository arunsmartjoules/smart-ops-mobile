/**
 * Upload an RCA report → the backend reads it and drafts the incident.
 *
 *   POST /api/incidents/rca-import              start (file already on S3)
 *   GET  /api/incidents/rca-import/:id          poll progress / result
 *   POST /api/incidents/rca-import/:id/create   create the incident
 *
 * Online-only on purpose: the read needs the server, so nothing here touches
 * the offline queue. Every failure comes back as plain-language copy — the
 * server's `error` text when it sent one (it is written for end users), else
 * a generic network / "something went wrong" line. Never an HTTP code.
 *
 * Shapes mirror backend/services/tickets/src/rcaImport/rcaImportService.ts.
 */
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";

export type RcaFaultType =
  | "Mechanical"
  | "Electrical"
  | "Controls"
  | "Safety"
  | "Plumbing"
  | "BMS"
  | "Others";
export type RcaSeverity = "Critical" | "Moderate" | "Low";
export type RcaOperatingCondition =
  | "Running"
  | "Stopped"
  | "Standby"
  | "Trip"
  | "Under Maintenance";

export interface RcaFields {
  site_code: string;
  asset_location: string | null;
  fault_symptom: string;
  fault_type: RcaFaultType;
  severity: RcaSeverity;
  operating_condition: RcaOperatingCondition;
  status: "Resolved" | "Inprogress";
  /** Local wall-clock "YYYY-MM-DDTHH:mm" as printed in the report. */
  incident_created_time: string | null;
  incident_updated_time: string | null;
  incident_resolved_time: string | null;
  immediate_action_taken: string;
  root_cause: string;
  corrective_action: string;
  preventive_action: string;
  remarks: string;
  vendor_tagged: string;
  /** Free text — who reported it, as named in the report (may be ""). */
  raised_by: string;
  /** The matched site user's user_id, or null — the person must choose. */
  assigned_to: string | null;
}

export interface RcaQuestionOption {
  value: string;
  label: string;
  hint?: string;
  recommended?: boolean;
}

export interface RcaQuestion {
  id: string;
  field: keyof RcaFields;
  kind: "choice" | "asset" | "user" | "datetime" | "text";
  title: string;
  help?: string;
  options?: RcaQuestionOption[];
  required: boolean;
  /** For datetime, a bare "YYYY-MM-DD" means "date known, pick the time". */
  default?: string;
  only_if?: { field: keyof RcaFields; equals: string };
}

export interface RcaAssetCandidate {
  value: string;
  label: string;
  hint: string;
  score: number;
  recommended?: boolean;
}

/** A site user suggested as the assignee (value = user_id). */
export type RcaPersonCandidate = RcaAssetCandidate;

export interface RcaImportResult {
  fields: RcaFields;
  questions: RcaQuestion[];
  asset_options: Record<string, RcaAssetCandidate[]>;
  asset_auto: Record<string, string | null>;
  /** Missing on results read before 2026-10 — treat as {}. */
  assignee_options?: Record<string, RcaPersonCandidate[]>;
  assignee_auto?: Record<string, string | null>;
  images: { url: string; width: number; height: number }[];
  document: {
    name: string | null;
    kind: "pdf" | "docx" | "pptx" | "image" | string;
    pages: number | null;
    url: string;
  };
  site_in_document: string;
  equipment_in_document: string;
  duplicate: { id: string; incident_id: string; site_code: string } | null;
  rca_status_on_create: "RCA Submitted" | "RCA Under Review";
}

export type RcaImportStatus = "processing" | "ready" | "rejected" | "failed" | "completed";
export type RcaImportStage =
  | "queued"
  | "validating"
  | "reading"
  | "extracting"
  | "matching"
  | "done";

export interface RcaImportView {
  id: string;
  status: RcaImportStatus;
  stage: RcaImportStage;
  error_message: string | null;
  site_code: string;
  file_name: string | null;
  result: RcaImportResult | null;
  incident: { id: string; incident_id: string } | null;
}

/** What the create call sends — the three times as ISO instants. */
export type RcaCreateFields = Omit<
  RcaFields,
  "incident_created_time" | "incident_updated_time" | "incident_resolved_time"
> & {
  incident_created_time: string;
  incident_updated_time: string | null;
  incident_resolved_time: string | null;
};

export const RCA_NETWORK_ERROR =
  "Couldn't reach the server. Check your internet connection and try again.";
export const RCA_GENERIC_ERROR = "Something went wrong. Please try again.";

export type RcaOutcome<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; network: boolean };

async function call<T>(path: string, init: RequestInit = {}): Promise<RcaOutcome<T>> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE_URL}${path}`, init);
  } catch {
    // fetch threw: no connection, DNS, timeout.
    return { ok: false, error: RCA_NETWORK_ERROR, network: true };
  }
  const body: any = await res.json().catch(() => null);
  if (res.ok && body && body.success !== false) {
    return { ok: true, data: body.data as T };
  }
  // A gateway in front of the API answers 502/503/504 without our JSON body.
  if (!body && res.status >= 500) {
    return { ok: false, error: RCA_NETWORK_ERROR, network: true };
  }
  if (res.status === 401) {
    return {
      ok: false,
      error: "Your session has expired. Please sign in again.",
      network: false,
    };
  }
  const serverText = typeof body?.error === "string" ? body.error.trim() : "";
  return { ok: false, error: serverText || RCA_GENERIC_ERROR, network: false };
}

export const RcaImportService = {
  start(input: { site_code: string; file_url: string; file_name: string }) {
    return call<RcaImportView>("/api/incidents/rca-import", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  get(id: string) {
    return call<RcaImportView>(`/api/incidents/rca-import/${encodeURIComponent(id)}`);
  },

  create(id: string, input: { fields: RcaCreateFields; image_urls: string[] }) {
    return call<any>(`/api/incidents/rca-import/${encodeURIComponent(id)}/create`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  /** The incident a duplicate warning points at (uuid). */
  getIncident(id: string) {
    return call<any>(`/api/incidents/${encodeURIComponent(id)}`);
  },
};

export default RcaImportService;
