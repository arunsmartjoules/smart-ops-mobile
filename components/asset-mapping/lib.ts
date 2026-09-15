/**
 * Asset Mapping — shared vocabulary, palette and pure helpers.
 *
 * Layout and flow come from the Claude Design "JouleOps Asset Mapping"
 * artboard; colours are the app's own DS tokens so the screens follow the
 * light/dark theme. The design's status accents (green / amber / purple) have
 * no DS token, so they're defined here per theme, the same way HomeUI keeps
 * its mock-only tints.
 */
import type { DsTheme } from "@/hooks/useDs";
import type { MappedAsset, NameplateQualityIssue } from "@/services/AssetMappingService";

/* ── Palette ───────────────────────────────────────────────────────────── */

export function amPalette(ds: DsTheme) {
  return {
    screen: ds.pageBg,
    card: ds.white,
    raised: ds.isDark ? ds.thunder[400] : ds.carbon[1000],
    border: ds.isDark ? "rgba(255,255,255,0.08)" : "rgba(7,43,49,0.09)",
    borderStrong: ds.isDark ? "rgba(255,255,255,0.14)" : "rgba(7,43,49,0.16)",
    text: ds.carbon[100],
    sub: ds.carbon[500],
    muted: ds.carbon[700],
    accent: ds.flame[100],
    onAccent: "#FFFFFF",
    success: ds.isDark ? "#34C77B" : "#16924F",
    warning: ds.isDark ? "#F5A524" : "#B86E00",
    info: ds.sky[100],
    ai: ds.isDark ? "#B39CF0" : "#6E4FD0",
  };
}
export type AmPalette = ReturnType<typeof amPalette>;

/** `#RRGGBB` + alpha → rgba(). */
export function tint(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const MONO = "Menlo";

/* ── Asset types ───────────────────────────────────────────────────────── */

interface TypeDef {
  abbr: string;
  color: string;
  test: RegExp;
  seeds: string[];
}

const IDENT = ["Make / Brand", "Model No.", "Serial No.", "Tag No."];

const TYPES: TypeDef[] = [
  {
    abbr: "CHR",
    color: "#4A91EA",
    test: /chiller/i,
    seeds: [...IDENT, "Capacity (TR)", "Refrigerant", "Power Input (kW)", "Voltage / Phase", "Year of Mfg."],
  },
  {
    abbr: "AHU",
    color: "#9B7FEA",
    test: /\bahu\b|air handling|\btfa\b|fahu/i,
    seeds: [
      ...IDENT,
      "Air Qty (CFM/CMH)",
      "Static Pressure (mmWG/Pa)",
      "Fan RPM",
      "Fan Model",
      "Motor (kW/Pole/Ph)",
      "Coil",
      "Filter",
      "Year of Mfg.",
    ],
  },
  {
    abbr: "FCU",
    color: "#1FAFAF",
    test: /\bfcu\b|fan coil/i,
    seeds: [...IDENT, "Airflow (CFM)", "Cooling Capacity (kW)", "Motor (W)", "Rows / Speed"],
  },
  {
    abbr: "CT",
    color: "#6F8FC8",
    test: /cooling tower|\bct\b/i,
    seeds: [...IDENT, "Nominal (TR)", "Water Flow (GPM)", "Fan Motor (kW)", "Range / Approach"],
  },
  {
    abbr: "PMP",
    color: "#D0668F",
    test: /pump/i,
    seeds: [...IDENT, "Flow (m3/hr)", "Head (m)", "Motor (kW)", "RPM"],
  },
];

const GENERIC_SEEDS = [...IDENT, "Capacity", "Power", "Voltage / Phase", "Year of Mfg."];

export interface TypeMeta {
  abbr: string;
  label: string;
  color: string;
  seeds: string[];
}

/** Badge abbreviation, label and tint for an asset, from its type columns. */
export function typeMeta(asset: MappedAsset, fallbackColor: string): TypeMeta {
  const label = asset.equipment_type || asset.asset_type || "Asset";
  const haystack = `${asset.equipment_type ?? ""} ${asset.asset_type ?? ""} ${asset.asset_name}`;
  const def = TYPES.find((t) => t.test.test(haystack));
  if (def) return { abbr: def.abbr, label, color: def.color, seeds: def.seeds };
  const abbr =
    label
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "AST";
  return { abbr, label, color: fallbackColor, seeds: GENERIC_SEEDS };
}

/** Seed text for manual entry: that type's labels with empty values. */
export const manualSeedText = (meta: TypeMeta) =>
  meta.seeds.map((l) => `• ${l}: `).join("\n");

/* ── Status ────────────────────────────────────────────────────────────── */

export type ListFilter = "All" | "Pending" | "Mapped" | "No Access" | "Data Pending";

export function statusChip(asset: MappedAsset, p: AmPalette) {
  if (asset.mapping_status === "mapped") return { label: "Mapped", color: p.success };
  if (asset.mapping_status === "no_access") return { label: "No access", color: p.warning };
  return { label: "Pending", color: p.sub };
}

/* ── Nameplate text ────────────────────────────────────────────────────── */

export interface Point {
  label: string;
  value: string;
}

/** "• Label: value" lines → points (same rule the backend applies on save). */
export function parsePoints(text: string): Point[] {
  return (text || "")
    .split("\n")
    .map((l) => l.replace(/^\s*[•\-*]\s*/, "").trim())
    .filter((l) => l.indexOf(":") > 0)
    .map((l) => ({
      label: l.slice(0, l.indexOf(":")).trim(),
      value: l.slice(l.indexOf(":") + 1).trim(),
    }))
    .filter((p) => p.label && p.value);
}

export const tagOf = (text: string) =>
  parsePoints(text).find((p) => /tag/i.test(p.label))?.value ?? "";

/* ── Copy ──────────────────────────────────────────────────────────────── */

export const QUALITY_ISSUE_COPY: Record<NameplateQualityIssue, { title: string; fix: string }> = {
  blurry: { title: "Blurry", fix: "Hold the phone steady and tap to focus." },
  glare: { title: "Glare on plate", fix: "Reflection is covering text; change your angle." },
  too_dark: { title: "Too dark", fix: "Move closer or turn on the flash." },
  cropped: { title: "Plate cut off", fix: "Step back so the whole plate is inside the frame." },
  not_a_nameplate: {
    title: "No nameplate found",
    fix: "Point the camera at the rating plate on the unit.",
  },
};

export const NO_ACCESS_REASONS = [
  "Concealed behind false ceiling/panel",
  "Close to wall — nameplate not reachable",
  "Area locked / restricted access",
  "Equipment continuously in operation",
  "High installation — unsafe to access",
  "Other",
] as const;

/* ── QR ────────────────────────────────────────────────────────────────── */

/** What an asset's QR encodes — same rule as the web Assets page. */
export const qrValue = (asset: MappedAsset) => asset.qr_id || asset.asset_id;

/** Plain QR image (QuickChart, as the web Assets page uses). */
export const qrImageUrl = (value: string, size: number) =>
  `https://quickchart.io/qr?size=${size}&margin=1&text=${encodeURIComponent(value)}`;
