/**
 * Asset Mapping — shared vocabulary, colour maps and pure helpers.
 *
 * Presentation follows the other module tabs (Tickets / Incidents): the same
 * list chrome, card, detail header and badge treatment, with this flow's
 * statuses mapped onto the same DS colour roles:
 *   Pending   → neutral carbon (work to do)
 *   Review    → sky   (in progress, waiting on a manager)
 *   Completed → teal  (same as a completed incident)
 *   Failed    → flame (needs a re-upload — the one that wants attention)
 *   No access → neutral carbon
 * These statuses are this flow's own — unrelated to the asset's status.
 */
import type { DsTheme } from "@/hooks/useDs";
import { QR_CENTER_LOGO } from "@/constants/qrLogo";
import type { MappedAsset, MappingStatus, NameplateData } from "@/services/AssetMappingService";

/* ── Status ────────────────────────────────────────────────────────────── */

export interface Tone {
  label: string;
  bg: string;
  fg: string;
}

export const mappingStatusMap = (ds: DsTheme): Record<MappingStatus, Tone> => ({
  pending: { label: "Pending", bg: ds.carbon[1000], fg: ds.carbon[300] },
  review: { label: "Review", bg: ds.sky[1000], fg: ds.sky[100] },
  completed: { label: "Completed", bg: ds.sky[900], fg: ds.sky[100] },
  failed: { label: "Failed", bg: ds.flame[1000], fg: ds.flame[100] },
  no_access: { label: "No access", bg: ds.carbon[1000], fg: ds.carbon[500] },
});

export const getMappingStatus = (asset: MappedAsset, ds: DsTheme): Tone =>
  mappingStatusMap(ds)[asset.mapping_status] ?? mappingStatusMap(ds).pending;

/** Extra badge while the uploaded nameplate is still being read. */
export const processingTone = (ds: DsTheme): Tone => ({
  label: "Reading…",
  bg: ds.sky[1000],
  fg: ds.sky[100],
});

/** Criticality badge: Critical reads urgent (flame), anything else neutral. */
export function criticalityTone(asset: MappedAsset, ds: DsTheme): Tone | null {
  const value = asset.criticality?.trim();
  if (!value) return null;
  return /^critical$/i.test(value)
    ? { label: "Critical", bg: ds.flame[1000], fg: ds.flame[100] }
    : { label: value, bg: ds.carbon[1000], fg: ds.carbon[400] };
}

/** "High Side" / "Low Side" (assets.category) → "High side" / "Low side". */
export function sideLabel(asset: MappedAsset): string | null {
  const value = asset.category?.trim();
  if (!value) return null;
  const m = /^(high|low)\s*side$/i.exec(value);
  return m ? `${m[1]![0]!.toUpperCase()}${m[1]!.slice(1).toLowerCase()} side` : value;
}

/**
 * The AI read's state for one equipment line item, in the same colour roles
 * as the asset statuses: none → neutral, reading → sky, read → teal,
 * not read → flame.
 */
export function equipmentTone(
  equipment: { nameplate_data: NameplateData | null; nameplate_photo_url: string | null },
  ds: DsTheme,
): Tone {
  switch (equipment.nameplate_data?.state) {
    case "processing":
      return { label: "Reading…", bg: ds.sky[1000], fg: ds.sky[100] };
    case "ok":
      return { label: "Read", bg: ds.sky[900], fg: ds.isDark ? ds.sky[100] : "#1F757D" };
    case "manual":
      return { label: "By hand", bg: ds.sky[900], fg: ds.isDark ? ds.sky[100] : "#1F757D" };
    case "failed":
      return { label: "Not read", bg: ds.flame[1000], fg: ds.flame[100] };
    default:
      return {
        label: equipment.nameplate_photo_url ? "No data" : "No nameplate",
        bg: ds.carbon[1000],
        fg: ds.carbon[400],
      };
  }
}

export type ListFilter = "all" | MappingStatus;

/* ── Asset types ───────────────────────────────────────────────────────── */

interface TypeDef {
  abbr: string;
  test: RegExp;
  seeds: string[];
}

const IDENT = ["Make / Brand", "Model No.", "Serial No.", "Tag No."];

const TYPES: TypeDef[] = [
  {
    abbr: "CHR",
    test: /chiller/i,
    seeds: [...IDENT, "Capacity (TR)", "Refrigerant", "Power Input (kW)", "Voltage / Phase", "Year of Mfg."],
  },
  {
    abbr: "AHU",
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
    test: /\bfcu\b|fan coil/i,
    seeds: [...IDENT, "Airflow (CFM)", "Cooling Capacity (kW)", "Motor (W)", "Rows / Speed"],
  },
  {
    abbr: "CT",
    test: /cooling tower|\bct\b/i,
    seeds: [...IDENT, "Nominal (TR)", "Water Flow (GPM)", "Fan Motor (kW)", "Range / Approach"],
  },
  {
    abbr: "PMP",
    test: /pump/i,
    seeds: [...IDENT, "Flow (m3/hr)", "Head (m)", "Motor (kW)", "RPM"],
  },
];

const GENERIC_SEEDS = [...IDENT, "Capacity", "Power", "Voltage / Phase", "Year of Mfg."];

/* ── Type colours ──────────────────────────────────────────────────────── */

