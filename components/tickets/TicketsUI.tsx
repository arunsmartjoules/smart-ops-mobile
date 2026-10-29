/**
 * Ticket colour + label rules — the "JouleOps App" artboard's TK_ST / priority
 * maps (constants 1471–1540, v5Vals tkRows), keyed by the backend's status
 * values. Shared by the list row and the detail screen.
 */
import type { BxName } from "@/components/jo/Bx";
import { toneBg, toneFg, type JoTheme, type JoTone } from "@/constants/jo";
import { formatIST, formatISTTime, istParts } from "@/utils/istDate";
import type { Ticket } from "@/services/TicketsService";

/** Artboard TK_ST: Open BAD · In progress INFO · Hold MUTE · Waiting WARN · Resolved OK · Cancelled MUTE. No Access (Waiting's replacement) takes WARN. */
const STATUS_TONE: Record<string, JoTone> = {
  Open: "bad",
  Inprogress: "info",
  Hold: "mute",
  Waiting: "warn",
  "No Access": "warn",
  Resolved: "ok",
  Cancelled: "mute",
};

/** "Inprogress" is what the backend stores; the artboard shows "In progress". */
export const ticketStatusText = (status: string | undefined) =>
  status === "Inprogress" ? "In progress" : status || "Open";

export const ticketStatusTone = (status: string | undefined): JoTone =>
  STATUS_TONE[status || "Open"] ?? "mute";

export const ticketStatusColors = (t: JoTheme, status: string | undefined) => {
  const tone = ticketStatusTone(status);
  return { label: ticketStatusText(status), fg: toneFg(t, tone), bg: toneBg(t, tone) };
};

/**
 * Artboard priority pill: Very high = solid BAD with dark text, High = BAD
 * tint, Low = INFO tint, anything else (Medium) = MUTE tint. Null when the
 * ticket carries no priority.
 */
export const ticketPriorityColors = (t: JoTheme, priority: string | undefined) => {
  const raw = (priority || "").trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  if (key === "very high") return { label: "Very high", bg: t.bad, fg: t.onAccent };
  if (key === "high") return { label: "High", bg: t.badTint, fg: t.bad };
  if (key === "low") return { label: "Low", bg: t.infoTint, fg: t.info };
  if (key === "medium") return { label: "Medium", bg: t.muteTint, fg: t.mute };
  return { label: raw, bg: t.muteTint, fg: t.mute };
};

/**
 * Category → artboard glyph. Categories are free text from the backend
 * ("Area Temperature Complaints", "AHU and FCU Breakdown"…), so match on
 * keywords — same buckets as utils/ticketVisuals.
 */
export const ticketCategoryIcon = (category?: string): BxName => {
  const c = (category || "").toLowerCase();
  if (/(water|leak|drain|condensate|rh\b|humid)/.test(c)) return "bxs-droplet";
  if (/(air ?flow|ventilat|draft|air quality|\bfan\b|blower|ahu|fcu)/.test(c)) return "bx-wind";
  if (/(temp|cooling|cold|hot)/.test(c)) return "bxs-thermometer";
  if (/(chiller|electr|power|panel|voltage)/.test(c)) return "bxs-bolt";
  return "bxs-cog";
};

/** "1h 29m" / "2d 8h" / "5d" — the artboard's compact age. */
export const formatTicketAge = (createdAt?: string) => {
  if (!createdAt) return "—";
  const started = Date.parse(createdAt);
  if (Number.isNaN(started)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  if (days >= 3 || restHours === 0) return `${days}d`;
  return `${days}d ${restHours}h`;
};

/** "22 Sep, 10:30 AM" in IST — year appended only when it isn't this year. */
export const formatTicketCreated = (createdAt?: string) => {
  if (!createdAt) return "";
  const ms = Date.parse(createdAt);
  if (Number.isNaN(ms)) return "";
  const sameYear = istParts(ms).year === istParts(new Date()).year;
  const day = formatIST(ms, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  return `${day}, ${formatISTTime(ms)}`;
};

const CLOSED = new Set(["Resolved", "Cancelled"]);

/**
 * A ticket only reads as late when the backend actually gave it a due date and
 * that date has passed while the ticket is still open — no SLA is inferred
 * from age alone.
 */
export const isTicketLate = (item: Pick<Ticket, "status" | "due_date">) => {
  if (CLOSED.has(item.status)) return false;
  if (!item.due_date) return false;
  const due = Date.parse(item.due_date);
  return !Number.isNaN(due) && due < Date.now();
};
