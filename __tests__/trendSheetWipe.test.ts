// Devices are shared. Logging out must remove every trend sheet row from the
// phone, and losing a site must remove that site's rows (spec 0002, AC-46).
// Both lists are written by hand, so a new table is easy to forget.

const mockSql: string[] = [];

jest.mock("expo-sqlite", () => ({
  openDatabaseSync: () => ({
    execSync: (sql: string) => {
      mockSql.push(sql);
    },
    runSync: () => {},
    getFirstSync: () => null,
    getAllSync: () => [],
    withTransactionSync: (fn: () => void) => fn(),
  }),
}));

const mockDeletes: { table: string; where: any }[] = [];
jest.mock("drizzle-orm/expo-sqlite", () => ({
  drizzle: () => ({
    delete: (table: any) => {
      const call = { table: mockTableName(table), where: undefined as any };
      mockDeletes.push(call);
      // Awaitable with or without a `.where(...)`.
      return Object.assign(Promise.resolve(), {
        where: async (cond: any) => {
          call.where = cond;
        },
      });
    },
  }),
}));

// The purge's conditions become plain row predicates, so a test can ask which
// rows a delete would remove instead of how the SQL is spelled.
jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    notInArray: (col: any, vals: any[]) => (row: any) => !vals.includes(row[col.name]),
    ne: (col: any, val: any) => (row: any) => row[col.name] !== val,
    and: (...preds: ((row: any) => boolean)[]) => (row: any) => preds.every((p) => p(row)),
  };
});

jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: { getItem: jest.fn(async () => null), setItem: jest.fn(async () => {}), removeItem: jest.fn(async () => {}) },
}));
jest.mock("@react-native-community/netinfo", () => ({
  __esModule: true,
  default: { fetch: jest.fn(async () => ({ isConnected: false })), addEventListener: jest.fn(() => () => {}) },
}));
jest.mock("../utils/apiHelper", () => ({ apiFetch: jest.fn() }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("@/utils/logger", () => ({
  __esModule: true,
  default: { activity: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

/** The SQL name of a Drizzle table object. */
function mockTableName(table: any): string {
  const { getTableName } = jest.requireActual("drizzle-orm");
  return getTableName(table);
}

// Required (not imported) so the modules boot after the mock state above exists.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { clearDatabase } = require("../database") as typeof import("../database");
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { siteResolver } = require("../services/SiteResolver") as typeof import("../services/SiteResolver");

const purge = (sites: { site_code: string; project_type?: string | null }[]) =>
  (siteResolver as unknown as { _purgeUnauthorizedSiteData(s: unknown[]): Promise<void> })._purgeUnauthorizedSiteData(sites);

/** Site codes of the rows a purge removed from `table` (no `where` = every row). */
function removedFrom(table: string, rows: Record<string, unknown>[]): unknown[] {
  const call = mockDeletes.find((d) => d.table === table);
  if (!call) return [];
  const where: (row: unknown) => boolean = call.where ?? (() => true);
  return rows.filter(where).map((r) => r.site_code);
}

const entry = (site_code: string, sync_status: string) => ({ site_code, sync_status });

beforeEach(() => {
  mockSql.length = 0;
  mockDeletes.length = 0;
});

describe("the two trend sheet tables", () => {
  it("are created when the database opens", () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../database").ensureDatabaseConnection();
    });
    const created = mockSql.join("\n");
    expect([
      created.includes("CREATE TABLE IF NOT EXISTS trend_day_context"),
      created.includes("CREATE TABLE IF NOT EXISTS trend_entries"),
    ]).toEqual([true, true]);
  });

  it("adds project_type to user_sites on a phone that already has the table (AC-54)", () => {
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require("../database").ensureDatabaseConnection();
    });
    expect(mockSql).toContain("ALTER TABLE user_sites ADD COLUMN project_type TEXT");
  });
});

describe("logging out", () => {
  it("empties the cached trend sheet days", async () => {
    await clearDatabase();
    expect(mockSql).toContain("DELETE FROM trend_day_context");
  });

  it("empties the trend sheet entries saved on this phone", async () => {
    await clearDatabase();
    expect(mockSql).toContain("DELETE FROM trend_entries");
  });
});

describe("losing access to a site", () => {
  it("removes that site's cached trend sheet days", async () => {
    await purge([{ site_code: "KEPT" }]);
    expect(removedFrom("trend_day_context", [{ site_code: "KEPT" }, { site_code: "GONE" }])).toEqual(["GONE"]);
  });

  it("removes that site's sent trend sheet entries", async () => {
    await purge([{ site_code: "KEPT" }]);
    expect(removedFrom("trend_entries", [entry("KEPT", "synced"), entry("GONE", "synced")])).toEqual(["GONE"]);
  });

  it("removes that site's refused entries", async () => {
    await purge([{ site_code: "KEPT" }]);
    expect(removedFrom("trend_entries", [entry("GONE", "failed")])).toEqual(["GONE"]);
  });

  it("removes every cached trend sheet day when no site is left", async () => {
    await purge([]);
    expect(removedFrom("trend_day_context", [{ site_code: "A" }, { site_code: "B" }])).toEqual(["A", "B"]);
  });

  it("removes every sent entry when no site is left", async () => {
    await purge([]);
    expect(removedFrom("trend_entries", [entry("A", "synced"), entry("B", "replaced")])).toEqual(["A", "B"]);
  });
});

// AC-52, AC-54: the list now carries JoulePays sites, and unsent readings
// outlive the purge until the server answers them.
describe("a JoulePays site in the site list", () => {
  const sites = [
    { site_code: "JCL-KIMS", project_type: "JouleCool" },
    { site_code: "APLINDR", project_type: "JoulePays" },
  ];

  it("keeps that site's cached trend sheet days", async () => {
    await purge(sites);
    expect(removedFrom("trend_day_context", [{ site_code: "APLINDR" }])).toEqual([]);
  });

  it("keeps that site's trend sheet entries", async () => {
    await purge(sites);
    expect(removedFrom("trend_entries", [entry("APLINDR", "synced")])).toEqual([]);
  });

  it("keeps a pending entry for a site that was removed", async () => {
    await purge(sites);
    expect(removedFrom("trend_entries", [entry("REMOVED", "pending")])).toEqual([]);
  });

  it("removes a sent entry for a site that was removed", async () => {
    await purge(sites);
    expect(removedFrom("trend_entries", [entry("REMOVED", "synced"), entry("REMOVED", "pending")])).toEqual(["REMOVED"]);
  });

  it("keeps a pending entry even when no site is left", async () => {
    await purge([]);
    expect(removedFrom("trend_entries", [entry("APLINDR", "pending")])).toEqual([]);
  });
});
