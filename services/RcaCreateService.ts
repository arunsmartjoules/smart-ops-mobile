/**
 * "Create RCA" — write an RCA in the app, modelled on one already in JouleOps.
 *
 *   POST /api/incidents/rca-create/start                  standard sections + incident-details questions
 *   POST /api/incidents/rca-create/polish                 spelling / grammar fix for one answer
 *   POST /api/incidents/rca-create/voice                  start typing up an uploaded recording
 *   GET  /api/incidents/rca-create/voice/:id              poll that job for the text
 *   POST /api/incidents/rca-create                        build the PDF + create the incident
 *
 * Online-only on purpose (the server fixes the text, types up recordings and
 * builds the PDF), so nothing here touches the offline queue. Like the RCA
 * upload, every failure comes back as plain-language copy: the server's own
 * `error` text when it sent one (it is written for end users), else a generic
 * network / "something went wrong" line. Never an HTTP code.
 *
 * Shapes mirror backend/services/tickets/src/rcaCreate/.
 */
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import {
  RCA_GENERIC_ERROR,
  RCA_NETWORK_ERROR,
  type RcaCreateFields,
  type RcaImportResult,
  type RcaOutcome,
} from "@/services/RcaImportService";

export type RcaSectionKind = "text" | "text_photos" | "photos";
export type RcaSectionTarget =
  | "immediate_action_taken"
  | "root_cause"
  | "corrective_action"
  | "preventive_action"
  | "remarks";

export interface RcaSection {
  /** "s1", "s2", … — matches an answer back to its section. */
  id: string;
  title: string;
  /** The question shown to the engineer. */
  prompt: string;
  help: string;
  kind: RcaSectionKind;
  maps_to: RcaSectionTarget | null;
  required: boolean;
}

export interface RcaCreateStart {
  sections: RcaSection[];
  result: RcaImportResult;
}

export type RcaVoiceView =
  | { status: "processing" }
  | { status: "ready"; text: string }
  | { status: "failed"; message: string };

export interface RcaSectionPayload extends RcaSection {
  text: string;
  photos: { url: string; caption: string }[];
}

/** Building the PDF reads every photo back from storage first. */
export const RCA_CREATE_TIMEOUT_MS = 90_000;

async function call<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs?: number,
): Promise<RcaOutcome<T>> {
  let res: Response;
  try {
    res = await apiFetch(`${API_BASE_URL}${path}`, init, timeoutMs);
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

export const RcaCreateService = {
  /** The standard sections and the incident-details questions for a site. */
  start(input: { site_code: string }) {
    return call<RcaCreateStart>("/api/incidents/rca-create/start", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  polish(text: string) {
    return call<{ text: string; changed: boolean }>("/api/incidents/rca-create/polish", {
      method: "POST",
      body: JSON.stringify({ text }),
    });
  },

  /** Dictation: the recording is already on S3 (presigned PUT); this starts the job. */
  voiceStart(audioUrl: string) {
    return call<{ id: string }>("/api/incidents/rca-create/voice", {
      method: "POST",
      body: JSON.stringify({ audio_url: audioUrl }),
    });
  },

  voiceGet(id: string) {
    return call<RcaVoiceView>(`/api/incidents/rca-create/voice/${encodeURIComponent(id)}`);
  },

  /**
   * `client_request_id` is generated once per wizard session and reused on
   * every retry: the server answers a repeat with the incident it already
   * made (200) instead of creating a second one.
   */
  create(input: {
    client_request_id: string;
    fields: Partial<RcaCreateFields>;
    sections: RcaSectionPayload[];
  }) {
    return call<any>(
      "/api/incidents/rca-create",
      { method: "POST", body: JSON.stringify(input) },
      RCA_CREATE_TIMEOUT_MS,
    );
  },
};

export default RcaCreateService;
