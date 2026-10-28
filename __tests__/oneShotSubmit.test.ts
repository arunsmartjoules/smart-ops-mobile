// Site logs and chiller readings now save like tickets: nothing is sent while
// typing; "Complete & sign" writes the phone's copy, queues ONE upload and
// tries it once. These pin that contract, including every network outcome.

type Row = Record<string, any>;

const mockTables: Record<string, Map<string, Row>> = {
  site_logs: new Map(),
  chiller_readings: new Map(),
};
const mockQueue = new Map<string, Row>();
let mockQueueSeq = 0;

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: (col: any, val: any) => ({ col, val }) };
});

jest.mock("../database", () => {
  const table = (name: string) => ({ __name: name, id: { name: "id" } });
  const rowsOf = (name: string, cond: any) =>
    [...mockTables[name]!.values()].filter((r) => r.id === cond.val);
  return {
    db: {
      select: () => ({
        from: (t: any) => ({
          where: (cond: any) => ({ limit: async () => rowsOf(t.__name, cond) }),
        }),
      }),
      update: (t: any) => ({
        set: (fields: Row) => ({
          where: async (cond: any) => {
            for (const r of rowsOf(t.__name, cond)) {
              const next = { ...r, ...fields };
              mockTables[t.__name]!.delete(r.id); // an id change re-keys the row
              mockTables[t.__name]!.set(next.id, next);
            }
          },
        }),
      }),
      insert: (t: any) => ({
        values: async (row: Row) => {
          mockTables[t.__name]!.set(row.id, { ...row });
        },
      }),
    },
    siteLogs: table("site_logs"),
    chillerReadings: table("chiller_readings"),
    offlineQueue: table("offline_queue"),
    logMaster: table("log_master"),
  };
});

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    enqueue: jest.fn(async (item: Row) => {
      const id = `q${++mockQueueSeq}`;
      mockQueue.set(id, item);
      return id;
    }),
    dequeue: jest.fn(async (id: string) => {
      mockQueue.delete(id);
    }),
    getPendingQueueItemsByType: jest.fn(async () => []),
    getQueue: jest.fn(async () => [...mockQueue.entries()].map(([id, item]) => ({ id, ...item }))),
  },
}));

