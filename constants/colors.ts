/**
 * Design tokens - Color palette for the JouleOps app
 */

export const colors = {
  // Brand colors
  primary: {
    50: "#fef2f2",
    100: "#fee2e2",
    200: "#fecaca",
    300: "#fca5a5",
    400: "#f87171",
    500: "#ef4444",
    600: "#dc2626",
    700: "#b91c1c",
    800: "#991b1b",
    900: "#7f1d1d",
  },

  // Status colors
  success: {
    light: "#dcfce7",
    main: "#22c55e",
    dark: "#16a34a",
  },
  warning: {
    light: "#fef3c7",
    main: "#f59e0b",
    dark: "#d97706",
  },
  error: {
    light: "#fee2e2",
    main: "#ef4444",
    dark: "#dc2626",
  },
  info: {
    light: "#dbeafe",
    main: "#3b82f6",
    dark: "#2563eb",
  },

  // Neutral colors
  slate: {
    50: "#f8fafc",
    100: "#f1f5f9",
    200: "#e2e8f0",
    300: "#cbd5e1",
    400: "#94a3b8",
    500: "#64748b",
    600: "#475569",
    700: "#334155",
    800: "#1e293b",
    900: "#0f172a",
    950: "#020617",
  },

  // Common
  white: "#ffffff",
  black: "#000000",
  transparent: "transparent",
} as const;

// Gradient helpers
export const gradients = {
  primary: ["#dc2626", "#b91c1c"] as const,
  success: ["#22c55e", "#16a34a"] as const,
  warning: ["#f59e0b", "#d97706"] as const,
  info: ["#3b82f6", "#2563eb"] as const,
  dark: ["#334155", "#1e293b"] as const,
} as const;

export default colors;
