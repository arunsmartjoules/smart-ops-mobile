/**
 * Human-readable operator label for a log record.
 *
 * `assigned_to` is the canonical display NAME. `executor_id` is a code and
 * pull-sync injects the literal "system" when the server row has none — these
 * sentinels are not real names and must not be shown to the operator.
 */
const SENTINELS = new Set(["", "system", "unknown", "null", "undefined"]);

const clean = (v?: string | null): string => {
  const s = String(v ?? "").trim();
  return SENTINELS.has(s.toLowerCase()) ? "" : s;
};

/**
 * Email local-part — everything before "@" (the "prefix"), trimmed. No
 * truncation: `getPrefix` returns the full local-part.
 *   "gopaldasbairagi66@gmail.com" -> "gopaldasbairagi66"
 */
export function emailLocalPart(email?: string | null): string {
  const s = String(email ?? "").trim();
  if (!s) return "";
  const local = s.includes("@") ? s.slice(0, s.indexOf("@")) : s;
  return clean(local);
}

/**
 * Canonical operator label written to `executor_id` / `assigned_to`.
 *
 * Fallback chain (never a UUID): employee NAME -> employee_code -> email
 * local-part -> "unknown". A user's `user_id`/`id` UUID is deliberately NOT
 * in this chain — a UUID is not a human-readable identifier and must never
 * land in these columns.
 */
export function operatorLabel(
  user?: {
    full_name?: string | null;
    name?: string | null;
    employee_code?: string | null;
    email?: string | null;
  } | null,
): string {
  return (
    clean(user?.full_name) ||
    clean(user?.name) ||
    clean(user?.employee_code) ||
    emailLocalPart(user?.email) ||
    "unknown"
  );
}

export function formatAssignee(
  assignedTo?: string | null,
  executorId?: string | null,
  fallback = "—",
): string {
  return clean(assignedTo) || clean(executorId) || fallback;
}
