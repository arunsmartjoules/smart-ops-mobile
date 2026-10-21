/**
 * Lucide-compatible icon components drawn with Boxicons — the artboards'
 * icon set. Screens written against lucide's API (`<Icon size color />`,
 * `LucideIcon`) import from here instead of "lucide-react-native" and render
 * the design's glyphs without rewriting every call site. New code can use
 * `<Bx name="…" />` directly; `bxIcon("bx-…")` makes a one-off component.
 */
import React from "react";
import { Bx, type BxName } from "@/components/jo/Bx";

export interface BxIconProps {
  size?: number;
  color?: string;
  /** Accepted for lucide compatibility; glyph fonts have fixed stroke/fill. */
  strokeWidth?: number;
  fill?: string;
  fillOpacity?: number;
  style?: unknown;
}

export type LucideIcon = React.ComponentType<BxIconProps>;

const cache = new Map<BxName, LucideIcon>();

export function bxIcon(name: BxName): LucideIcon {
  const hit = cache.get(name);
  if (hit) return hit;
  const Icon = ({ size = 24, color }: BxIconProps) => <Bx name={name} size={size} color={color} />;
  Icon.displayName = `Bx(${name})`;
  cache.set(name, Icon);
  return Icon;
}

export const ArrowLeft = bxIcon("bx-arrow-back");
export const ArrowLeftRight = bxIcon("bx-transfer");
export const ArrowUpCircle = bxIcon("bx-download");
export const Bell = bxIcon("bx-bell");
export const BookOpen = bxIcon("bx-book-open");
export const Building2 = bxIcon("bx-buildings");
export const Calculator = bxIcon("bx-calculator");
export const Calendar = bxIcon("bx-calendar");
export const Camera = bxIcon("bx-camera");
export const Check = bxIcon("bx-check");
export const ChevronDown = bxIcon("bx-chevron-down");
export const ChevronLeft = bxIcon("bx-chevron-left");
export const ChevronRight = bxIcon("bx-chevron-right");
export const ChevronUp = bxIcon("bx-chevron-up");
export const CircleAlert = bxIcon("bx-error-circle");
export const CircleCheck = bxIcon("bx-check-circle");
export const Clock = bxIcon("bx-time-five");
export const CloudOff = bxIcon("bx-wifi-off");
export const CloudUpload = bxIcon("bx-cloud-upload");
export const Download = bxIcon("bx-download");
export const ExternalLink = bxIcon("bx-link-external");
export const File = bxIcon("bx-file-blank");
export const FileDown = bxIcon("bx-download");
export const FileSpreadsheet = bxIcon("bx-spreadsheet");
export const FileText = bxIcon("bxs-file-pdf");
export const FileWarning = bxIcon("bx-error");
export const Flag = bxIcon("bx-flag");
export const GitCompare = bxIcon("bx-git-compare");
export const Inbox = bxIcon("bx-envelope");
export const Info = bxIcon("bx-info-circle");
export const LayoutDashboard = bxIcon("bxs-dashboard");
export const LayoutList = bxIcon("bx-list-ul");
export const Link = bxIcon("bx-link");
export const ListChecks = bxIcon("bx-list-check");
export const ListTodo = bxIcon("bx-task");
export const Lock = bxIcon("bx-lock-alt");
export const LogOut = bxIcon("bx-log-out");
export const Maximize2 = bxIcon("bx-expand-alt");
export const MessageCircle = bxIcon("bx-message-rounded");
export const MessageSquareWarning = bxIcon("bx-message-error");
export const MessagesSquare = bxIcon("bx-conversation");
export const Monitor = bxIcon("bx-desktop");
export const Moon = bxIcon("bx-moon");
export const MousePointerClick = bxIcon("bx-pointer");
export const Paperclip = bxIcon("bx-paperclip");
export const Pencil = bxIcon("bx-pencil");
export const Plus = bxIcon("bx-plus");
export const Receipt = bxIcon("bx-receipt");
export const RefreshCw = bxIcon("bx-refresh");
export const ScrollText = bxIcon("bx-detail");
export const Search = bxIcon("bx-search");
export const Send = bxIcon("bx-send");
export const Share = bxIcon("bx-share-alt");
export const ShieldOff = bxIcon("bx-shield-x");
export const Speech = bxIcon("bx-user-voice");
export const Sun = bxIcon("bx-sun");
export const Table = bxIcon("bx-table");
export const ThumbsUp = bxIcon("bx-like");
export const TriangleAlert = bxIcon("bx-error-alt");
export const Users = bxIcon("bx-group");
export const WifiOff = bxIcon("bx-wifi-off");
export const Wrench = bxIcon("bx-wrench");
export const X = bxIcon("bx-x");