const mockFetch = jest.fn();
jest.mock("../utils/apiHelper", () => ({
  apiFetch: (...args: any[]) => mockFetch(...args),
}));
jest.mock("../services/AttachmentQueueService", () => ({
  AttachmentQueueService: { findByLocalUri: jest.fn(async () => null), queueAttachment: jest.fn() },
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
  replaySiteLogSubmit,
  settleBackgroundPushes,
  submitChillerReading,
  submitSiteLogs,
  type SiteLogSubmitInput,
} from "../services/SiteLogService";

const SIG = "data:image/svg+xml;base64,PHN2Zy8+";
const ok = (data: unknown = {}) => ({ ok: true, status: 200, json: async () => ({ success: true, data }) });
const fail = (status: number, error = "bad") => ({ ok: false, status, json: async () => ({ success: false, error }) });
const offline = () => mockFetch.mockRejectedValue(new Error("Network request failed"));
const lastCall = () => mockFetch.mock.calls[mockFetch.mock.calls.length - 1]!;
const sentBody = (call = lastCall()) => JSON.parse(call[1].body);

beforeEach(() => {
  mockTables.site_logs!.clear();
  mockTables.chiller_readings!.clear();
  mockQueue.clear();
  mockFetch.mockReset();
  mockTables.site_logs!.set("r1", { id: "r1", status: "Inprogress" });
  mockTables.site_logs!.set("r2", { id: "r2", status: "Open" });
});

const shift = (): SiteLogSubmitInput => ({
  siteCode: "S1",
  activityLogType: "Temp RH",
  scheduledDate: "2026-10-27",
  shiftLabel: "3/3",
  startedAt: Date.UTC(2026, 9, 27, 15, 46),
  signature: SIG,
  rows: [
    { id: "r1", status: "Completed", temperature: 21, rh: 50 },
    { id: "r2", status: "Completed", temperature: 22, rh: 51 },
  ],
});

describe("submitSiteLogs", () => {
  it("sends the whole shift in one request", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitSiteLogs(shift());
    expect([mockFetch.mock.calls.length, sentBody().rows.length]).toEqual([1, 2]);
  });

  it("posts to the one-shot submit endpoint", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitSiteLogs(shift());
    expect([lastCall()[0], lastCall()[1].method]).toEqual(["https://api.test/api/site-logs/submit", "POST"]);
  });

  it("reports uploaded when the server takes it", async () => {
    mockFetch.mockResolvedValue(ok());
    expect(await submitSiteLogs(shift())).toEqual({ state: "uploaded", shiftIncomplete: null });
  });

  it("drops the queued copy once uploaded", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitSiteLogs(shift());
    expect(mockQueue.size).toBe(0);
  });

  it("passes on the server's shift-incomplete verdict", async () => {
    mockFetch.mockResolvedValue(ok({ shift_incomplete: { total: 14, filled: 13 } }));
    expect(await submitSiteLogs(shift())).toEqual({ state: "uploaded", shiftIncomplete: { total: 14, filled: 13 } });
  });

  it("completes the rows on the phone even when offline", async () => {
    offline();
    await submitSiteLogs(shift());
    expect([mockTables.site_logs!.get("r1")!.status, mockTables.site_logs!.get("r1")!.signature]).toEqual([
      "Completed",
      SIG,
    ]);
  });

  it("reports queued when offline", async () => {
    offline();
    expect(await submitSiteLogs(shift())).toEqual({ state: "queued" });
  });

  it("keeps exactly one queued upload when offline", async () => {
    offline();
    await submitSiteLogs(shift());
    expect([...mockQueue.values()].map((q) => q.entity_type)).toEqual(["site_log_submit"]);
  });

  it("reports queued on a server error", async () => {
    mockFetch.mockResolvedValue(fail(502));
    expect(await submitSiteLogs(shift())).toEqual({ state: "queued" });
  });

  it("reports the server's reason when it refuses", async () => {
    mockFetch.mockResolvedValue(fail(400, "Validation failed: rows"));
    expect(await submitSiteLogs(shift())).toEqual({ state: "rejected", message: "Validation failed: rows" });
  });

  it("sends an unparseable number as empty, never NaN", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitSiteLogs({ ...shift(), rows: [{ id: "r1", status: "Completed", temperature: NaN, rh: 50 }] });
    expect(sentBody().rows[0].temperature).toBeNull();
  });

  describe("against a backend without the submit endpoint yet", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValueOnce(fail(404)).mockResolvedValue(ok());
    });

    it("reports queued, not an error", async () => {
      expect(await submitSiteLogs(shift())).toEqual({ state: "queued" });
    });

    it("sends each completed row the per-row way instead", async () => {
      await submitSiteLogs(shift());
      await settleBackgroundPushes();
      const puts = mockFetch.mock.calls.filter((c) => c[1]?.method === "PUT").map((c) => c[0]);
      expect(puts.sort()).toEqual(["https://api.test/api/site-logs/r1", "https://api.test/api/site-logs/r2"]);
    });

    it("leaves no submit in the queue to fail forever", async () => {
      await submitSiteLogs(shift());
      await settleBackgroundPushes();
      expect([...mockQueue.values()].some((q) => q.entity_type === "site_log_submit")).toBe(false);
    });
  });

  it("replays a queued submit to the submit endpoint", async () => {
    mockFetch.mockResolvedValue(ok());
    await replaySiteLogSubmit({ site_code: "S1", rows: [{ id: "r1" }] });
    expect(lastCall()[0]).toBe("https://api.test/api/site-logs/submit");
  });

  it("lets SyncEngine retry a replay the server errors on", async () => {
    mockFetch.mockResolvedValue(fail(503));
    await expect(replaySiteLogSubmit({ rows: [{ id: "r1" }] })).rejects.toMatchObject({ statusCode: 503 });
  });

  it("sends the first-entry time as the start", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitSiteLogs(shift());
    expect(sentBody().started_at).toBe("2026-10-27T15:46:00.000Z");
  });
});

