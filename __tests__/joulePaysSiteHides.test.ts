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
import {
  DEFAULT_PROJECT_TYPE_PAGES,
  isModuleOnFor,
  parseProjectTypePages,
  projectTypeOfSite,
  type ProjectTypeKey,
  type ProjectTypePageMatrix,
} from "../services/ProjectTypePages";
import { chillerInitialSite, visibleLogTypes } from "../utils/siteLogTypes";

const everything = () => true;
const keys = (tabs: { key: string }[]) => tabs.map((t) => t.key);
/** Pages by Project Type bound to one kind of site, as useSelectedPageOn does. */
const pagesAt =
  (type: ProjectTypeKey, matrix: ProjectTypePageMatrix = DEFAULT_PROJECT_TYPE_PAGES) =>
  (m: PermissionModule) =>
    isModuleOnFor(matrix, type, m);
const atJoulePays: SubTabContext = { siteCode: "APLINDR", trendSite: true, pageOn: pagesAt("joulepays") };
const atJouleCool: SubTabContext = { siteCode: "JCL-KIMS", trendSite: false, pageOn: pagesAt("joulecool") };

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

  it("never moves the Ops Trend Sheet for its own site rule", () => {
    expect(hiddenSubTabRedirect("ops", "/trend-sheet", everything, atJouleCool)).toBeNull();
  });

  it("moves an Ops screen whose page is turned off for the site's project type", () => {
    const noTicketsAtJouleCool = parseProjectTypePages({ joulecool: { tickets: false } });
    const ctx: SubTabContext = { ...atJouleCool, pageOn: pagesAt("joulecool", noTicketsAtJouleCool) };
    expect(hiddenSubTabRedirect("ops", "/tickets", everything, ctx)?.path).toBe("/preventive-maintenance");
  });

  it("does not move anything before a site is known", () => {
    const ctx: SubTabContext = { siteCode: null, trendSite: false };
    expect(hiddenSubTabRedirect("resources", "/sla", everything, ctx)).toBeNull();
  });
});

