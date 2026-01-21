/**
 * Status constants for tickets, attendance, and other entities
 */

// Ticket statuses
export const TICKET_STATUS = {
  OPEN: "Open",
  IN_PROGRESS: "Inprogress",
  RESOLVED: "Resolved",
  HOLD: "Hold",
  WAITING: "Waiting",
  CANCELLED: "Cancelled",
} as const;

export type TicketStatus = (typeof TICKET_STATUS)[keyof typeof TICKET_STATUS];

// Status colors for UI
export const TICKET_STATUS_COLORS: Record<
  TicketStatus,
  { bg: string; text: string; border: string }
> = {
  [TICKET_STATUS.OPEN]: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  [TICKET_STATUS.IN_PROGRESS]: {
    bg: "#fef3c7",
    text: "#d97706",
    border: "#fde68a",
  },
  [TICKET_STATUS.RESOLVED]: {
    bg: "#dcfce7",
    text: "#16a34a",
    border: "#bbf7d0",
  },
  [TICKET_STATUS.HOLD]: { bg: "#e0e7ff", text: "#4f46e5", border: "#c7d2fe" },
  [TICKET_STATUS.WAITING]: {
    bg: "#f3f4f6",
    text: "#6b7280",
    border: "#e5e7eb",
  },
  [TICKET_STATUS.CANCELLED]: {
    bg: "#f1f5f9",
    text: "#64748b",
    border: "#e2e8f0",
  },
};

// Attendance statuses
export const ATTENDANCE_STATUS = {
  NOT_CHECKED_IN: "not_checked_in",
  CHECKED_IN: "checked_in",
  CHECKED_OUT: "checked_out",
} as const;

export type AttendanceStatus =
  (typeof ATTENDANCE_STATUS)[keyof typeof ATTENDANCE_STATUS];

// Task types
export const TASK_TYPE = {
  TICKET: "Ticket",
  PM: "PM",
  LOG: "Log",
} as const;

export type TaskType = (typeof TASK_TYPE)[keyof typeof TASK_TYPE];

export default {
  TICKET_STATUS,
  TICKET_STATUS_COLORS,
  ATTENDANCE_STATUS,
  TASK_TYPE,
};