/**
 * One hue per equipment type for the code badge on each card, so a site's
 * AHUs, FCUs, chillers… are told apart at a glance. Each entry is [light-mode
 * text, dark-mode text]; the badge fill is the same hue at low opacity.
 */
const TYPE_HUES: [string, string][] = [
  ["#1D5FC2", "#6FA8FF"], // blue
  ["#6B3FC9", "#B39CF0"], // violet
  ["#0B7F7A", "#4FD1C5"], // teal
  ["#B4460C", "#F59E6B"], // orange
  ["#B3246B", "#F28AC0"], // pink
  ["#3F7D12", "#8BD65A"], // green
  ["#8A6A00", "#E8C547"], // amber
  ["#0E6FA3", "#5CC4F2"], // sky
  ["#8C2F2F", "#F08A8A"], // red
  ["#4B5B8C", "#A3B3E6"], // slate-indigo
];

/** Fixed hues for the common HVAC types; everything else is hashed. */
const FIXED_HUE: Record<string, number> = {
  AHU: 1,
  FCU: 2,
  CHR: 0,
  CT: 7,
  PMP: 4,
  CU: 3,
  C: 6,
};

export function typeColor(abbr: string, ds: DsTheme): { bg: string; fg: string } {
  let index = FIXED_HUE[abbr];
  if (index === undefined) {
    let h = 0;
    for (let i = 0; i < abbr.length; i++) h = (h * 31 + abbr.charCodeAt(i)) >>> 0;
    index = h % TYPE_HUES.length;
  }
  const [light, dark] = TYPE_HUES[index]!;
  const fg = ds.isDark ? dark : light;
  return { fg, bg: withAlpha(fg, ds.isDark ? 0.18 : 0.12) };
}

function withAlpha(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export interface TypeMeta {
  abbr: string;
  label: string;
  seeds: string[];
}

/** Short type code, label and manual-entry labels for an asset. */
export function typeMeta(asset: MappedAsset): TypeMeta {
  const label = asset.equipment_type || asset.asset_type || "Asset";
  const haystack = `${asset.equipment_type ?? ""} ${asset.asset_type ?? ""} ${asset.asset_name}`;
  const def = TYPES.find((t) => t.test.test(haystack));
  if (def) return { abbr: def.abbr, label, seeds: def.seeds };
  const abbr =
    label
      .split(/[^A-Za-z0-9]+/)
      .filter(Boolean)
      .map((w) => w[0])
      .join("")
      .slice(0, 3)
      .toUpperCase() || "AST";
  return { abbr, label, seeds: GENERIC_SEEDS };
}

/** Seed text for manual entry: that type's labels with empty values. */
export const manualSeedText = (meta: TypeMeta) =>
  meta.seeds.map((l) => `• ${l}: `).join("\n");

export const placeOf = (asset: MappedAsset) =>
  [asset.floor, asset.location].filter(Boolean).join(" · ");

/** Most recent capture / approval on the record. */
export function lastActivity(asset: MappedAsset): string | null {
  const stamps = [
    asset.nameplate_captured_at,
    asset.location_captured_at,
    asset.no_access_logged_at,
    asset.approved_at,
  ].filter((v): v is string => !!v);
  if (stamps.length === 0) return null;
  return stamps.reduce((a, b) => (Date.parse(b) > Date.parse(a) ? b : a));
}

/** "1h 29m" / "2d 8h" / "5d" — the compact age the ticket and incident rows use. */
export function formatAge(value?: string | null): string {
  if (!value) return "—";
  const started = Date.parse(value);
  if (Number.isNaN(started)) return "—";
  const mins = Math.max(0, Math.floor((Date.now() - started) / 60000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${String(mins % 60).padStart(2, "0")}m`;
  const days = Math.floor(hours / 24);
  const rest = hours % 24;
  if (days >= 3 || rest === 0) return `${days}d`;
  return `${days}d ${rest}h`;
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

export const NO_ACCESS_REASONS = [
  "Concealed behind false ceiling/panel",
  "Close to wall — nameplate not reachable",
  "Area locked / restricted access",
  "Equipment continuously in operation",
  "High installation — unsafe to access",
  "Other",
] as const;

/* ── QR ────────────────────────────────────────────────────────────────── */

/**
 * What an asset's QR encodes — the web Assets table's rule (`assetQrValue` in
 * web/src/lib/qr-code.ts): qr_id, falling back to asset_id when blank.
 */
export const qrValue = (asset: MappedAsset) =>
  (asset.qr_id ?? "").trim() || asset.asset_id;

/**
 * QuickChart QR URL built like the web Assets table's (`buildUrl` in
 * web/src/lib/qr-code.ts): same parameters and the same Smart Joules centre
 * logo passed as a data URI, with the logo box scaled to the image size.
 */
export function qrImageUrl(value: string, size: number, withLogo = true): string {
  const params = [`text=${encodeURIComponent(value)}`, `size=${size}`];
  if (withLogo) {
    params.push(
      `centerImageUrl=${encodeURIComponent(QR_CENTER_LOGO)}`,
      "centerImageSizeRatio=1.0",
      // The web's logo box is 80×30 px on its 160 px table thumbnail; scale
      // it so a larger label keeps the same proportions.
      `centerImageHeight=${Math.round(size * (30 / 160))}`,
      `centerImageWidth=${Math.round(size * (80 / 160))}`,
    );
  }
  return `https://quickchart.io/qr?${params.join("&")}`;
}
