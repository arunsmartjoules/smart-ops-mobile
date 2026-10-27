// The app's SQLite connection must be private. expo-sqlite gives every plain
// openDatabaseSync("smartops.db") the same cached native handle, and when any
// one JS wrapper is garbage-collected it closes that handle for all of them;
// re-opening then returns the same dead handle. A technician's chiller screen
// died this way after visiting Offline & Sync (26 Oct 2026).

type FakeHandle = {
  options: Record<string, unknown> | undefined;
  dead: boolean;
  execSync: (sql: string) => void;
  runSync: () => void;
  getFirstSync: () => null;
  getAllSync: () => unknown[];
  withTransactionSync: (fn: () => void) => void;
};

const mockOpened: FakeHandle[] = [];
let mockFailOpen = false;
// Mirrors expo-sqlite's cache: a plain open (no useNewConnection) reuses the
// cached handle, even if a GC already closed it.
let mockCached: FakeHandle | null = null;

function mockMakeHandle(options?: Record<string, unknown>): FakeHandle {
  const handle: FakeHandle = {
    options,
    dead: false,
    execSync: () => {
      if (handle.dead) throw new Error("NativeDatabase.execSync has been rejected → NullPointerException");
    },
    runSync: () => {},
    getFirstSync: () => null,
    getAllSync: () => [],
    withTransactionSync: (fn) => fn(),
  };
  return handle;
}

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: (_name: string, options?: Record<string, unknown>) => {
    if (mockFailOpen) throw new Error("open failed");
    if (options?.useNewConnection !== true && mockCached) return mockCached;
    const handle = mockMakeHandle(options);
    if (options?.useNewConnection !== true) mockCached = handle;
    mockOpened.push(handle);
    return handle;
  },
}));

jest.mock("drizzle-orm/expo-sqlite", () => ({ drizzle: () => ({}) }));
jest.mock("@/utils/logger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Required (not imported) so the module boots after the mock state above
// exists — imports are hoisted above it.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ensureDatabaseConnection, getSqlite } = require("../database") as typeof import("../database");

beforeEach(() => {
  mockFailOpen = false;
});

test("opens the app database on a private native connection", () => {
  expect(mockOpened[0]?.options).toEqual({ useNewConnection: true });
});

test("recovers onto a fresh handle after the native connection dies", () => {
  const first = getSqlite() as unknown as FakeHandle;
  first.dead = true;
  ensureDatabaseConnection();
  expect(getSqlite()).not.toBe(first);
});

test("reports failure when the database cannot be re-opened", () => {
  (getSqlite() as unknown as FakeHandle).dead = true;
  mockFailOpen = true;
  expect(ensureDatabaseConnection()).toBe(false);
});
