/**
 * Client communication log — `/api/customer-communication-logs`
 * (backend: services/sitelogs/src/routes/customerCommunication.ts).
 *
 * Mirrors the web workspace (web/src/app/customer-communication/page.tsx):
 * the logger is low-volume, so the whole list is pulled once and scoped to a
 * site client-side by `site_name` (the table keys rows by site NAME, not
 * site_code). The server already narrows non-admin callers to their own
 * sites.
 *
 * Reads keep a last-good copy in AsyncStorage per user and serve it back
 * (flagged `isFromCache`) when the network fails. Writes (create / update /
 * delete, attachment uploads, the AI intake) are online-only — they return
 * `offline: true` when the request never reached the server so the screen
 * can say so instead of showing a generic error.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "../utils/logger";
import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";
import { StorageService } from "./StorageService";

/** A row of `customer_communication_logger`, as the API returns it. */
export interface CommRow {
  id: string;
  cc_id?: string | null;
  source_id?: number | null;
  site_name?: string | null;
  submitted_at?: string | null;
  email_address?: string | null;
  role_of_person?: string | null;
  /** Postgres DATE → `YYYY-MM-DD`. */
  communication_date?: string | null;
  /** Postgres TIME → `HH:MM:SS`. */
  communication_time?: string | null;
  input_from?: string | null;
  /** Comma-joined list of type keys. */
  communication_type?: string | null;
  detailed_description?: string | null;
  priority?: string | null;
  /** Comma-joined owner TEAMS (the person is `assignee`). */
  owner?: string | null;
  expected_action?: string | null;
  /** Postgres DATE → `YYYY-MM-DD`. */
  expected_closure_date?: string | null;
  /** One URL per line. */
  attachments?: string | null;
  resolution_summary?: string | null;
  /** 'action' | 'feedback'. */
  stream?: string | null;
  status?: string | null;
  assignee?: string | null;
  /** JSON-encoded `[{when, who, what}]`. */
  timeline?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

/** A person the entry can be assigned to (same source as the web picker). */
export interface CommPerson {
  name: string;
  role: string;
}

/**
 * Body accepted by POST / PUT — the column names of
 * `createCustomerCommunicationSchema` (backend shared/src/types/schemas.ts).
 */
export type CommWrite = Partial<Omit<CommRow, "id" | "created_at" | "updated_at">>;

export type Loaded<T> =
  | { success: true; data: T; isFromCache?: boolean }
  | { success: false; error: string };

export type WriteResult =
  | { success: true; data: CommRow }
  | { success: false; error: string; offline?: boolean };

const API = `${API_BASE_URL}/api/customer-communication-logs`;
const CACHE_PREFIX = "customer_comms:v1:";

async function readCache<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown) {
  AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(value)).catch(() => {});
}

async function loadList<T>(url: string, cacheKey: string): Promise<Loaded<T[]>> {
  try {
    const res = await centralApiFetch(url);
    const body = await res.json().catch(() => null);
    if (res.ok && body?.success && Array.isArray(body.data)) {
      writeCache(cacheKey, body.data);
      return { success: true, data: body.data as T[] };
    }
    // A 4xx is a real answer (no access, bad params) — don't hide it behind
    // a stale list.
    if (res.status < 500) {
      return { success: false, error: body?.error || `HTTP ${res.status}` };
    }
    logger.warn("Customer comms server error", { url, status: res.status });
  } catch (error) {
    logger.warn("Customer comms fetch failed", { url, error });
  }
  const cached = await readCache<T[]>(cacheKey);
  if (cached) return { success: true, data: cached, isFromCache: true };
  return { success: false, error: "Unable to load client communication" };
}

async function write(url: string, method: "POST" | "PUT", body: CommWrite): Promise<WriteResult> {
  let res: Response;
  try {
    res = await centralApiFetch(url, { method, body: JSON.stringify(body) });
  } catch (error) {
    logger.warn("Customer comms write failed", { url, method, error });
    return {
      success: false,
      offline: true,
      error: "Couldn't reach the server. Check your connection and try again.",
    };
  }
  const json = await res.json().catch(() => null);
  if (res.ok && json?.success && json.data) {
    return { success: true, data: json.data as CommRow };
  }
  return { success: false, error: json?.error || `Save failed (HTTP ${res.status})` };
}

