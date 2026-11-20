// The Ops "Trend Sheet" sub-tab exists only for a role that can view daily
// entry AND at a JoulePays site the user enters readings for (spec 0002,
// AC-40). Its screens sit behind the same permission in the route guard.

jest.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({}) }));
jest.mock("@/utils/apiHelper", () => ({ apiFetch: jest.fn() }));
jest.mock("@/constants/api", () => ({ API_BASE_URL: "http://test" }));
jest.mock("@/utils/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn(async () => null),
  setItem: jest.fn(async () => undefined),
}));

import { permForPath, visibleSubTabs, type SubTabContext } from "../components/jo/modules";
import { parseViewMap, type PermissionModule } from "../contexts/PermissionsContext";

const everything = () => true;
const atTrendSite: SubTabContext = { siteCode: "APLINDR", trendSite: true, jouleCoolSite: false };
const atOtherSite: SubTabContext = { siteCode: "COOL1", trendSite: false, jouleCoolSite: true };
const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);

describe("the Trend Sheet sub-tab", () => {
  it("shows at a trend sheet site for a role that can view daily entry", () => {
    expect(keys(visibleSubTabs("ops", everything, atTrendSite))).toContain("trend");
  });

  it("is hidden at a site that is not a trend sheet site", () => {
    expect(keys(visibleSubTabs("ops", everything, atOtherSite))).not.toContain("trend");
  });

  it("is hidden when no site is selected", () => {
    expect(keys(visibleSubTabs("ops", everything, { siteCode: null, trendSite: false, jouleCoolSite: true }))).not.toContain("trend");
  });

  it("is hidden from a role without daily entry, even at a trend sheet site", () => {
    const noTrend = (m: PermissionModule) => m !== "trend_sheet_entry";
    expect(keys(visibleSubTabs("ops", noTrend, atTrendSite))).not.toContain("trend");
  });

  it("leaves the other Ops tabs as they were", () => {
    expect(keys(visibleSubTabs("ops", everything, atOtherSite))).toEqual(["tickets", "pm", "logs", "incidents", "assets"]);
  });

  it("leaves the Resources tabs alone at a JouleCool site", () => {
    expect(keys(visibleSubTabs("resources", everything, atOtherSite))).toEqual(["sla", "efficiency", "reports", "comms"]);
  });
});

describe("the route guard", () => {
  it.each(["/trend-sheet", "/trend-electricity", "/trend-dg", "/trend-fuel", "/trend-summary", "/trend-month"])(
    "puts %s behind daily entry",
    (path) => {
      expect(permForPath(path)).toBe("trend_sheet_entry");
    },
  );

  it("still sends the tickets tab to its own permission", () => {
    expect(permForPath("/tickets")).toBe("tickets");
  });
});

describe("trend sheet grants from the server", () => {
  const cell = (view: boolean, edit: boolean) => ({ view, add: edit, edit, delete: false, export: false, import: false });

  it("reads the daily entry grant", () => {
    expect(parseViewMap({ trend_sheet_entry: cell(true, true) }).trend_sheet_entry.edit).toBe(true);
  });

  it("denies daily entry when the payload was cached before the keys existed", () => {
    expect(parseViewMap({ tickets: cell(true, true) }).trend_sheet_entry.view).toBe(false);
  });
});