describe("submitChillerReading", () => {
  const reading = (extra: Record<string, unknown> = {}) => ({
    siteCode: "S1",
    chillerId: "Chiller-1",
    equipmentId: "AST-1",
    assetName: "Chiller-1",
    assetType: "Chiller",
    operator: "Abhishek",
    readingTime: Date.UTC(2026, 9, 27, 10, 48),
    startedAt: Date.UTC(2026, 9, 27, 10, 49),
    values: { condenser_inlet_temp: 21.1, condenser_outlet_pressure: 0 },
    remarks: null,
    attachment: null,
    signature: SIG,
    ...extra,
  });

  it("creates a new reading in one request with the phone's id", async () => {
    mockFetch.mockResolvedValue(ok());
    const { id } = await submitChillerReading(reading());
    expect([mockFetch.mock.calls.length, lastCall()[1].method, sentBody().id]).toEqual([1, "POST", id]);
  });

  it("saves the new reading on the phone as Completed", async () => {
    offline();
    const { id } = await submitChillerReading(reading());
    expect(mockTables.chiller_readings!.get(id)!.status).toBe("Completed");
  });

  it("keeps a real zero reading", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitChillerReading(reading());
    expect(sentBody().condenser_outlet_pressure).toBe(0);
  });

  it("queues the create when offline", async () => {
    offline();
    const outcome = await submitChillerReading(reading());
    expect([outcome.state, [...mockQueue.values()][0]?.entity_type]).toEqual(["queued", "chiller_reading_create"]);
  });

  it("drops the queued create once uploaded", async () => {
    mockFetch.mockResolvedValue(ok());
    await submitChillerReading(reading());
    expect(mockQueue.size).toBe(0);
  });

  describe("tapping Complete again for the same new reading", () => {
    const NEW_ID = "11111111-2222-4333-8444-555555555555";

    it("sends the same id both times", async () => {
      mockFetch.mockResolvedValue(ok());
      await submitChillerReading(reading({ newId: NEW_ID }));
      await submitChillerReading(reading({ newId: NEW_ID }));
      expect(mockFetch.mock.calls.map((c) => JSON.parse(c[1].body).id)).toEqual([NEW_ID, NEW_ID]);
    });

    it("keeps one row on the phone", async () => {
      offline();
      await submitChillerReading(reading({ newId: NEW_ID }));
      await submitChillerReading(reading({ newId: NEW_ID }));
      expect(mockTables.chiller_readings!.size).toBe(1);
    });

    it("adopts the server's id when it already had this reading", async () => {
      mockFetch.mockResolvedValue(ok({ id: "server-id" }));
      const outcome = await submitChillerReading(reading({ newId: NEW_ID }));
      expect([outcome.id, mockTables.chiller_readings!.has("server-id")]).toEqual(["server-id", true]);
    });
  });

  describe("editing an existing reading", () => {
    beforeEach(() => {
      mockTables.chiller_readings!.set("c1", { id: "c1", status: "Inprogress", assigned_to: "Original Operator" });
    });

    it("updates it in place", async () => {
      mockFetch.mockResolvedValue(ok());
      await submitChillerReading(reading({ existingId: "c1" }));
      expect([lastCall()[0], lastCall()[1].method]).toEqual(["https://api.test/api/chiller-readings/c1", "PUT"]);
    });

    it("never re-sends who took the reading", async () => {
      mockFetch.mockResolvedValue(ok());
      await submitChillerReading(reading({ existingId: "c1" }));
      expect("assigned_to" in sentBody()).toBe(false);
    });

    it("creates it when the server never had it", async () => {
      mockFetch.mockResolvedValueOnce(fail(404)).mockResolvedValueOnce(ok());
      const outcome = await submitChillerReading(reading({ existingId: "c1" }));
      expect([outcome.state, lastCall()[1].method]).toEqual(["uploaded", "POST"]);
    });
  });
});