/* ── AI intake ("Describe it") ─────────────────────────────────────────
 * Mirrors web/src/app/customer-communication/ai-intake.ts, which mirrors
 * backend/services/sitelogs/src/commIntake/commDraft.ts +
 * commIntakeService.ts — keep the three in step.
 */

export interface CommDraftFields {
  stream: "action" | "feedback";
  site_name: string;
  communication_date: string;
  communication_time: string;
  input_from: string;
  role_of_person: string;
  types: string[];
  description: string;
  priority: string;
  owner_teams: string[];
  assignee: string;
  expected_action: string;
  expected_closure_date: string;
}

export interface CommQuestionOption {
  value: string;
  label: string;
  hint?: string;
  recommended?: boolean;
}

export interface CommQuestion {
  id: string;
  field: keyof CommDraftFields;
  kind: "choice" | "text" | "date" | "person";
  title: string;
  help?: string;
  options?: CommQuestionOption[];
  required: boolean;
  only_if?: { field: keyof CommDraftFields; equals: string };
}

export interface CommDraftResult {
  fields: CommDraftFields;
  questions: CommQuestion[];
  /** `value` is the user's display name — what the logger stores as assignee. */
  assignee_options: CommQuestionOption[];
  mentioned: { site: string; assignee: string };
}

export interface CommDraftView {
  id: string;
  status: "processing" | "ready" | "rejected" | "failed";
  stage: "queued" | "reading" | "extracting" | "matching" | "done";
  error_message: string | null;
  site_name: string;
  result: CommDraftResult | null;
}

/** A voice note sent for speech-to-text (server commIntakeService `TranscriptView`). */
export interface CommTranscriptView {
  id: string;
  status: "processing" | "ready" | "rejected" | "failed";
  text: string | null;
  language: string | null;
  error_message: string | null;
  audio_url: string;
  file_name: string | null;
}

export type AiCallResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; network: boolean; status: number };

export const AI_MSG_NETWORK = "Couldn't reach the server. Check your internet connection and try again.";
export const AI_MSG_GENERIC = "Something went wrong. Please try again.";

/**
 * Server error bodies on these routes are end-user copy (commIntakeController
 * header). Anything that still looks like developer text — a status line,
 * HTML, a stack — is replaced by the generic line, same filter as the web
 * `apiErrorMessage`.
 */
