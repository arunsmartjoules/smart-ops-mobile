/**
 * Ticket SLA verdict — the mobile side of the web tickets grid's SLA column.
 *
 * The backend computes it per row (`slaVerdictSql` in the sla module) and the
 * site ticket list returns two fields:
 *   sla        — "Met" | "Breached" | null. Null means no SLA target applies
 *                (untracked category, or Cancelled / Waiting / Hold).
 *   sla_due_at — the next deadline, sent only while a clock is still running.
 *
 * Tickets are served from the local cache between pulls, so a "Met" verdict can
 * go stale. Once `sla_due_at` has passed on a still-open ticket the backend
 * would now say "Breached", so we treat it as breached here too, the same moment
 * the web grid's countdown flips to "Overdue".
 */

/** Statuses the backend never grades (verdict is null for them). */
const UNGRADED = new Set(["Cancelled", "Waiting", "Hold"]);
/** Statuses whose clocks have stopped: a stored "Met" is final. */
const CLOSED = new Set(["Resolved", "Cancelled", "Completed", "Closed"]);

/** Server `sla_due_at` (ISO string) → epoch ms for SQLite, or null. */
export const slaDueToMs = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null;
  const ms = typeof value === "number" ? value : Date.parse(String(value));
  return Number.isFinite(ms) ? ms : null;
};

/** SQLite epoch ms → ISO string for the `Ticket` shape, or undefined. */
export const slaDueFromMs = (value: number | null | undefined): string | undefined =>
  value != null && Number.isFinite(value) ? new Date(value).toISOString() : undefined;

export const isSlaBreached = (ticket: {
  status?: string | null;
  sla?: string | null;
  sla_due_at?: string | null;
}): boolean => {
  if (!ticket.sla || UNGRADED.has(ticket.status || "")) return false;
  if (ticket.sla === "Breached") return true;
  if (CLOSED.has(ticket.status || "")) return false;
  const due = slaDueToMs(ticket.sla_due_at);
  return due !== null && due < Date.now();
};
