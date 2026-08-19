/**
 * Ticket-specific colour maps for the list — Claude Design "JouleOps
 * Tickets.dc.html". The surrounding chrome (header, tabs, count line, empty
 * card) is shared; see components/shared/ListChrome.
 */
import { ds } from "@/constants/ds";
import { soRadius, soShadow } from "@/components/home/SiteOverview";

export { soRadius, soShadow };

// The list chrome itself is shared with the other module tabs.
export {
  ModuleListHeader,
  ListCountLine,
  ListEmptyCard,
  useListSlide,
  type StatusChip,
} from "@/components/shared/ListChrome";

/** The mock's STATUS map, keyed by the backend's status values. */
export const TICKET_STATUS: Record<string, { label: string; bg: string; fg: string }> = {
  Open: { label: "Open", bg: ds.flame[1000], fg: ds.flame[100] },
  Inprogress: { label: "In progress", bg: ds.sky[1000], fg: ds.sky[100] },
  Hold: { label: "Hold", bg: ds.carbon[1000], fg: ds.carbon[400] },
  Waiting: { label: "Waiting", bg: ds.carbon[1000], fg: ds.carbon[400] },
  Resolved: { label: "Resolved", bg: ds.sky[900], fg: "#1F757D" },
  Cancelled: { label: "Cancelled", bg: ds.carbon[1000], fg: ds.carbon[500] },
};

export const getTicketStatus = (status?: string) =>
  TICKET_STATUS[status || "Open"] ?? {
    label: status || "Open",
    bg: ds.carbon[1000],
    fg: ds.carbon[400],
  };

/** The mock's PRIORITY map. */
export const TICKET_PRIORITY: Record<string, { label: string; bg: string; fg: string }> = {
  "very high": { label: "Very high", bg: ds.flame[100], fg: ds.pageBg },
  high: { label: "High", bg: ds.flame[1000], fg: ds.flame[100] },
  medium: { label: "Medium", bg: ds.carbon[1000], fg: ds.carbon[400] },
  low: { label: "Low", bg: ds.sky[1000], fg: ds.sky[100] },
};

export const getTicketPriority = (priority?: string) => {
  const key = (priority || "").toLowerCase().trim();
  if (!key) return null;
  return (
    TICKET_PRIORITY[key] ?? {
      label: priority as string,
      bg: ds.carbon[1000],
      fg: ds.carbon[400],
    }
  );
};

/** Icon well behind a row's category glyph — tinted by the ticket's status. */
export const getTicketTint = (status?: string) => {
  switch (status) {
    case "Inprogress":
      return { tint: ds.sky[1000], icon: ds.sky[100] };
    case "Resolved":
      return { tint: ds.sky[900], icon: "#1F757D" };
    case "Hold":
    case "Waiting":
    case "Cancelled":
      return { tint: ds.carbon[1000], icon: ds.carbon[400] };
    default:
      return { tint: ds.flame[1000], icon: ds.flame[100] };
  }
};

