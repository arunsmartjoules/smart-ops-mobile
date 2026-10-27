// A log completed on the phone must reach the server as Completed even when
// stale queued auto-saves ("Inprogress", no signature) are replayed after it,
// and a pull must not overwrite the phone's completion with the server's
// older status ("logs show Inprogress but the operator completed them",
// Oct 2026).

type Row = Record<string, any>;

const mockTables: Record<string, Map<string, Row>> = {
  site_logs: new Map(),
  chiller_readings: new Map(),
};

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: (col: any, val: any) => ({ op: "eq", col: col.name, val }),
    inArray: (col: any, vals: any[]) => ({ op: "in", col: col.name, vals }),
    and: (...conds: any[]) => ({ op: "and", conds }),
  };
});

jest.mock("../database", () => {
  const column = (name: string) => ({ name });
  const table = (name: string) => ({
    __name: name,
    id: column("id"),
    status: column("status"),
    signature: column("signature"),
  });
  const test = (row: Row, cond: any): boolean => {
    if (!cond) return true;
    if (cond.op === "and") return cond.conds.every((c: any) => test(row, c));
    if (cond.op === "in") return cond.vals.includes(row[cond.col]);
    return row[cond.col] === cond.val;
  };
  const matching = (name: string, cond: any) => [...mockTables[name]!.values()].filter((r) => test(r, cond));
  const result = (rows: Row[]) => Object.assign(Promise.resolve(rows), { limit: async () => rows });
  const fakeDb = {
    select: () => ({
      from: (t: any) => ({ where: (cond: any) => result(matching(t.__name, cond)) }),
    }),
    update: (t: any) => ({
      set: (fields: Row) => ({
        where: async (cond: any) => {
          for (const r of matching(t.__name, cond)) mockTables[t.__name]!.set(r.id, { ...r, ...fields });
        },
      }),
    }),
    insert: (t: any) => ({
      values: (rows: Row[]) => ({
        onConflictDoUpdate: async () => {
          for (const r of rows) mockTables[t.__name]!.set(r.id, { ...mockTables[t.__name]!.get(r.id), ...r });
        },
      }),
    }),
  };
  return {
    db: fakeDb,
    siteLogs: table("site_logs"),
    chillerReadings: table("chiller_readings"),
    offlineQueue: table("offline_queue"),
    logMaster: table("log_master"),
  };
});

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    enqueue: jest.fn(async () => "q-1"),
    dequeue: jest.fn(async () => {}),
    getQueue: jest.fn(async () => []),
    getPendingQueueItemsByType: jest.fn(async () => []),
    // A real overwrite, so a pull that ignored the phone's completion would show.
    write: jest.fn(async (domain: string, rows: Row[]) => {
      for (const r of rows) mockTables[domain]!.set(r.id, { ...mockTables[domain]!.get(r.id), ...r });
    }),
  },
}));
jest.mock("../services/AttachmentQueueService", () => ({
  AttachmentQueueService: {
    queueAttachment: jest.fn(async () => "file:///files/attachments/copy.jpg"),
    findByLocalUri: jest.fn(async () => null),
  },
}));

const mockApiFetch = jest.fn();
jest.mock("../utils/apiHelper", () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { activity: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock("../utils/authEvents", () => ({ authEvents: { emitUnauthorized: jest.fn() } }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("@react-native-community/netinfo", () => ({}));
jest.mock("../services/SiteConfigService", () => ({ getLogVariants: jest.fn(() => []) }));
jest.mock("../services/AttendanceService", () => ({ getISTDateString: jest.fn(() => "2026-10-27") }));

import {
  SiteLogService,
  findLocallyCompletedIds,
  replaySiteLogUpdate,
  resendLocalCompletions,
  settleBackgroundPushes,
} from "../services/SiteLogService";

const LOG_ID = "log-1";
const SIGNATURE = "data:image/svg+xml;base64,PHN2Zy8+";
const staleAutoSave = { id: LOG_ID, temperature: 22, rh: 50, status: "Inprogress", signature: null };

const ok = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}), text: async () => "" });
const sentBody = (call = 0) => JSON.parse(mockApiFetch.mock.calls[call][1].body);

beforeEach(() => {
  mockTables.site_logs!.clear();
  mockTables.site_logs!.set(LOG_ID, {
    id: LOG_ID,
    temperature: 22,
    rh: 50,
    status: "Completed",
    signature: SIGNATURE,
  });
  mockApiFetch.mockReset().mockImplementation(ok);
});

describe("replaying a queued site-log update", () => {
  it("sends the phone's current status, not the stale queued one", async () => {
    await replaySiteLogUpdate(staleAutoSave);
    expect(sentBody().status).toBe("Completed");
  });

  it("sends the phone's signature instead of the queued null", async () => {
    await replaySiteLogUpdate(staleAutoSave);
    expect(sentBody().signature).toBe(SIGNATURE);
  });

  it("never sends a phone-local signature path", async () => {
    mockTables.site_logs!.set(LOG_ID, { id: LOG_ID, status: "Completed", signature: "file:///files/sig.png" });
    await replaySiteLogUpdate(staleAutoSave);
    expect(sentBody()).not.toHaveProperty("signature");
  });

  it("never sends an empty signature when the phone has no row", async () => {
    mockTables.site_logs!.clear();
    await replaySiteLogUpdate(staleAutoSave);
    expect(sentBody()).not.toHaveProperty("signature");
  });
});

describe("auto-save", () => {
  it("does not send a null signature", async () => {
    await SiteLogService.saveBulkSiteLogs([{ ...staleAutoSave, site_code: "S1", log_name: "Temp RH" }]);
    await settleBackgroundPushes();
    expect(sentBody()).not.toHaveProperty("signature");
  });
});

describe("pull self-heal", () => {
  it("finds logs the phone completed and signed", async () => {
    const ids = await findLocallyCompletedIds([LOG_ID]);
    expect(ids.has(LOG_ID)).toBe(true);
  });

  it("ignores logs the phone marked Completed without a signature", async () => {
    mockTables.site_logs!.set(LOG_ID, { id: LOG_ID, status: "Completed", signature: null });
    const ids = await findLocallyCompletedIds([LOG_ID]);
    expect(ids.size).toBe(0);
  });

  it("re-sends the phone's completion", async () => {
    await resendLocalCompletions([LOG_ID]);
    await settleBackgroundPushes();
    expect(sentBody().status).toBe("Completed");
  });

  it("keeps the phone's completion when the server still says Inprogress", async () => {
    mockApiFetch.mockImplementation((url: string) =>
      url.includes("/api/site-logs/site/")
        ? Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({ data: [{ id: LOG_ID, site_code: "S1", log_name: "Temp RH", status: "Inprogress" }] }),
          })
        : ok(),
    );
    await SiteLogService.pullSiteLogs("S1", { logName: "Temp RH" });
    await settleBackgroundPushes();
    expect(mockTables.site_logs!.get(LOG_ID)!.status).toBe("Completed");
  });
});
