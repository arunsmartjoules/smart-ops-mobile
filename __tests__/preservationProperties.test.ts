/**
 * Preservation Property Tests - Task 2
 *
 * Property 2: Preservation - Non-Sync Paths and Push Phase Unchanged
 *
 * These tests encode the BASELINE BEHAVIOR of code paths that must NOT change
 * as a result of the offline-cache fix. All tests PASS on both unfixed and
 * fixed code — they are regression guards, not bug detectors.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8
 *
 * Properties tested:
 *   P2-A  syncPendingTicketUpdates makes a PUT to /api/complaints/{id} for each pending update
 *   P2-B  triggerSync("app_foreground") is skipped when called within 30s cooldown
 *   P2-C  triggerSync("app_foreground") skips the pull phase when within 12h historyPullThreshold
 *   P2-D  pushPendingResponses and pushPendingInstances are called before the pull phase
 *   P2-E  checkIn and checkOut are never invoked during performSync
 */

// ---------------------------------------------------------------------------
// Top-level mocks — same patterns as bugConditionExploration.test.ts
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
    checkIn: jest.fn(),
    checkOut: jest.fn(),
  },
}));
jest.mock("../services/StorageService", () => ({
  StorageService: { uploadFile: jest.fn().mockResolvedValue(null) },
}));
jest.mock("../services/SyncManager", () => ({
  syncManager: { triggerSync: jest.fn().mockResolvedValue(undefined) },
}));

