// While an entry screen is open, background syncs must not start data pulls
// (they block the JS thread — see uiResponsiveDuringSync.test.ts), and must
// catch up once the operator leaves.

const mockGetLastSyncedAt = jest.fn(async () => Date.now()); // every domain "fresh"
const mockGetQueue = jest.fn(async () => []);

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
jest.mock("../utils/apiHelper", () => ({ apiFetch: jest.fn() }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    // Non-empty caches, so no forced full sync skips the TTL check.
    read: jest.fn(async () => [{ site_code: "S1" }]),
    getQueue: () => mockGetQueue(),
    getLastSyncedAt: (...a: any[]) => mockGetLastSyncedAt(...(a as [])),
    getQueueCount: jest.fn(async () => 0),
    getDeadLetterCount: jest.fn(async () => 0),
    stampSyncedAt: jest.fn(async () => {}),
  },
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

import syncEngine from "../services/SyncEngine";

/** Let a fire-and-forget catch-up sync run to completion. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeAll(async () => {
  await syncEngine.initialize("u1");
});

afterAll(async () => {
  await syncEngine.cleanup();
});

beforeEach(() => {
  mockGetLastSyncedAt.mockClear();
});

// A release starts its catch-up sync asynchronously; let it finish so it
// can't leak into the next test.
afterEach(async () => {
  await settle();
  await settle();
});

describe("SyncEngine.holdPulls", () => {
  it("starts pulls when no entry screen is open", async () => {
    await syncEngine.syncNow();
    expect(mockGetLastSyncedAt).toHaveBeenCalled();
  });

  it("starts no pull while an entry screen is open", async () => {
    const release = syncEngine.holdPulls("test");
    await syncEngine.syncNow();
    release();
    expect(mockGetLastSyncedAt.mock.calls.length).toBe(0);
  });

  it("still flushes queued saves while held", async () => {
    mockGetQueue.mockClear();
    const release = syncEngine.holdPulls("test");
    await syncEngine.syncNow();
    release();
    expect(mockGetQueue).toHaveBeenCalled();
  });

  it("catches up on pulls when the screen closes", async () => {
    const release = syncEngine.holdPulls("test");
    await syncEngine.syncNow();
    mockGetLastSyncedAt.mockClear();
    release();
    await settle();
    await settle();
    expect(mockGetLastSyncedAt).toHaveBeenCalled();
  });

  it("keeps holding while another entry screen is still open", async () => {
    const releaseA = syncEngine.holdPulls("a");
    const releaseB = syncEngine.holdPulls("b");
    releaseA();
    await settle();
    await syncEngine.syncNow();
    releaseB();
    expect(mockGetLastSyncedAt.mock.calls.length).toBe(0);
  });
});