const DEVELOPER_TEXT =
  /^HTTP \d|<[a-z!]|stack|TypeError|SyntaxError|ReferenceError|Unexpected token|Cannot read|undefined|ECONN|ETIMEDOUT|status code|Unsupported content type|Upload failed \(/i;

async function aiCall<T>(url: string, init?: RequestInit): Promise<AiCallResult<T>> {
  let res: Response;
  try {
    res = await centralApiFetch(url, init);
  } catch (error) {
    logger.warn("Customer comms AI call failed", { url, error });
    return { ok: false, error: AI_MSG_NETWORK, network: true, status: 0 };
  }
  const json = await res.json().catch(() => null);
  if (res.ok && json?.success && json.data) return { ok: true, data: json.data as T };
  const text = typeof json?.error === "string" ? json.error.trim() : "";
  // A gateway error with no JSON body is a connection problem, not a refusal.
  const network = !json && res.status >= 502 && res.status <= 504;
  const error = network ? AI_MSG_NETWORK : text && !DEVELOPER_TEXT.test(text) ? text : AI_MSG_GENERIC;
  return { ok: false, error, network: network || res.status >= 500 || res.status === 429, status: res.status };
}

/** A file picked on the device, ready to upload. */
export interface LocalFile {
  uri: string;
  name: string;
  /** Lower-case extension without the dot. */
  ext: string;
}

const CustomerCommunicationService = {
  /**
   * Every entry the caller may see, newest first. Same request the web makes
   * (`?limit=5000&sortBy=submitted_at&sortOrder=desc`); site scoping is done
   * by the screen so the next `CC-####` reference can be computed across all
   * of the caller's sites, as the web does.
   */
  list(userId: string) {
    const qs = new URLSearchParams({
      limit: "5000",
      sortBy: "submitted_at",
      sortOrder: "desc",
    });
    return loadList<CommRow>(`${API}?${qs.toString()}`, `${userId}:list`);
  },

  /** Assignee options — `/api/users?limit=1000`, de-duplicated by name. */
  async people(userId: string): Promise<CommPerson[]> {
    const res = await loadList<Record<string, unknown>>(
      `${API_BASE_URL}/api/users?limit=1000`,
      `${userId}:people`,
    );
    if (!res.success) return [];
    const seen = new Set<string>();
    const out: CommPerson[] = [];
    for (const u of res.data) {
      const name = String(u.name ?? "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push({ name, role: String(u.role ?? "").trim() });
    }
    return out;
  },

  create(body: CommWrite) {
    return write(API, "POST", body);
  },

  update(id: string, patch: CommWrite) {
    return write(`${API}/${encodeURIComponent(id)}`, "PUT", patch);
  },

  /**
   * DELETE /:id. The server checks site membership (non-admins may only
   * delete their sites' entries); the role's `delete` grant is a UI gate, as
   * on the web.
   */
  async remove(id: string): Promise<{ success: true } | { success: false; error: string; offline?: boolean }> {
    let res: Response;
    try {
      res = await centralApiFetch(`${API}/${encodeURIComponent(id)}`, { method: "DELETE" });
    } catch (error) {
      logger.warn("Customer comms delete failed", { id, error });
      return {
        success: false,
        offline: true,
        error: "Couldn't reach the server. Check your connection and try again.",
      };
    }
    const json = await res.json().catch(() => null);
    if (res.ok && json?.success) return { success: true };
    return { success: false, error: json?.error || `Delete failed (HTTP ${res.status})` };
  },

  /**
   * Upload one local file through the presigned-PUT flow and return its
   * public URL. Key shape follows the web `uploadFileToS3`:
   * `<prefix>/<slugged-name>-<ms>.<ext>` (the key's extension sets the
   * content type the PUT is signed with).
   */
  async uploadFile(file: LocalFile, prefix: string): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
    const stem = file.name.replace(/\.[^.]+$/, "");
    const base =
      stem
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "file";
    const ext = /^[a-z0-9]{1,5}$/.test(file.ext) ? file.ext : "bin";
    const key = `${prefix}/${base}-${Date.now()}.${ext}`;
    try {
      const up = await StorageService.uploadFileDetailed(key, file.uri);
      if (up.url) return { ok: true, url: up.url };
      if (up.error === "Local file unreadable") {
        return { ok: false, error: `We couldn't open "${file.name}". Please choose it again.` };
      }
      return {
        ok: false,
        error: up.permanent
          ? `"${file.name}" couldn't be uploaded. Please try a different file.`
          : `"${file.name}" didn't upload — check your connection and try again.`,
      };
    } catch (error) {
      logger.warn("Customer comms upload failed", { key, error });
      return { ok: false, error: `"${file.name}" didn't upload — check your connection and try again.` };
    }
  },

  /** POST /ai/drafts — start drafting an entry from notes + uploaded documents (202). */
  startDraft(body: { site_name: string; notes: string; documents: { url: string; name: string }[] }) {
    return aiCall<CommDraftView>(`${API}/ai/drafts`, { method: "POST", body: JSON.stringify(body) });
  },

  /** POST /ai/transcripts — start transcribing an uploaded voice note (202). */
  startTranscript(body: { audio_url: string; file_name: string }) {
    return aiCall<CommTranscriptView>(`${API}/ai/transcripts`, { method: "POST", body: JSON.stringify(body) });
  },

  /** GET /ai/transcripts/:id — poll until `status` leaves "processing"; carries the text. */
  getTranscript(id: string) {
    return aiCall<CommTranscriptView>(`${API}/ai/transcripts/${encodeURIComponent(id)}`);
  },

  /** GET /ai/drafts/:id — poll until `status` leaves "processing". */
  getDraft(id: string) {
    return aiCall<CommDraftView>(`${API}/ai/drafts/${encodeURIComponent(id)}`);
  },
};

export default CustomerCommunicationService;
