// The trend sheet site list (services/TrendSheetSites) decides whether the Ops
// "Trend Sheet" tab shows, so it is cached per user. Sign-out must leave no
// list behind for the next person on a shared phone (spec 0002, AC-46), and a
// role that cannot enter readings should not ask the server at all.

const mockStorage = new Map<string, string>();
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStorage.set(k, v);
    }),
  },
}));

const mockApiFetch = jest.fn();
jest.mock("../utils/apiHelper", () => ({ apiFetch: (...args: any[]) => mockApiFetch(...args) }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

import {
  getTrendSite,
  refreshTrendSites,
  resetTrendSites,
  setTrendEntryViewable,
} from "../services/TrendSheetSites";

const SITE = { site_code: "APLMAIN", site_name: "Apollo Main", categories: ["electricity"] };
const respond = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

beforeEach(() => {
  resetTrendSites();
  setTrendEntryViewable(null);
  mockStorage.clear();
  mockApiFetch.mockReset();
});

describe("refreshTrendSites", () => {
  it("caches the server's list for the user", async () => {
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: [SITE] }));
    await refreshTrendSites("u1");
    expect(getTrendSite("APLMAIN")?.site_code).toBe("APLMAIN");
  });

  it("does not ask the server when the role is known not to enter readings", async () => {
    setTrendEntryViewable(false);
    await refreshTrendSites("u1");
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("empties a cached list when the role is known not to enter readings", async () => {
    mockStorage.set("trend-sites:v1:u1", JSON.stringify([SITE]));
    setTrendEntryViewable(false);
    const result = await refreshTrendSites("u1");
    expect([result, getTrendSite("APLMAIN")]).toEqual([{ sites: [], fresh: true }, null]);
  });
});

describe("sign-out while the list is being refreshed", () => {
  // The request is held open until the test signs out, then answered.
  async function signOutMidRequest() {
    let answer!: (value: unknown) => void;
    mockApiFetch.mockReturnValueOnce(new Promise((resolve) => (answer = resolve)));
    const pending = refreshTrendSites("u1");
    await new Promise((resolve) => setTimeout(resolve, 0));
    resetTrendSites();
    mockStorage.clear();
    answer(respond(200, { success: true, data: [SITE] }));
    return pending;
  }

  it("does not put the old user's list back in memory", async () => {
    await signOutMidRequest();
    expect(getTrendSite("APLMAIN")).toBeNull();
  });

  it("does not write the old user's list back to storage", async () => {
    await signOutMidRequest();
    expect(mockStorage.size).toBe(0);
  });

  it("reports the answer as not fresh", async () => {
    const result = await signOutMidRequest();
    expect(result.fresh).toBe(false);
  });
});
