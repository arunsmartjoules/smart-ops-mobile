// The phone's site list holds JoulePays sites since the server stopped
// filtering it (spec 0002, AC-52). The phone keeps each site's project_type
// (AC-54) so the screens kept to JouleCool stay JouleCool only, offline too
// (AC-53). A site stored with no project_type (older build) counts as JouleCool.

let mockOnline = false;
let mockSqliteRows: Record<string, unknown>[] = [];
const mockInserted: Record<string, unknown>[] = [];
const mockStorage = new Map<string, string>();
const mockApiFetch = jest.fn();

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: {
    fetch: jest.fn(async () => ({ isConnected: mockOnline, isInternetReachable: mockOnline })),
    addEventListener: jest.fn(() => () => {}),
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(async (k: string) => mockStorage.get(k) ?? null),
    setItem: jest.fn(async (k: string, v: string) => {
      mockStorage.set(k, v);
    }),
    removeItem: jest.fn(async (k: string) => {
      mockStorage.delete(k);
    }),
  },
}));
jest.mock("../utils/apiHelper", () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test", BACKEND_URL: "https://api.test" }));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { activity: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock("../services/CacheManager", () => ({ __esModule: true, cacheManager: {}, default: {} }));
jest.mock("drizzle-orm", () => ({
  and: (...a: unknown[]) => a,
  eq: (...a: unknown[]) => a,
  ne: (...a: unknown[]) => a,
  desc: (...a: unknown[]) => a,
  inArray: (...a: unknown[]) => a,
  notInArray: (...a: unknown[]) => a,
  sql: () => null,
}));
jest.mock("@/database", () => mockDatabase());
jest.mock("../database", () => mockDatabase());

function mockDatabase() {
  const table = () => new Proxy({}, { get: (_t, p) => String(p) });
  return {
    db: {
      select: () => ({ from: () => ({ where: async () => mockSqliteRows }) }),
      delete: () => Object.assign(Promise.resolve(), { where: async () => {} }),
      insert: () => ({
        values: (v: Record<string, unknown>) => {
          mockInserted.push(v);
          return { onConflictDoUpdate: async () => {} };
        },
      }),
    },
    userSites: table(),
    tickets: table(),
    pmInstances: table(),
    siteLogs: table(),
    incidents: table(),
    chillerReadings: table(),
    areas: table(),
    attendanceLogs: table(),
    trendDayContext: table(),
    trendEntries: table(),
  };
}

// Required after the mocks above exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { siteResolver, isJouleCoolSite } = require("../services/SiteResolver") as typeof import("../services/SiteResolver");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AttendanceService = (require("../services/AttendanceService") as typeof import("../services/AttendanceService")).default;

const KIMS = { site_code: "JCL-KIMS", site_name: "KIMS", project_type: "JouleCool" };
const APOLLO = { site_code: "APLINDR", site_name: "Apollo Indore", project_type: "JoulePays" };
const OLD = { site_code: "JCL-OLD", site_name: "Cached by an older build", project_type: null };

const okResponse = (data: unknown[]) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });

beforeEach(() => {
  mockOnline = false;
  mockSqliteRows = [];
  mockInserted.length = 0;
  mockStorage.clear();
  mockApiFetch.mockReset();
});

describe("isJouleCoolSite", () => {
  it.each([
    ["JouleCool", true],
    [null, true],
    [undefined, true],
    ["", true],
    ["JoulePays", false],
  ])("project_type %p gives %p", (projectType, expected) => {
    expect(isJouleCoolSite({ project_type: projectType as string | null | undefined })).toBe(expected);
  });
});

describe("SiteResolver keeps project_type", () => {
  it("from the server list, JoulePays included", async () => {
    mockOnline = true;
    mockApiFetch.mockResolvedValue(okResponse([KIMS, APOLLO]));
    await siteResolver.refresh("u1");
    expect(siteResolver.getSites().map((s) => [s.site_code, s.project_type])).toEqual([
      ["JCL-KIMS", "JouleCool"],
      ["APLINDR", "JoulePays"],
    ]);
  });

  it("in the SQLite user_sites rows it writes", async () => {
    mockOnline = true;
    mockApiFetch.mockResolvedValue(okResponse([KIMS, APOLLO]));
    await siteResolver.refresh("u1");
    expect(mockInserted.map((r) => r.project_type)).toEqual(["JouleCool", "JoulePays"]);
  });

  it("in the AsyncStorage copy it writes", async () => {
    mockOnline = true;
    mockApiFetch.mockResolvedValue(okResponse([APOLLO]));
    await siteResolver.refresh("u1");
    const stored = JSON.parse(mockStorage.get("@user_sites_cache_u1") ?? "[]");
    expect(stored[0].project_type).toBe("JoulePays");
  });

  it("when read back from SQLite offline", async () => {
    mockSqliteRows = [{ id: "u2_APLINDR", ...APOLLO }];
    await siteResolver.initialize("u2");
    expect(siteResolver.getSites()[0]?.project_type).toBe("JoulePays");
  });

  it("as null for an AsyncStorage copy written by an older build", async () => {
    mockStorage.set("@user_sites_cache_u3", JSON.stringify([{ site_code: "JCL-OLD", site_name: "Old" }]));
    await siteResolver.initialize("u3");
    expect(siteResolver.getSites()[0]?.project_type).toBeNull();
  });
});

describe("getUserSites(userId, 'JouleCool') never lists a JoulePays site", () => {
  async function resolverHolds(rows: Record<string, unknown>[]) {
    mockSqliteRows = rows.map((r) => ({ id: `u4_${r.site_code}`, ...r }));
    await siteResolver.initialize("u4");
  }

  it("offline (fast path)", async () => {
    await resolverHolds([KIMS, APOLLO, OLD]);
    const sites = await AttendanceService.getUserSites("u4", "JouleCool");
    expect(sites.map((s) => s.site_code)).toEqual(["JCL-KIMS", "JCL-OLD"]);
  });

  it("offline with only a JoulePays site cached", async () => {
    await resolverHolds([APOLLO]);
    expect(await AttendanceService.getUserSites("u4", "JouleCool")).toEqual([]);
  });

  it("online when both site requests fail (fallback)", async () => {
    await resolverHolds([KIMS, APOLLO, OLD]);
    mockOnline = true;
    mockApiFetch.mockRejectedValue(new Error("Network request failed"));
    const sites = await AttendanceService.getUserSites("u4", "JouleCool");
    expect(sites.map((s) => s.site_code)).toEqual(["JCL-KIMS", "JCL-OLD"]);
  });

  it("online from the server list", async () => {
    mockOnline = true;
    mockApiFetch.mockResolvedValue(okResponse([KIMS, APOLLO]));
    const sites = await AttendanceService.getUserSites("u5", "JouleCool");
    expect(sites.map((s) => s.site_code)).toEqual(["JCL-KIMS"]);
  });
});
