/**
 * Fix Verification Property Tests - Task 9
 *
 * These tests verify all 6 correctness properties on FIXED code.
 * All tests MUST PASS on fixed code.
 *
 * Properties verified:
 *   P1 - Offline sites fallback: getUserSites returns cached sites when offline
 *   P2 - Online path unchanged: getUserSites online returns network data and warms cache
 *   P3 - Foreground pull not throttled: app_foreground bypasses 12h threshold
 *   P4 - Background threshold preserved: background still respects 12h threshold
 *   P5 - Reference data cached: after pull phase, areas and categories are non-empty
 *   P6 - Push phase unchanged: push always runs before pull, behavior unchanged
 *
 * Validates: Requirements 2.1, 2.3, 2.5, 2.6, 3.1, 3.2, 3.4, 3.6, 3.7
 */

// ---------------------------------------------------------------------------
// Top-level mocks
// ---------------------------------------------------------------------------

jest.mock("expo-background-fetch", () => ({ registerTaskAsync: jest.fn() }));
jest.mock("expo-task-manager", () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
}));
jest.mock("@react-native-community/netinfo", () => ({
  addEventListener: jest.fn(() => jest.fn()),
  fetch: jest.fn().mockResolvedValue({ isConnected: true, isInternetReachable: true }),
}));
jest.mock("react-native", () => ({
  AppState: { addEventListener: jest.fn(() => ({ remove: jest.fn() })) },
  Platform: { OS: "ios" },
  NativeModules: {},
}));
jest.mock("../services/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn().mockResolvedValue({
        data: {
          session: { access_token: "test-token", user: { id: "user-123" } },
        },
      }),
    },
  },
}));
jest.mock("@react-native-async-storage/async-storage", () => ({
  getItem: jest.fn().mockResolvedValue(null),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
  getAllKeys: jest.fn().mockResolvedValue([]),
  multiGet: jest.fn().mockResolvedValue([]),
  multiRemove: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../utils/logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  flushActivityQueue: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../constants/api", () => ({ API_BASE_URL: "http://test-api" }));
jest.mock("../utils/syncPMStorage", () => ({
  updatePMLastSynced: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../utils/apiHelper", () => ({
  fetchWithTimeout: jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ data: [], success: true }),
  }),
  syncWithRetry: jest.fn((fn: () => Promise<any>) => fn()),
}));
jest.mock("../utils/syncTicketStorage", () => ({
  syncPendingTicketUpdates: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
  pullRecentTickets: jest.fn().mockResolvedValue({ pulled: 0 }),
  updateTicketLastSynced: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../utils/syncSiteLogStorage", () => ({
  syncPendingSiteLogs: jest.fn().mockResolvedValue({ synced: 0, failed: 0 }),
  pullRecentSiteLogs: jest.fn().mockResolvedValue({ pulled: 0 }),
  pullRecentChillerReadings: jest.fn().mockResolvedValue({ pulled: 0 }),
}));
jest.mock("../services/PMService", () => ({
  __esModule: true,
  default: {
    pullFromServer: jest.fn().mockResolvedValue(undefined),
    pushPendingResponses: jest.fn().mockResolvedValue(undefined),
    pushPendingInstances: jest.fn().mockResolvedValue(undefined),
    pullAllChecklistItems: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("../services/AttendanceService", () => ({
  __esModule: true,
  default: {
    getAttendanceHistory: jest.fn().mockResolvedValue({ data: [], pagination: {} }),
    getUserSites: jest.fn().mockResolvedValue([{ site_code: "SITE-001" }]),
  },
}));
jest.mock("../services/StorageService", () => ({
  StorageService: { uploadFile: jest.fn().mockResolvedValue(null) },
}));
jest.mock("../services/SyncManager", () => ({
  syncManager: { triggerSync: jest.fn().mockResolvedValue(undefined) },
}));

const makeCollection = () => ({
  query: jest.fn(() => ({
    fetch: jest.fn().mockResolvedValue([]),
    fetchCount: jest.fn().mockResolvedValue(0),
  })),
  find: jest.fn().mockResolvedValue(null),
  create: jest.fn().mockResolvedValue({}),
  prepareCreate: jest.fn().mockReturnValue({}),
});

jest.mock("../database", () => ({
  database: {
    write: jest.fn((fn: () => Promise<any>) => fn()),
    batch: jest.fn().mockResolvedValue(undefined),
    get: jest.fn(() => makeCollection()),
  },
  ticketCollection: makeCollection(),
  ticketUpdateCollection: makeCollection(),
  siteLogCollection: makeCollection(),
  chillerReadingCollection: makeCollection(),
  pmInstanceCollection: makeCollection(),
  pmChecklistItemCollection: makeCollection(),
  pmChecklistMasterCollection: makeCollection(),
  pmResponseCollection: makeCollection(),
}));

// ---------------------------------------------------------------------------
// fast-check
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fc = require("fast-check") as typeof import("fast-check");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMockDefaults() {
  const AsyncStorage = jest.requireMock("@react-native-async-storage/async-storage");
  AsyncStorage.getItem.mockImplementation((key: string) => {
    if (key === "last_site_user-123") return Promise.resolve("SITE-001");
    return Promise.resolve(null);
  });
  AsyncStorage.setItem.mockResolvedValue(undefined);
  AsyncStorage.getAllKeys.mockResolvedValue([]);
  AsyncStorage.multiGet.mockResolvedValue([]);
  AsyncStorage.multiRemove.mockResolvedValue(undefined);

  const { supabase } = jest.requireMock("../services/supabase");
  supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: "test-token", user: { id: "user-123" } } },
  });

  const apiHelper = jest.requireMock("../utils/apiHelper");
  apiHelper.fetchWithTimeout.mockResolvedValue({
    ok: true,
    status: 200,
    json: jest.fn().mockResolvedValue({ data: [], success: true }),
  });
  apiHelper.syncWithRetry.mockImplementation((fn: () => Promise<any>) => fn());

  const siteLogStorage = jest.requireMock("../utils/syncSiteLogStorage");
  siteLogStorage.syncPendingSiteLogs.mockResolvedValue({ synced: 0, failed: 0 });
  siteLogStorage.pullRecentSiteLogs.mockResolvedValue({ pulled: 0 });
  siteLogStorage.pullRecentChillerReadings.mockResolvedValue({ pulled: 0 });

  const ticketStorage = jest.requireMock("../utils/syncTicketStorage");
  ticketStorage.syncPendingTicketUpdates.mockResolvedValue({ synced: 0, failed: 0 });
  ticketStorage.pullRecentTickets.mockResolvedValue({ pulled: 0 });
  ticketStorage.updateTicketLastSynced.mockResolvedValue(undefined);

  const PMService = jest.requireMock("../services/PMService").default;
  PMService.pullFromServer.mockResolvedValue(undefined);
  PMService.pushPendingResponses.mockResolvedValue(undefined);
  PMService.pushPendingInstances.mockResolvedValue(undefined);
  PMService.pullAllChecklistItems.mockResolvedValue(undefined);

  const AttendanceService = jest.requireMock("../services/AttendanceService").default;
  AttendanceService.getAttendanceHistory.mockResolvedValue({ data: [], pagination: {} });
  AttendanceService.getUserSites.mockResolvedValue([{ site_code: "SITE-001" }]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fix Verification Properties", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  // -------------------------------------------------------------------------
  // Property 1: Offline sites fallback
  // -------------------------------------------------------------------------
  /**
   * For any userId and any non-empty mockSites array:
   * if cacheSites(userId, mockSites) is called and then getUserSites(userId)
   * is called offline, the result equals mockSites.
   *
   * Validates Fix 2. Validates: Requirements 2.1, 2.3
   */
  it("P1: getUserSites offline returns cached sites for any userId and mockSites", async () => {
    const realAttendanceService = jest.requireActual(
      "../services/AttendanceService",
    ) as typeof import("../services/AttendanceService");

    const realOfflineCache = jest.requireActual(
      "../utils/offlineDataCache",
    ) as typeof import("../utils/offlineDataCache");

    const AsyncStorage = jest.requireMock("@react-native-async-storage/async-storage");
    const { fetchWithTimeout } = jest.requireMock("../utils/apiHelper");

    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 20 }),
        fc.array(
          fc.record({
            site_code: fc.string({ minLength: 1, maxLength: 10 }),
            name: fc.string({ minLength: 1, maxLength: 30 }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (userId, mockSites) => {
          jest.clearAllMocks();
          resetMockDefaults();

          // In-memory store
          const store: Record<string, string> = {};
          AsyncStorage.getItem.mockImplementation((key: string) =>
            Promise.resolve(store[key] ?? null),
          );
          AsyncStorage.setItem.mockImplementation((key: string, value: string) => {
            store[key] = value;
            return Promise.resolve();
          });

          // Pre-populate cache
          await realOfflineCache.cacheSites(userId, mockSites);

          // Mock network to fail (offline)
          fetchWithTimeout.mockRejectedValue(new Error("Network unavailable"));

          const result = await realAttendanceService.default.getUserSites(userId, "JouleCool");

          expect(result.length).toBeGreaterThan(0);
          expect(result[0].site_code).toBe(mockSites[0].site_code);
        },
      ),
      { numRuns: 15 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 2: Online path unchanged + cache warmed
  // -------------------------------------------------------------------------
  /**
   * For any mockSites array returned by the network:
   * getUserSites online returns the same array, and getCachedSites afterward
   * returns a matching array (cache warmed as side effect).
   *
   * Validates Fix 2 preservation. Validates: Requirements 3.1, 3.2
   */
  it("P2: getUserSites online returns network data and warms cache", async () => {
    const realAttendanceService = jest.requireActual(
      "../services/AttendanceService",
    ) as typeof import("../services/AttendanceService");

    const realOfflineCache = jest.requireActual(
      "../utils/offlineDataCache",
    ) as typeof import("../utils/offlineDataCache");

    const AsyncStorage = jest.requireMock("@react-native-async-storage/async-storage");
    const { fetchWithTimeout } = jest.requireMock("../utils/apiHelper");

    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            site_code: fc.string({ minLength: 1, maxLength: 10 }),
            site_name: fc.string({ minLength: 1, maxLength: 30 }),
            project_type: fc.constant("JouleCool"),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (mockSites) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const store: Record<string, string> = {};
          AsyncStorage.getItem.mockImplementation((key: string) =>
            Promise.resolve(store[key] ?? null),
          );
          AsyncStorage.setItem.mockImplementation((key: string, value: string) => {
            store[key] = value;
            return Promise.resolve();
          });

          // Mock network to return sites (online)
          fetchWithTimeout.mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({ success: true, data: mockSites }),
          });

          const result = await realAttendanceService.default.getUserSites("user-123", "JouleCool");

          // Network data returned
          expect(result.length).toBeGreaterThan(0);
          expect(result[0].site_code).toBe(mockSites[0].site_code);

          // Cache warmed as side effect
          await new Promise((r) => setTimeout(r, 20));
          const cached = await realOfflineCache.getCachedSites("user-123");
          expect(cached.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 10 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 3: Foreground pull not throttled
  // -------------------------------------------------------------------------
  /**
   * For any app_foreground trigger, the pull phase executes regardless of
   * lastHistoryPullTime.
   *
   * Validates Fix 4. Validates: Requirements 2.1, 2.5
   */
  it("P3: app_foreground trigger always executes pull phase", async () => {
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const ticketStorage = jest.requireMock("../utils/syncTicketStorage");
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

    await fc.assert(
      fc.asyncProperty(
        // Any lastHistoryPullTime within the 12h window (previously would block pull)
        fc.integer({ min: 0, max: TWELVE_HOURS_MS - 1 }),
        async (pullAgoMs) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;
          syncManager.lastHistoryPullTime = Date.now() - pullAgoMs;
          syncManager.lastSyncTime = 0;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          await syncManager.triggerSync("app_foreground");

          // Pull phase ran
          expect(ticketStorage.pullRecentTickets).toHaveBeenCalled();
        },
      ),
      { numRuns: 15 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 4: Background threshold preserved
  // -------------------------------------------------------------------------
  /**
   * For background trigger with lastHistoryPullTime within 12h, pull is skipped.
   *
   * Validates Fix 4 preservation. Validates: Requirements 3.7
   */
  it("P4: background trigger still respects 12h pull threshold", async () => {
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const ticketStorage = jest.requireMock("../utils/syncTicketStorage");
    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: TWELVE_HOURS_MS - 1 }),
        async (pullAgoMs) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;
          syncManager.lastHistoryPullTime = Date.now() - pullAgoMs;
          syncManager.lastSyncTime = 0;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          await syncManager.triggerSync("background");

          // Pull phase skipped
          expect(ticketStorage.pullRecentTickets).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 15 },
    );
  });

  // -------------------------------------------------------------------------
  // Property 5: Reference data cached during pull phase
  // -------------------------------------------------------------------------
  /**
   * After a completed pull phase, getCachedAreas(siteCode) and
   * getCachedCategories() return non-empty arrays.
   *
   * Validates Fix 5. Validates: Requirements 2.6
   */
  it("P5: pull phase caches areas per site and categories globally", async () => {
    const realOfflineCache = jest.requireActual(
      "../utils/offlineDataCache",
    ) as typeof import("../utils/offlineDataCache");

    const AsyncStorage = jest.requireMock("@react-native-async-storage/async-storage");
    const { fetchWithTimeout } = jest.requireMock("../utils/apiHelper");

    // Pre-seed last_site_ key so resolveSiteCodes has a fallback when getUserSites returns []
    const store: Record<string, string> = {
      "last_site_user-123": "SITE-001",
    };
    AsyncStorage.getItem.mockImplementation((key: string) =>
      Promise.resolve(store[key] ?? null),
    );
    AsyncStorage.setItem.mockImplementation((key: string, value: string) => {
      store[key] = value;
      return Promise.resolve();
    });

    const mockAreas = [{ id: "area-1", name: "Area 1", site_code: "SITE-001" }];
    const mockCategories = [{ id: "cat-1", name: "Category 1" }];

    // Mock fetchWithTimeout to return areas for /api/assets and categories for /api/complaint-categories
    fetchWithTimeout.mockImplementation((url: string) => {
      if (url.includes("/api/assets")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockAreas }),
        });
      }
      if (url.includes("/api/complaint-categories")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: mockCategories }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ success: true, data: [] }),
      });
    });

    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const syncManager = SyncManagerModule.syncManager as any;
    syncManager.lastHistoryPullTime = 0;
    syncManager.lastSyncTime = 0;
    syncManager.isSyncing = false;
    syncManager.currentSyncPromise = null;

    await syncManager.triggerSync("manual");

    // Areas cached per site
    const cachedAreas = await realOfflineCache.getCachedAreas("SITE-001");
    expect(cachedAreas.length).toBeGreaterThan(0);
    expect(cachedAreas[0].name).toBe("Area 1");

    // Categories cached globally
    const cachedCategories = await realOfflineCache.getCachedCategories();
    expect(cachedCategories.length).toBeGreaterThan(0);
    expect(cachedCategories[0].name).toBe("Category 1");
  });

  // -------------------------------------------------------------------------
  // Property 6: Push phase unchanged — always runs before pull
  // -------------------------------------------------------------------------
  /**
   * For any sync trigger, push phase executes before pull phase and its
   * behavior is unchanged.
   *
   * Validates Fix preservation. Validates: Requirements 3.1, 3.4
   */
  it("P6: push phase always executes before pull phase for any trigger", async () => {
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const ticketStorage = jest.requireMock("../utils/syncTicketStorage");

    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom("manual", "network_reconnect", "background", "app_foreground"),
        async (reason) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;
          syncManager.lastSyncTime = 0;
          syncManager.lastHistoryPullTime = 0;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          const callOrder: string[] = [];
          ticketStorage.syncPendingTicketUpdates.mockImplementation(async () => {
            callOrder.push("push");
            return { synced: 0, failed: 0 };
          });
          ticketStorage.pullRecentTickets.mockImplementation(async () => {
            callOrder.push("pull");
            return { pulled: 0 };
          });

          await syncManager.triggerSync(reason);

          expect(callOrder).toContain("push");
          expect(callOrder).toContain("pull");
          expect(callOrder.indexOf("push")).toBeLessThan(callOrder.indexOf("pull"));
        },
      ),
      { numRuns: 10 },
    );
  });
});
