// Regression: sign-out "stuck" for a long time even with nothing to push.
// signOut() → syncEngine.cleanup() awaited the in-flight sync, which is a full
// pull of every domain (~8 sequential requests per site). cleanup() must now
// stop that pull at the next site boundary instead of waiting it out.

const SITE_COUNT = 10;
let mockApiCalls = 0;
let mockReleaseFirstRequest: (() => void) | null = null;

jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(), addEventListener: jest.fn() },
}));
jest.mock("expo-task-manager", () => ({ defineTask: jest.fn() }));
jest.mock("expo-background-task", () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));
jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn() },
  Alert: { alert: jest.fn() },
}));
jest.mock("../constants/api", () => ({ API_BASE_URL: "http://test" }));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    activity: jest.fn(),
  },
}));
jest.mock("../services/AuthTokenManager", () => ({
  getValidAuthToken: jest.fn(),
}));
jest.mock("../database", () => ({
  db: {},
  attendanceLogs: {},
  pmInstances: {},
}));
jest.mock("@/utils/ticketSla", () => ({ slaDueToMs: () => null }));

jest.mock("../utils/apiHelper", () => ({
  apiFetch: jest.fn(async () => {
    mockApiCalls += 1;
    // Hold the first request open so cleanup() is called mid-pull.
    if (mockApiCalls === 1) {
      await new Promise<void>((resolve) => {
        mockReleaseFirstRequest = resolve;
      });
    }
    return { ok: true, status: 200, json: async () => ({ data: [] }) };
  }),
}));

jest.mock("../services/SiteLogService", () => ({
  SiteLogService: {
    pullSiteLogs: jest.fn(async () => {
      mockApiCalls += 1;
    }),
    pullChillerReadings: jest.fn(async () => {
      mockApiCalls += 1;
    }),
  },
}));
jest.mock("../services/PMService", () => ({
  __esModule: true,
  default: {
    fetchFromAPI: jest.fn(async () => {
      mockApiCalls += 1;
    }),
  },
}));

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    read: jest.fn(async (domain: string) =>
      domain === "sites"
        ? Array.from({ length: SITE_COUNT }, (_, i) => ({
            site_code: `SITE-${i}`,
          }))
        : [],
    ),
    write: jest.fn(async () => {}),
    stampSyncedAt: jest.fn(async () => {}),
    getLastSyncedAt: jest.fn(async () => null),
    getQueue: jest.fn(async () => []),
    getQueueCount: jest.fn(async () => 0),
    getDeadLetterCount: jest.fn(async () => 0),
  },
}));

import { syncEngine } from "../services/SyncEngine";

test("cleanup stops an in-flight pull after the current request", async () => {
  // Skip the "sites" domain so the first held request is a per-site pull.
  (syncEngine as any).userId = "user-1";
  (syncEngine as any).domainHandlers.shift();

  const sync = syncEngine.syncNow();
  while (!mockReleaseFirstRequest) {
    await new Promise((r) => setImmediate(r));
  }

  const cleanup = syncEngine.cleanup();
  mockReleaseFirstRequest();
  await cleanup;
  await sync;

  // Uncancelled, this pull makes ~8 requests per site (≈80 for 10 sites).
  expect(mockApiCalls).toBe(1);
});