// Minimal database collection stub (SQLite/Drizzle)
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
// fast-check — use require to stay in CJS mode (jest-expo preset)
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-var-requires
const fc = require("fast-check") as typeof import("fast-check");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reset all mock return values after jest.clearAllMocks() */
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
    data: {
      session: { access_token: "test-token", user: { id: "user-123" } },
    },
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
  AttendanceService.checkIn.mockReset();
  AttendanceService.checkOut.mockReset();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Preservation Properties - Non-Sync Paths and Push Phase Unchanged", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMockDefaults();
  });

  // -------------------------------------------------------------------------
  // P2-A: syncPendingTicketUpdates makes a PUT to /api/complaints/{id}
  // -------------------------------------------------------------------------
  /**
   * For any set of pending ticket updates, syncPendingTicketUpdates produces
   * the same API calls (PUT /api/complaints/{serverId}) and isSynced flag
   * updates as before the fix.
   *
   * This tests the REAL syncPendingTicketUpdates implementation directly.
   * The fix does NOT touch syncTicketStorage.ts's push logic.
   *
   * Validates: Requirements 3.7, 3.8
   */
  it("P2-A: syncPendingTicketUpdates makes PUT to /api/complaints/{id} for each pending update", async () => {
    /**
     * **Validates: Requirements 3.7, 3.8**
     */
    const realModule = jest.requireActual(
      "../utils/syncTicketStorage",
    ) as typeof import("../utils/syncTicketStorage");

    const { fetchWithTimeout, syncWithRetry } = jest.requireMock("../utils/apiHelper");

    // Build a fake ticketUpdateCollection with pending updates
    const { ticketUpdateCollection, ticketCollection, database } =
      jest.requireMock("../database");

    await fc.assert(
      fc.asyncProperty(
        // Generate 1–5 pending ticket updates with distinct server IDs
        fc.array(
          fc.record({
            serverId: fc.uuid(),
            updateData: fc.record({
              status: fc.constantFrom("Open", "Closed", "Resolved", "Inprogress"),
              remarks: fc.string({ minLength: 0, maxLength: 50 }),
            }),
          }),
          { minLength: 1, maxLength: 5 },
        ),
        async (pendingUpdates) => {
          jest.clearAllMocks();
          resetMockDefaults();

          // Wire up the mock collections to return our generated pending updates
          const fakeUpdates = pendingUpdates.map((u, i) => ({
            id: `update-${i}`,
            ticketId: `ticket-${i}`,
            isSynced: false,
            updateData: JSON.stringify(u.updateData),
            update: jest.fn().mockImplementation((fn: any) => {
              fn({ isSynced: true });
              return Promise.resolve();
            }),
          }));

          const fakeTickets = pendingUpdates.map((u, i) => ({
            id: `ticket-${i}`,
            serverId: u.serverId,
          }));

          ticketUpdateCollection.query.mockReturnValue({
            fetch: jest.fn().mockResolvedValue(fakeUpdates),
          });
          ticketCollection.find.mockImplementation((id: string) => {
            const ticket = fakeTickets.find((t) => t.id === id);
            return Promise.resolve(ticket ?? null);
          });

          // Mock fetchWithTimeout to return ok for all calls
          fetchWithTimeout.mockResolvedValue({
            ok: true,
            status: 200,
            json: jest.fn().mockResolvedValue({ success: true }),
          });
          syncWithRetry.mockImplementation((fn: () => Promise<any>) => fn());

          database.write.mockImplementation((fn: () => Promise<any>) => fn());

          await realModule.syncPendingTicketUpdates("test-token", "http://test-api");

          // Each pending update must have triggered a PUT to /api/complaints/{serverId}
          expect(fetchWithTimeout).toHaveBeenCalledTimes(pendingUpdates.length);

          for (let i = 0; i < pendingUpdates.length; i++) {
            const callArgs = fetchWithTimeout.mock.calls[i];
            const url: string = callArgs[0];
            const options: RequestInit = callArgs[1];

            expect(url).toBe(
              `http://test-api/api/complaints/${pendingUpdates[i].serverId}`,
            );
            expect(options.method).toBe("PUT");
            expect(options.headers).toMatchObject({
              "Content-Type": "application/json",
              Authorization: "Bearer test-token",
            });

            // Body must contain the update data
            const body = JSON.parse(options.body as string);
            expect(body).toMatchObject(pendingUpdates[i].updateData);
          }
        },
      ),
      { numRuns: 20 },
    );
  });

  // -------------------------------------------------------------------------
  // P2-B: triggerSync("app_foreground") is skipped within 30s cooldown
  // -------------------------------------------------------------------------
  /**
   * For any app_foreground trigger within the 30-second cooldown window,
   * sync is skipped (performSync is not called).
   *
   * Validates: Requirements 3.6
   */
  it("P2-B: triggerSync(app_foreground) is skipped when called within 30s cooldown", async () => {
    /**
     * **Validates: Requirements 3.6**
     */
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const ticketStorage = jest.requireMock("../utils/syncTicketStorage");

    await fc.assert(
      fc.asyncProperty(
        // Generate a time offset in ms that is strictly less than 30 seconds
        fc.integer({ min: 0, max: 29_999 }),
        async (offsetMs) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;

          // Simulate a recent sync: set lastSyncTime to (now - offsetMs)
          // so the cooldown is still active
          const now = Date.now();
          syncManager.lastSyncTime = now - offsetMs;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          await syncManager.triggerSync("app_foreground");

          // syncPendingTicketUpdates is called inside performSync's push phase.
          // If sync was skipped, it must NOT have been called.
          expect(ticketStorage.syncPendingTicketUpdates).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 30 },
    );
  });

  // -------------------------------------------------------------------------
  // P2-C: triggerSync("background") skips pull phase within 12h threshold
  // -------------------------------------------------------------------------
  /**
   * For any background trigger where lastHistoryPullTime is within the
   * 12-hour historyPullThreshold, the pull phase is skipped (pullRecentTickets
   * is not called). The fix adds app_foreground to the bypass set but must NOT
   * change the background trigger behavior.
   *
   * Validates: Requirements 3.7
   */
  it("P2-C: triggerSync(background) skips pull phase when within 12h historyPullThreshold", async () => {
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const ticketStorage = jest.requireMock("../utils/syncTicketStorage");

    const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

    await fc.assert(
      fc.asyncProperty(
        // Generate a lastHistoryPullTime offset that is within the 12h threshold
        fc.integer({ min: 1, max: TWELVE_HOURS_MS - 1 }),
        async (pullAgoMs) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;
          const now = Date.now();

          // background bypasses the 30s cooldown
          syncManager.lastSyncTime = 0;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          // Set lastHistoryPullTime to within the 12h threshold
          syncManager.lastHistoryPullTime = now - pullAgoMs;

          await syncManager.triggerSync("background");

          // Pull phase was skipped — pullRecentTickets must NOT have been called
          expect(ticketStorage.pullRecentTickets).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  });

  // -------------------------------------------------------------------------
  // P2-D: Push phase runs before pull phase
  // -------------------------------------------------------------------------
  /**
   * The push phase (syncPendingTicketUpdates, syncPendingSiteLogs) always
   * runs before the pull phase (pullRecentTickets), regardless of sync reason.
   *
   * NOTE: PMService.pushPendingResponses / pushPendingInstances are called via
   * dynamic import inside SyncManager and cannot be intercepted by jest.mock()
   * in CJS mode. We verify push-before-pull ordering using the statically-
   * imported push/pull helpers (syncPendingTicketUpdates → pullRecentTickets),
   * which are representative of the full push-then-pull contract.
   *
   * Validates: Requirements 3.7
   */
  it("P2-D: push phase (ticket push) always runs before the pull phase (ticket pull)", async () => {
    /**
     * **Validates: Requirements 3.7**
     */
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const ticketStorage = jest.requireMock("../utils/syncTicketStorage");

    await fc.assert(
      fc.asyncProperty(
        // Vary the sync reason — all bypass-cooldown reasons should run both phases
        fc.constantFrom("manual", "network_reconnect", "background"),
        async (reason) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;

          // Ensure pull phase runs (bypass threshold)
          syncManager.lastSyncTime = 0;
          syncManager.lastHistoryPullTime = 0;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          // Track call order using statically-imported push/pull helpers
          const callOrder: string[] = [];

          ticketStorage.syncPendingTicketUpdates.mockImplementation(async () => {
            callOrder.push("syncPendingTicketUpdates");
            return { synced: 0, failed: 0 };
          });
          ticketStorage.pullRecentTickets.mockImplementation(async () => {
            callOrder.push("pullRecentTickets");
            return { pulled: 0 };
          });

          await syncManager.triggerSync(reason);

          // Both push and pull must have been called
          expect(callOrder).toContain("syncPendingTicketUpdates");
          expect(callOrder).toContain("pullRecentTickets");

          // Push must come before pull
          const pushIdx = callOrder.indexOf("syncPendingTicketUpdates");
          const pullIdx = callOrder.indexOf("pullRecentTickets");
          expect(pushIdx).toBeLessThan(pullIdx);
        },
      ),
      { numRuns: 10 },
    );
  });

  // -------------------------------------------------------------------------
  // P2-E: checkIn and checkOut are never called during performSync
  // -------------------------------------------------------------------------
  /**
   * AttendanceService.checkIn and checkOut are never invoked during
   * performSync, regardless of sync reason or state.
   *
   * Validates: Requirements 3.5
   */
  it("P2-E: checkIn and checkOut are never called during performSync", async () => {
    /**
     * **Validates: Requirements 3.5**
     */
    const SyncManagerModule = jest.requireActual(
      "../services/SyncManager",
    ) as typeof import("../services/SyncManager");

    const AttendanceService = jest.requireMock("../services/AttendanceService").default;

    await fc.assert(
      fc.asyncProperty(
        // Vary sync reason and whether pull phase runs
        fc.record({
          reason: fc.constantFrom("manual", "network_reconnect", "background", "app_foreground"),
          // Whether the 12h threshold has been exceeded (pull phase runs or not)
          pullPhaseActive: fc.boolean(),
        }),
        async ({ reason, pullPhaseActive }) => {
          jest.clearAllMocks();
          resetMockDefaults();

          const syncManager = SyncManagerModule.syncManager as any;
          const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

          // Bypass 30s cooldown
          syncManager.lastSyncTime = 0;
          syncManager.isSyncing = false;
          syncManager.currentSyncPromise = null;

          if (pullPhaseActive) {
            // Force pull phase to run
            syncManager.lastHistoryPullTime = 0;
          } else {
            // Keep pull phase gated (only matters for app_foreground)
            syncManager.lastHistoryPullTime = Date.now() - (TWELVE_HOURS_MS / 2);
          }

          // Ensure checkIn/checkOut are fresh mocks that record calls
          AttendanceService.checkIn = jest.fn();
          AttendanceService.checkOut = jest.fn();

          await syncManager.triggerSync(reason);

          // checkIn and checkOut must NEVER be called during sync
          expect(AttendanceService.checkIn).not.toHaveBeenCalled();
          expect(AttendanceService.checkOut).not.toHaveBeenCalled();
        },
      ),
      { numRuns: 20 },
    );
  });
});
