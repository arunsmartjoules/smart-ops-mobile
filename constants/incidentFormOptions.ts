/** Shared with Incidents tab and ticket → incident sub-form (must match DB / Zod enums). */

export const FAULT_TYPE_OPTIONS = [
  "Mechanical",
  "Electrical",
  "Controls",
  "Safety",
  "Plumbing",
  "BMS",
  "Others",
] as const;

export type IncidentSeverityOption = "Critical" | "Moderate" | "Low";

export const SEVERITY_OPTIONS: IncidentSeverityOption[] = ["Critical", "Moderate", "Low"];

export const OPERATING_CONDITION_OPTIONS = [
  "Running",
  "Stopped",
  "Standby",
  "Trip",
  "Under Maintenance",
] as const;

export type TicketIncidentDraft = {
  fault_type: string;
  severity: IncidentSeverityOption | "";
  operating_condition: string;
  immediate_action_taken: string;
  incidentAttachments: string[];
  incidentRemarks: string;
  /**
   * Stable idempotency key for the incident this draft will create. Generated
   * once per draft (see makeTicketIncidentDraft) and reused on every submit /
   * offline-queue replay so the backend's client_request_id dedupe collapses
   * retries into a single incident instead of one per tap. Must NOT be a
   * shared constant — each draft needs its own id.
   */
  client_request_id: string;
};

export const DEFAULT_TICKET_INCIDENT_DRAFT: TicketIncidentDraft = {
  fault_type: "",
  severity: "",
  operating_condition: "",
  immediate_action_taken: "",
  incidentAttachments: [],
  incidentRemarks: "",
  client_request_id: "",
};

/**
 * Builds a fresh draft with a unique client_request_id. Use this anywhere a
 * new incident draft starts (initial state, reset) so retries of the same
 * logical incident share one idempotency key.
 */
export const makeTicketIncidentDraft = (
  newId: () => string,
): TicketIncidentDraft => ({
  ...DEFAULT_TICKET_INCIDENT_DRAFT,
  client_request_id: newId(),
});