describe("Pages by Project Type", () => {
  it("shows SLA at a JoulePays site once it is turned on there", () => {
    const slaOn = parseProjectTypePages({ joulepays: { sla: true } });
    const ctx: SubTabContext = { ...atJoulePays, pageOn: pagesAt("joulepays", slaOn) };
    expect(keys(visibleSubTabs("resources", everything, ctx))).toEqual(["sla", "reports", "comms"]);
  });

  it("hides Tickets at a JouleCool site when it is turned off there", () => {
    const off = parseProjectTypePages({ joulecool: { tickets: false } });
    const ctx: SubTabContext = { ...atJouleCool, pageOn: pagesAt("joulecool", off) };
    expect(keys(visibleSubTabs("ops", everything, ctx))).not.toContain("tickets");
  });

  it("keeps Tickets at a JoulePays site when only JouleCool has it off", () => {
    const off = parseProjectTypePages({ joulecool: { tickets: false } });
    const ctx: SubTabContext = { ...atJoulePays, pageOn: pagesAt("joulepays", off) };
    expect(keys(visibleSubTabs("ops", everything, ctx))).toContain("tickets");
  });

  it("never shows a page the role cannot view, even when it is on", () => {
    const noTickets = (m: PermissionModule) => m !== "tickets";
    expect(keys(visibleSubTabs("ops", noTickets, atJouleCool))).not.toContain("tickets");
  });

  it("files a Site Logs category under the Site Logs page", () => {
    const off = parseProjectTypePages({ joulecool: { site_logs: false } });
    expect(isModuleOnFor(off, "joulecool", "site_logs_water")).toBe(false);
  });

  it("files Trend Sheet daily entry under the Trend Sheet page", () => {
    const off = parseProjectTypePages({ joulepays: { trend_sheet: false } });
    expect(isModuleOnFor(off, "joulepays", "trend_sheet_entry")).toBe(false);
  });

  it("treats a cached site with no project type as JouleCool", () => {
    expect(projectTypeOfSite({ project_type: null })).toBe("joulecool");
  });

  it("puts any other project type in the JoulePays column", () => {
    expect(projectTypeOfSite({ project_type: "DeJoule" })).toBe("joulepays");
  });

  it("hides the Site Logs sub-tab once every category is off", () => {
    const off = parseProjectTypePages({ joulecool: { site_logs: false } });
    const ctx: SubTabContext = { ...atJouleCool, pageOn: pagesAt("joulecool", off) };
    expect(keys(visibleSubTabs("ops", everything, ctx))).not.toContain("logs");
  });

  it("keeps the Site Logs sub-tab while one category is on", () => {
    const oneOn = parseProjectTypePages({ joulecool: { site_logs: false, site_logs_water: true } });
    const ctx: SubTabContext = { ...atJouleCool, pageOn: pagesAt("joulecool", oneOn) };
    expect(keys(visibleSubTabs("ops", everything, ctx))).toContain("logs");
  });

  it("ignores a value that is not true or false", () => {
    expect(parseProjectTypePages({ joulepays: { sla: "yes" } }).joulepays.sla).toBe(false);
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
    expect(keys(visibleLogTypes(TABS, everything, pagesAt("joulepays")))).toEqual(["Temp RH", "Water", "Chemical Dosing"]);
  });

  it("keeps Chiller at a JouleCool site", () => {
    expect(keys(visibleLogTypes(TABS, everything, pagesAt("joulecool")))).toEqual(["Temp RH", "Chiller Logs", "Water", "Chemical Dosing"]);
  });

  it("shows Chiller at a JoulePays site once it is turned on there", () => {
    const chillerOn = parseProjectTypePages({ joulepays: { site_logs_chiller: true } });
    expect(keys(visibleLogTypes(TABS, everything, pagesAt("joulepays", chillerOn)))).toContain("Chiller Logs");
  });

  it("hides Water at a JouleCool site when it is turned off there", () => {
    const waterOff = parseProjectTypePages({ joulecool: { site_logs_water: false } });
    expect(keys(visibleLogTypes(TABS, everything, pagesAt("joulecool", waterOff)))).not.toContain("Water");
  });

  it("still applies the role's log type permissions", () => {
    const noWater = (p: string) => p !== "site_logs_water";
    expect(keys(visibleLogTypes(TABS, noWater, pagesAt("joulecool")))).toEqual(["Temp RH", "Chiller Logs", "Chemical Dosing"]);
  });
});

describe("the site /chiller starts with", () => {
  const SITES = [
    { site_code: "APLINDR", project_type: "JoulePays" },
    { site_code: "JCL-KIMS", project_type: "JouleCool" },
    { site_code: "JCL-OLD", project_type: null },
  ];

  it("is none for a JoulePays site", () => {
    expect(chillerInitialSite("APLINDR", SITES, DEFAULT_PROJECT_TYPE_PAGES)).toBe("");
  });

  it("is the JouleCool site it was opened with", () => {
    expect(chillerInitialSite("JCL-KIMS", SITES, DEFAULT_PROJECT_TYPE_PAGES)).toBe("JCL-KIMS");
  });

  it("keeps a JoulePays site once Chiller is turned on there", () => {
    const chillerOn = parseProjectTypePages({ joulepays: { site_logs_chiller: true } });
    expect(chillerInitialSite("APLINDR", SITES, chillerOn)).toBe("APLINDR");
  });

  it("keeps a site cached with no project type", () => {
    expect(chillerInitialSite("JCL-OLD", SITES, DEFAULT_PROJECT_TYPE_PAGES)).toBe("JCL-OLD");
  });

  it("keeps a code the site list does not know", () => {
    expect(chillerInitialSite("JCL-NEW", SITES, DEFAULT_PROJECT_TYPE_PAGES)).toBe("JCL-NEW");
  });
});
