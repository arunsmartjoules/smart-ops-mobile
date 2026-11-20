// With a JoulePays site selected the JouleCool only parts hide: the SLA and
// Efficiency sub-tabs (spec 0002, AC-56), the Chiller log type in Site Logs
// and a JoulePays site handed to /chiller (AC-57). A JouleCool site brings
// them back.

import {
  hiddenSubTabRedirect,
  rememberSubTab,
  subTabToOpen,
  visibleSubTabs,
  type SubTabContext,
} from "../components/jo/modules";
import type { PermissionModule } from "../contexts/PermissionsContext";
import { chillerInitialSite, visibleLogTypes } from "../utils/siteLogTypes";

const everything = () => true;
const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);
const atJoulePays: SubTabContext = { siteCode: "APLINDR", trendSite: true, jouleCoolSite: false };
const atJouleCool: SubTabContext = { siteCode: "JCL-KIMS", trendSite: false, jouleCoolSite: true };

afterEach(() => {
  rememberSubTab("resources", "sla");
});

describe("Resources sub-tabs by site type", () => {
  it("hides SLA and Efficiency at a JoulePays site", () => {
    expect(keys(visibleSubTabs("resources", everything, atJoulePays))).toEqual(["reports", "comms"]);
  });

  it("brings SLA and Efficiency back at a JouleCool site", () => {
    expect(keys(visibleSubTabs("resources", everything, atJouleCool))).toEqual(["sla", "efficiency", "reports", "comms"]);
  });

  it("still lets the role hide SLA at a JouleCool site", () => {
    const noSla = (m: PermissionModule) => m !== "sla";
    expect(keys(visibleSubTabs("resources", noSla, atJouleCool))).toEqual(["efficiency", "reports", "comms"]);
  });
});

describe("the Resources bottom item", () => {
  it("opens the first visible sub-tab when the last one used is hidden", () => {
    rememberSubTab("resources", "sla");
    expect(subTabToOpen("resources", visibleSubTabs("resources", everything, atJoulePays))?.key).toBe("reports");
  });

  it("returns to the last sub-tab used when it is still visible", () => {
    rememberSubTab("resources", "comms");
    expect(subTabToOpen("resources", visibleSubTabs("resources", everything, atJoulePays))?.key).toBe("comms");
  });

  it("returns to SLA at a JouleCool site", () => {
    rememberSubTab("resources", "sla");
    expect(subTabToOpen("resources", visibleSubTabs("resources", everything, atJouleCool))?.key).toBe("sla");
  });
});

describe("an open sub-tab hidden by a site change", () => {
  it("moves SLA to the first visible sub-tab when a JoulePays site is picked", () => {
    expect(hiddenSubTabRedirect("resources", "/sla", everything, atJoulePays)?.path).toBe("/reports");
  });

  it("moves Efficiency the same way", () => {
    expect(hiddenSubTabRedirect("resources", "/efficiency", everything, atJoulePays)?.path).toBe("/reports");
  });

  it("leaves SLA open at a JouleCool site", () => {
    expect(hiddenSubTabRedirect("resources", "/sla", everything, atJouleCool)).toBeNull();
  });

  it("leaves Reports open at a JoulePays site", () => {
    expect(hiddenSubTabRedirect("resources", "/reports", everything, atJoulePays)).toBeNull();
  });

  it("never moves an Ops screen", () => {
    expect(hiddenSubTabRedirect("ops", "/trend-sheet", everything, atJouleCool)).toBeNull();
  });
});

describe("Site Logs log types by site type", () => {
  const TABS = [
    { key: "Temp RH", permission: "site_logs_temp_rh" },
    { key: "Chiller Logs", permission: "site_logs_chiller" },
    { key: "Water", permission: "site_logs_water" },
    { key: "Chemical Dosing", permission: "site_logs_chemical" },
  ] as const;

  it("drops Chiller at a JoulePays site", () => {
    expect(keys(visibleLogTypes(TABS, everything, false))).toEqual(["Temp RH", "Water", "Chemical Dosing"]);
  });

  it("keeps Chiller at a JouleCool site", () => {
    expect(keys(visibleLogTypes(TABS, everything, true))).toEqual(["Temp RH", "Chiller Logs", "Water", "Chemical Dosing"]);
  });

  it("still applies the role's log type permissions", () => {
    const noWater = (p: string) => p !== "site_logs_water";
    expect(keys(visibleLogTypes(TABS, noWater, true))).toEqual(["Temp RH", "Chiller Logs", "Chemical Dosing"]);
  });
});

describe("the site /chiller starts with", () => {
  const SITES = [
    { site_code: "APLINDR", project_type: "JoulePays" },
    { site_code: "JCL-KIMS", project_type: "JouleCool" },
    { site_code: "JCL-OLD", project_type: null },
  ];

  it("is none for a JoulePays site", () => {
    expect(chillerInitialSite("APLINDR", SITES)).toBe("");
  });

  it("is the JouleCool site it was opened with", () => {
    expect(chillerInitialSite("JCL-KIMS", SITES)).toBe("JCL-KIMS");
  });

  it("keeps a site cached with no project type", () => {
    expect(chillerInitialSite("JCL-OLD", SITES)).toBe("JCL-OLD");
  });

  it("keeps a code the site list does not know", () => {
    expect(chillerInitialSite("JCL-NEW", SITES)).toBe("JCL-NEW");
  });
});
