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

export function formatAssignee(
  assignedTo?: string | null,
  executorId?: string | null,
  fallback = "—",
): string {
  return clean(assignedTo) || clean(executorId) || fallback;
}
