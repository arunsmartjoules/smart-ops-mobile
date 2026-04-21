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
  severity: IncidentSeverityOption;
  operating_condition: string;
  immediate_action_taken: string;
  incidentAttachments: string[];
  incidentRemarks: string;
};

export const DEFAULT_TICKET_INCIDENT_DRAFT: TicketIncidentDraft = {
  fault_type: "Others",
  severity: "Moderate",
  operating_condition: "Stopped",
  immediate_action_taken: "",
  incidentAttachments: [],
  incidentRemarks: "",
};
