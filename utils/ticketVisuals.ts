import {
  AirVent,
  Droplets,
  Droplet,
  Fan,
  Wind,
  Thermometer,
  Zap,
  Wrench,
} from "lucide-react-native";

type IconType = typeof Wrench;

export interface CategoryVisual {
  Icon: IconType;
  /** Accent colour used for the icon glyph. */
  color: string;
  /** Soft translucent tint used behind the icon. */
  tint: string;
}

/**
 * Maps a free-text ticket/complaint category to an HVAC-flavoured icon and
 * accent colour. Categories come from the backend as un-normalised strings
 * (e.g. "AHU and FCU breakdown", "Area Temperature Complaints"), so we match
 * on keywords rather than an exact enum.
 */
export const getCategoryVisual = (category?: string): CategoryVisual => {
  const c = (category || "").toLowerCase();

  if (/(water|leak|drain|condensate)/.test(c)) {
    return { Icon: Droplets, color: "#3b82f6", tint: "#3b82f61f" };
  }
  if (/(rh|humid)/.test(c)) {
    return { Icon: Droplet, color: "#0ea5e9", tint: "#0ea5e91f" };
  }
  if (/\bfan\b|blower/.test(c)) {
    return { Icon: Fan, color: "#f59e0b", tint: "#f59e0b1f" };
  }
  if (/(air ?flow|ventilat|draft|air quality)/.test(c)) {
    return { Icon: Wind, color: "#14b8a6", tint: "#14b8a61f" };
  }
  if (/(temp|cooling|cold|hot|chiller)/.test(c)) {
    return { Icon: Thermometer, color: "#dc2626", tint: "#dc26261f" };
  }
  if (/(electr|power|panel|voltage)/.test(c)) {
    return { Icon: Zap, color: "#eab308", tint: "#eab3081f" };
  }
  if (/(ac\b|a\/c|ahu|fcu|hvac|air ?con)/.test(c)) {
    return { Icon: AirVent, color: "#dc2626", tint: "#dc26261f" };
  }
  return { Icon: Wrench, color: "#64748b", tint: "#64748b1f" };
};

export interface StatusVisual {
  label: string;
  color: string;
  tint: string;
}

const STATUS_VISUALS: Record<string, StatusVisual> = {
  Open: { label: "Open", color: "#ef4444", tint: "#ef44441f" },
  Inprogress: { label: "In progress", color: "#3b82f6", tint: "#3b82f61f" },
  Hold: { label: "On hold", color: "#f59e0b", tint: "#f59e0b1f" },
  Waiting: { label: "Waiting", color: "#7c3aed", tint: "#7c3aed1f" },
  Resolved: { label: "Resolved", color: "#16a34a", tint: "#16a34a1f" },
  Cancelled: { label: "Cancelled", color: "#64748b", tint: "#64748b1f" },
};

export const getStatusVisual = (status?: string): StatusVisual =>
  STATUS_VISUALS[status || "Open"] || STATUS_VISUALS.Open;

/**
 * PM-instance status colours. PM uses its own status vocabulary
 * (Pending / In-progress / Completed / Overdue) with assorted casing
 * variants coming from the API, so normalise before mapping.
 */
export const getPmStatusVisual = (status?: string): StatusVisual => {
  const s = (status || "").toLowerCase().trim();
  if (s === "completed")
    return { label: "Completed", color: "#16a34a", tint: "#16a34a1f" };
  if (s === "in-progress" || s === "in progress" || s === "inprogress")
    return { label: "In progress", color: "#f97316", tint: "#f973161f" };
  if (s === "overdue")
    return { label: "Overdue", color: "#ef4444", tint: "#ef44441f" };
  return { label: "Pending", color: "#d97706", tint: "#d977061f" };
};

export interface PriorityVisual {
  label: string;
  color: string;
  tint: string;
}

export const getPriorityVisual = (priority?: string): PriorityVisual | null => {
  const p = (priority || "").toLowerCase().trim();
  if (!p) return null;
  if (p === "very high")
    return { label: "Very high", color: "#db2777", tint: "#db27771f" };
  if (p === "high")
    return { label: "High", color: "#ef4444", tint: "#ef44441f" };
  if (p === "medium")
    return { label: "Medium", color: "#f59e0b", tint: "#f59e0b1f" };
  if (p === "low")
    return { label: "Low", color: "#16a34a", tint: "#16a34a1f" };
  return { label: priority as string, color: "#64748b", tint: "#64748b1f" };
};

/** Two-letter initials for an assignee avatar (falls back to "?"). */
export const getInitials = (name?: string): string => {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
