/**
 * Which site log categories the signed-in role may view, for code that runs
 * outside React (SyncEngine and the domain services). PermissionsContext
 * publishes it whenever its answer changes.
 *
 * `null` means "not known" (admins, no answer yet, a headless background
 * launch before the app was opened): everything is pulled, and the server
 * still filters what comes back, so this only saves requests — it is never the
 * thing that protects data.
 */
export type SiteLogCategoryKey =
  | "site_logs_temp_rh"
  | "site_logs_water"
  | "site_logs_chiller"
  | "site_logs_chemical";

/** Mobile's log names (service keys and tab keys) → their category. */
const CATEGORY_BY_LOG_NAME: Record<string, SiteLogCategoryKey> = {
  "Temp RH": "site_logs_temp_rh",
  Water: "site_logs_water",
  "Chemical Dosing": "site_logs_chemical",
  "Chiller Logs": "site_logs_chiller",
  "Chiller Readings": "site_logs_chiller",
  Chiller: "site_logs_chiller",
};

let viewable: ReadonlySet<SiteLogCategoryKey> | null = null;

export function setViewableSiteLogCategories(next: ReadonlySet<SiteLogCategoryKey> | null): void {
  viewable = next;
}

/** False only when the role is known not to view this log type's category. */
export function canPullSiteLogCategory(logName: string): boolean {
  if (!viewable) return true;
  const category = CATEGORY_BY_LOG_NAME[logName];
  // A name outside the table is admin-only on the server; nothing to save by
  // skipping it here, so leave the server to answer.
  return category ? viewable.has(category) : true;
}

// --- Refused because the category was revoked ---------------------------------

/** What the operator sees when an entry is refused for its log type. */
export const NO_LOG_TYPE_ACCESS_MESSAGE =
  "You no longer have access to this log type, so this entry can't be uploaded. " +
  "Ask your administrator if you still need to submit it.";

/** True when the server refused the write for a permission it no longer grants. */
export function isModuleForbidden(status: number, body: unknown): boolean {
  return (
    status === 403 &&
    (body as { code?: unknown } | null)?.code === "MODULE_FORBIDDEN"
  );
}

/**
 * The error a queue replay throws for a failed response: `statusCode` for the
 * retry classification, plus the server's `code` on a 403, so the flush can
 * tell a revoked category from any other refusal.
 */
export async function replayError(
  response: Response,
  message: string,
): Promise<Error & { statusCode: number; code?: string }> {
  const err = new Error(message) as Error & { statusCode: number; code?: string };
  err.statusCode = response.status;
  if (response.status === 403) {
    const body = await response.json().catch(() => null);
    if (typeof body?.code === "string") err.code = body.code;
  }
  return err;
}
