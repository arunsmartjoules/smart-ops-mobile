// The SyncEngine "sites" domain writes user_sites too, so it must store each
// site's project_type like SiteResolver does (spec 0002, AC-54). Otherwise a
// sync would overwrite the rows with no project_type and a JoulePays site
// would count as JouleCool on the next offline render.

const mockWrite = jest.fn(async (_domain: string, _records: Record<string, unknown>[]) => {});
const mockApiFetch = jest.fn();

jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  registerTaskAsync: jest.fn(async () => {}),
  unregisterTaskAsync: jest.fn(async () => {}),
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: false })), addEventListener: jest.fn(() => () => {}) },
}));
jest.mock("../utils/apiHelper", () => ({ apiFetch: (...a: unknown[]) => mockApiFetch(...a) }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: { write: (d: string, r: Record<string, unknown>[]) => mockWrite(d, r) },
}));
jest.mock("../services/SiteLogService", () => ({ SiteLogService: {}, replayChillerReadingUpdate: jest.fn() }));
jest.mock("../services/PMService", () => ({ __esModule: true, default: {} }));
jest.mock("../services/AuthTokenManager", () => ({ getValidAuthToken: jest.fn(async () => null) }));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { activity: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock("../database", () => ({ db: {}, attendanceLogs: {}, pmInstances: {} }));
jest.mock("@/utils/ticketSla", () => ({ slaDueToMs: jest.fn() }));

// Required after the mocks above exist.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const syncEngine = (require("../services/SyncEngine") as typeof import("../services/SyncEngine")).default;

type Handler = { domain: string; sync: (userId: string) => Promise<void> };
const sitesHandler = () =>
  (syncEngine as unknown as { domainHandlers: Handler[] }).domainHandlers.find((h) => h.domain === "sites")!;

beforeEach(() => {
  mockWrite.mockClear();
  mockApiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      data: [
        { site_code: "JCL-KIMS", site_name: "KIMS", project_type: "JouleCool" },
        { site_code: "APLINDR", site_name: "Apollo Indore", project_type: "JoulePays" },
        { site_code: "NO-TYPE", site_name: "No type" },
      ],
    }),
  });
});

describe("SyncEngine sites domain", () => {
  it("stores each site's project_type in user_sites", async () => {
    await sitesHandler().sync("u1");
    const records = mockWrite.mock.calls[0]?.[1] ?? [];
    expect(records.map((r) => [r.site_code, r.project_type])).toEqual([
      ["JCL-KIMS", "JouleCool"],
      ["APLINDR", "JoulePays"],
      ["NO-TYPE", null],
    ]);
  });
});
