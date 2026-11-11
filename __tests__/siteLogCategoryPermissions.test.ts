// Category-scoped Site Logs / PM permissions (backend spec 0001): the app
// reads category keys from /me, falls back to the parent for a payload cached
// before they existed, applies its own Site Logs / PM visibility rules, and
// skips pulls for hidden categories.

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

import { parseViewMap } from "../contexts/PermissionsContext";
import {
  canPullSiteLogCategory,
  isModuleForbidden,
  setViewableSiteLogCategories,
} from "../services/SiteLogCategoryAccess";

const cell = (actions: string) => ({
  view: actions.includes("V"),
  add: actions.includes("A"),
  edit: actions.includes("E"),
  delete: actions.includes("D"),
  export: actions.includes("X"),
  import: actions.includes("I"),
});

describe("parseViewMap with category keys", () => {
  const tempRhOnly = {
    site_logs: cell("VAE"),
    site_logs_temp_rh: cell("VAE"),
    site_logs_water: cell(""),
    site_logs_chiller: cell(""),
    site_logs_chemical: cell(""),
    site_logs_activity_master: cell(""),
    pm: cell("VAE"),
    pm_activity: cell("VAE"),
    pm_checklist: cell(""),
    pm_schedule: cell("V"),
  };

  it("hides a category the payload denies", () => {
    expect(parseViewMap(tempRhOnly).site_logs_water.view).toBe(false);
  });

  it("keeps a category the payload grants", () => {
    expect(parseViewMap(tempRhOnly).site_logs_temp_rh.add).toBe(true);
  });

  it("falls back to site_logs when a cached payload has no category keys", () => {
    const cached = { site_logs: cell("VAE"), pm: cell("VA") };
    expect(parseViewMap(cached).site_logs_chiller).toMatchObject({ view: true, edit: true });
  });

  it("falls back to pm for pm_activity in a cached payload", () => {
    const cached = { site_logs: cell("V"), pm: cell("VA") };
    expect(parseViewMap(cached).pm_activity.add).toBe(true);
  });

  it("hides Site Logs when only Activity Master is viewable (the app has no such tab)", () => {
    const amOnly = {
      ...tempRhOnly,
      site_logs_temp_rh: cell(""),
      site_logs_activity_master: cell("V"),
    };
    expect(parseViewMap(amOnly).site_logs.view).toBe(false);
  });

  it("shows Site Logs when any of its four app categories is viewable", () => {
    expect(parseViewMap(tempRhOnly).site_logs.view).toBe(true);
  });

  it("hides PM when PM Activity is not viewable, even with Schedule on", () => {
    const scheduleOnly = { ...tempRhOnly, pm_activity: cell(""), pm_schedule: cell("V") };
    expect(parseViewMap(scheduleOnly).pm.view).toBe(false);
  });

  it("keeps PM Schedule view-only whatever its parent grants", () => {
    const cached = { pm: cell("VAEDXI") };
    expect(parseViewMap(cached).pm_schedule).toMatchObject({ view: true, add: false });
  });
});

describe("canPullSiteLogCategory", () => {
  afterEach(() => setViewableSiteLogCategories(null));

  it("pulls everything while the role's answer is unknown", () => {
    setViewableSiteLogCategories(null);
    expect(canPullSiteLogCategory("Water")).toBe(true);
  });

  it("skips a hidden category", () => {
    setViewableSiteLogCategories(new Set(["site_logs_temp_rh"]));
    expect(canPullSiteLogCategory("Water")).toBe(false);
  });

  it("pulls a viewable category", () => {
    setViewableSiteLogCategories(new Set(["site_logs_temp_rh"]));
    expect(canPullSiteLogCategory("Temp RH")).toBe(true);
  });

  it("maps the Chiller Logs tab to the chiller category", () => {
    setViewableSiteLogCategories(new Set(["site_logs_temp_rh"]));
    expect(canPullSiteLogCategory("Chiller Logs")).toBe(false);
  });
});

describe("isModuleForbidden", () => {
  it("recognises a revoked log type", () => {
    expect(isModuleForbidden(403, { code: "MODULE_FORBIDDEN" })).toBe(true);
  });

  it("does not treat a site-assignment 403 as a revoked log type", () => {
    expect(isModuleForbidden(403, { error: "You are not assigned to this site's logs" })).toBe(false);
  });
});
