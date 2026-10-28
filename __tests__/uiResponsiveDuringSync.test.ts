// The SQLite driver runs on the JS thread, so a big data pull used to block
// every tap until it finished ("Complete & sign does nothing", Abhishek, KIMS
// Nashik, 27 Oct — no completion trace could even start). These check that
// writes give the thread back, that pulls stay away from entry screens, and
// that a blocked thread gets reported.

const mockEvents: string[] = [];
const mockActivity = jest.fn();

jest.mock("@/utils/logger", () => ({
  __esModule: true,
  default: {
    activity: (...a: any[]) => mockActivity(...a),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("expo-file-system/legacy", () => ({}));
jest.mock("@/database", () => {
  const table = (name: string) => ({ __name: name, id: { name: "id" } });
  return {
    // Records each chunk write, like the real driver does it synchronously.
    db: {
      insert: () => ({
        values: (rows: any[]) => ({
          onConflictDoUpdate: () => {
            mockEvents.push(`write:${rows.length}`);
            return Promise.resolve();
          },
        }),
      }),
    },
    tickets: table("tickets"),
    incidents: table("incidents"),
    siteLogs: table("site_logs"),
    chillerReadings: table("chiller_readings"),
    pmInstances: table("pm_instances"),
    pmChecklistItems: table("pm_checklist_items"),
    pmResponses: table("pm_responses"),
    attendanceLogs: table("attendance_logs"),
    userSites: table("user_sites"),
    areas: table("areas"),
    categories: table("categories"),
    logMaster: table("log_master"),
    offlineQueue: table("offline_queue"),
    syncMeta: table("sync_meta"),
    ensureDatabaseConnection: () => {},
    ensureSiteLogsSchema: () => {},
  };
});

import cacheManager from "../services/CacheManager";
import { startJsStallMonitor } from "../utils/jsStallMonitor";

beforeEach(() => {
  mockEvents.length = 0;
  mockActivity.mockClear();
});

describe("CacheManager.write", () => {
  const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `r${i}`, name: "x" }));

  it("lets a pending tap run between chunks of a large write", async () => {
    setTimeout(() => mockEvents.push("tap"), 0);
    await cacheManager.write("pm_instances", rows(120), { stampSync: false });
    expect(mockEvents).toEqual(["write:50", "tap", "write:50", "write:20"]);
  });

  it("writes every row", async () => {
    await cacheManager.write("pm_instances", rows(120), { stampSync: false });
    expect(mockEvents).toEqual(["write:50", "write:50", "write:20"]);
  });
});

/** An app that stays in the foreground for the whole test. */
const activeApp = { currentState: "active" as const, addEventListener: () => ({ remove: () => {} }) } as any;

describe("startJsStallMonitor", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  /** Fakes a clock that jumps forward when the thread is "blocked". */
  function clock() {
    let t = 0;
    return { now: () => t, tick: (ms: number) => { t += ms; jest.advanceTimersByTime(1_000); } };
  }

  it("stays quiet while the thread keeps up", () => {
    const c = clock();
    const stop = startJsStallMonitor(() => ({}), c.now, activeApp);
    for (let i = 0; i < 10; i += 1) c.tick(1_000);
    stop();
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it("reports a block longer than 3s with its context", () => {
    const c = clock();
    const stop = startJsStallMonitor(() => ({ route: "/chiller", sync_step: "pull:pm_instances" }), c.now, activeApp);
    c.tick(9_000);
    stop();
    expect(mockActivity.mock.calls[0][3]).toMatchObject({
      blocked_ms: 8_000,
      route: "/chiller",
      sync_step: "pull:pm_instances",
    });
  });

  it("ignores time the app spent in the background", () => {
    const c = clock();
    let listener: ((s: string) => void) | null = null;
    const appState = {
      currentState: "active" as const,
      addEventListener: (_: string, fn: (s: string) => void) => {
        listener = fn;
        return { remove: () => {} };
      },
    };
    const stop = startJsStallMonitor(() => ({}), c.now, appState as any);
    listener!("background");
    c.tick(600_000); // phone locked for 10 minutes
    stop();
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it("still reports a real block after returning to the foreground", () => {
    const c = clock();
    let listener: ((s: string) => void) | null = null;
    const appState = {
      currentState: "active" as const,
      addEventListener: (_: string, fn: (s: string) => void) => {
        listener = fn;
        return { remove: () => {} };
      },
    };
    const stop = startJsStallMonitor(() => ({}), c.now, appState as any);
    listener!("background");
    c.tick(600_000);
    listener!("active");
    c.tick(1_000);
    c.tick(9_000); // a real 8s block while active
    stop();
    expect(mockActivity.mock.calls[0]?.[3]).toMatchObject({ blocked_ms: 8_000 });
  });

  it("reports at most once a minute", () => {
    const c = clock();
    const stop = startJsStallMonitor(() => ({}), c.now, activeApp);
    c.tick(5_000);
    c.tick(5_000);
    c.tick(5_000);
    stop();
    expect(mockActivity).toHaveBeenCalledTimes(1);
  });
});
