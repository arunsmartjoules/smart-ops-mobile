/**
 * Asset Mapping — shared vocabulary, colour maps and pure helpers.
 *
 * Presentation follows the other module tabs (Tickets / Incidents): the same
 * list chrome, card, detail header and badge treatment, with this flow's
 * statuses mapped onto the same DS colour roles:
 *   Pending   → flame (work to do, like an Open ticket)
 *   Review    → sky   (in progress, waiting on a manager)
 *   Completed → teal  (same as a completed incident)
 *   No access → neutral carbon
 * These statuses are this flow's own — unrelated to the asset's status.
 */
import type { DsTheme } from "@/hooks/useDs";
import { QR_CENTER_LOGO } from "@/constants/qrLogo";
import type {
  MappedAsset,
  MappingStatus,
  NameplateQualityIssue,
} from "@/services/AssetMappingService";

/* ── Status ────────────────────────────────────────────────────────────── */

export interface Tone {
  label: string;
  bg: string;
  fg: string;
}

export const mappingStatusMap = (ds: DsTheme): Record<MappingStatus, Tone> => ({
  pending: { label: "Pending", bg: ds.flame[1000], fg: ds.flame[100] },
  review: { label: "Review", bg: ds.sky[1000], fg: ds.sky[100] },
  completed: { label: "Completed", bg: ds.sky[900], fg: ds.isDark ? ds.sky[100] : "#1F757D" },
  no_access: { label: "No access", bg: ds.carbon[1000], fg: ds.carbon[400] },
});

export const getMappingStatus = (asset: MappedAsset, ds: DsTheme): Tone =>
  mappingStatusMap(ds)[asset.mapping_status] ?? mappingStatusMap(ds).pending;

/** Second badge on a card / detail summary when the AI couldn't read the plate. */
export const dataPendingTone = (ds: DsTheme): Tone => ({
  label: "Data pending",
  bg: ds.flame[1000],
  fg: ds.flame[100],
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

export type ListFilter = "all" | MappingStatus | "data_pending";

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
