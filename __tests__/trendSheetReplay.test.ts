// A trend sheet save is stored on the phone, queued, and sent later. These
// tests cover what happens to the phone's entry and its cached day when the
// server answers: applied, replaced by a newer save, refused, outdated app,
// block changed shape, server down. They also cover the save itself and the
// pull (services/TrendSheetService).

type Row = Record<string, any>;

const mockTables: Record<string, Map<string, Row>> = {
  trend_day_context: new Map(),
  trend_entries: new Map(),
};

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: (col: any, val: any) => ({ op: "eq", col: col.name, val }),
    lt: (col: any, val: any) => ({ op: "lt", col: col.name, val }),
    lte: (col: any, val: any) => ({ op: "lte", col: col.name, val }),
    gt: (col: any, val: any) => ({ op: "gt", col: col.name, val }),
    inArray: (col: any, vals: any[]) => ({ op: "in", col: col.name, vals }),
    and: (...conds: any[]) => ({ op: "and", conds }),
    or: (...conds: any[]) => ({ op: "or", conds }),
  };
});

jest.mock("../database", () => {
  const column = (name: string) => ({ name });
  const table = (name: string, columns: string[], key: (r: Row) => string) => ({
    __name: name,
    __key: key,
    ...Object.fromEntries(columns.map((c) => [c, column(c)])),
  });
  const test = (row: Row, cond: any): boolean => {
    if (!cond) return true;
    if (cond.op === "and") return cond.conds.every((c: any) => test(row, c));
    if (cond.op === "or") return cond.conds.some((c: any) => test(row, c));
    if (cond.op === "in") return cond.vals.includes(row[cond.col]);
    if (cond.op === "lt") return row[cond.col] < cond.val;
    if (cond.op === "lte") return row[cond.col] <= cond.val;
    if (cond.op === "gt") return row[cond.col] > cond.val;
    return row[cond.col] === cond.val;
  };
  const matching = (t: any, cond: any) => [...mockTables[t.__name]!.values()].filter((r) => test(r, cond));
  const result = (rows: Row[]) => Object.assign(Promise.resolve(rows), { limit: async (n: number) => rows.slice(0, n) });
  const fakeDb = {
    select: () => ({ from: (t: any) => ({ where: (cond: any) => result(matching(t, cond)) }) }),
    update: (t: any) => ({
      set: (fields: Row) => ({
        where: async (cond: any) => {
          for (const r of matching(t, cond)) mockTables[t.__name]!.set(t.__key(r), { ...r, ...fields });
        },
      }),
    }),
    insert: (t: any) => ({
      values: (row: Row) => ({
        onConflictDoUpdate: async ({ set, setWhere }: { set: Row; setWhere?: any }) => {
          const key = t.__key(row);
          const existing = mockTables[t.__name]!.get(key);
          // SQLite's ON CONFLICT ... DO UPDATE ... WHERE: a failing condition leaves the row.
          if (existing && setWhere && !test(existing, setWhere)) return;
          mockTables[t.__name]!.set(key, existing ? { ...existing, ...set } : row);
        },
      }),
    }),
    delete: (t: any) => ({
      where: async (cond: any) => {
        for (const r of matching(t, cond)) mockTables[t.__name]!.delete(t.__key(r));
      },
    }),
  };
  return {
    db: fakeDb,
    ensureDatabaseConnection: () => true,
    trendDayContext: table(
      "trend_day_context",
      ["site_code", "entry_date", "payload", "fetched_at"],
      (r) => `${r.site_code}|${r.entry_date}`,
    ),
    trendEntries: table(
      "trend_entries",
      ["id", "site_code", "entry_date", "category", "payload", "client_saved_at", "sync_status", "last_error", "updated_at"],
      (r) => r.id,
    ),
  };
});

const mockQueue: { id: string; payload: Row }[] = [];
const mockEnqueue = jest.fn(async (item: { payload: Row }): Promise<string | null> => {
  const id = `q-${mockQueue.length + 1}`;
  mockQueue.push({ id, payload: item.payload });
  return id;
});
jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    enqueue: (item: any) => mockEnqueue(item),
    dequeue: jest.fn(async (id: string) => {
      const i = mockQueue.findIndex((q) => q.id === id);
      if (i >= 0) mockQueue.splice(i, 1);
    }),
    getPendingQueueItemsByType: jest.fn(async () => [...mockQueue]),
  },
}));

let mockSelectedSite: string | null = "APLMAIN";
jest.mock("../services/SiteSelection", () => ({ getSelectedSiteCode: jest.fn(async () => mockSelectedSite) }));
jest.mock("../services/SiteResolver", () => ({
  __esModule: true,
  default: { getSites: () => [{ site_code: "APLMAIN" }, { site_code: "COOL1" }] },
}));
let mockTrendSites: string[] = ["APLMAIN"];
let mockSiteListFresh = true;
jest.mock("../services/TrendSheetSites", () => ({
  refreshTrendSites: jest.fn(async () => ({ sites: [], fresh: mockSiteListFresh })),
  trendSiteCodes: () => mockTrendSites,
}));

const mockApiFetch = jest.fn();
jest.mock("../utils/apiHelper", () => ({ apiFetch: (...args: any[]) => mockApiFetch(...args) }));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { activity: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));
jest.mock("../utils/istDate", () => ({ istTodayString: () => "2026-11-15" }));

import TrendSheetService, {
  TREND_SAVE_GIVEN_UP,
  isTrendCalcOutdated,
  type TrendQueuePayload,
} from "../services/TrendSheetService";
import type { TrendDayContext, TrendSaveBody } from "../utils/trendSheet";

const SITE = "APLMAIN";
const DAY = "2026-11-15";
const ENTRY_ID = `${SITE}|${DAY}|electricity`;

/** The day as the server sends it: one Electricity block, nothing entered yet. */
function context(extra: Partial<TrendDayContext> = {}): TrendDayContext {
  return {
    site_code: SITE,
    date: DAY,
    is_sunday: true,
    cycle_month: "2026-11",
    status: "missing",
    categories_expected: 1,
    categories_entered: 0,
    editable: true,
    calc_version: 1,
    categories: [
      {
        category: "electricity",
        label: "Electricity",
        unit: "kWh",
        kind: "meter",
        entered: false,
        entered_by_name: null,
        entered_at: null,
        pending_inputs: [],
        baseline: 1000,
        baseline_kind: "weekday",
        target_pct: 20,
        target: 200,
        consumption: null,
        adjustment: 0,
        saving: null,
        saving_pct: null,
        not_used: false,
        provisional: false,
        saving_is_manual: false,
        manual_allowed: false,
        blocks: [
          {
            block_id: "m1",
            name: "Main",
            entry_mode: "readings",
            typed: null,
            opening_reading: 100,
            opening_date: "2026-11-14",
            final_reading: null,
            mf: 10,
            add_adjustment: 0,
            deduct_adjustment: 0,
            carried_from: "2026-11-14",
            quantity: null,
            litres: null,
            mismatch: null,
          },
        ],
      },
    ],
    ...extra,
  };
}

/** The same day after the server stored a save by `by`. */
function storedDay(by: string): TrendDayContext {
  const day = context({ status: "complete", categories_entered: 1 });
  day.categories[0] = { ...day.categories[0], entered: true, entered_by_name: by, consumption: 800, saving: 200, saving_pct: 20 };
  return day;
}

const respond = (status: number, json: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => json });

const entryRow = () => mockTables.trend_entries.get(ENTRY_ID);
const cachedDay = (): TrendDayContext | null => {
  const row = mockTables.trend_day_context.get(`${SITE}|${DAY}`);
  return row ? JSON.parse(row.payload) : null;
};

async function saveElectricity(final = 180): Promise<TrendQueuePayload> {
  await TrendSheetService.saveCategory(SITE, DAY, "electricity", {
    blocks: [{ block_id: "m1", final_reading: final, opening_source: "carried" }],
  });
  return mockQueue[mockQueue.length - 1]!.payload as TrendQueuePayload;
}

const caught = async (p: Promise<unknown>): Promise<any> => p.then(() => null, (e) => e);

beforeEach(() => {
  mockTables.trend_day_context.clear();
  mockTables.trend_entries.clear();
  mockQueue.length = 0;
  mockApiFetch.mockReset();
  mockEnqueue.mockClear();
  mockSelectedSite = SITE;
  mockTrendSites = [SITE];
  mockSiteListFresh = true;
});

describe("saveCategory", () => {
  it("stores the entry on the phone as pending", async () => {
    await saveElectricity();
    expect(entryRow()?.sync_status).toBe("pending");
  });

  it("stamps the save with this build's calculation version", async () => {
    const payload = await saveElectricity();
    expect(payload.body.calc_version).toBe(1);
  });

  it("queues exactly one item for the server", async () => {
    await saveElectricity();
    expect(mockQueue).toHaveLength(1);
  });

  it("replaces the earlier queued save when the category is saved again", async () => {
    await saveElectricity(180);
    await saveElectricity(190);
    expect(mockQueue.map((q) => (q.payload.body as TrendSaveBody).blocks[0].final_reading)).toEqual([190]);
  });

  it("refuses to look saved when the entry could not be queued", async () => {
    mockEnqueue.mockResolvedValueOnce(null);
    const err = await caught(saveElectricity());
    expect([err instanceof Error, entryRow()]).toEqual([true, undefined]);
  });
});

describe("replaySave: the server stored the save", () => {
  it("replaces the cached day with the server's", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: { applied: true, day: storedDay("Asha") } }));
    await TrendSheetService.replaySave(payload);
    expect(cachedDay()?.categories[0].saving).toBe(200);
  });

  it("marks the entry synced", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: { applied: true, day: storedDay("Asha") } }));
    await TrendSheetService.replaySave(payload);
    expect(entryRow()?.sync_status).toBe("synced");
  });

  it("sends the readings to the category's own route", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: { applied: true, day: storedDay("Asha") } }));
    await TrendSheetService.replaySave(payload);
    expect(mockApiFetch.mock.calls[0]?.[0]).toBe(
      "https://api.test/api/trend-sheet/entry/APLMAIN/days/2026-11-15/categories/electricity",
    );
  });
});

describe("replaySave: a newer save was already in place", () => {
  it("marks the entry replaced and names who saved", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: { applied: false, day: storedDay("Ravi Kumar") } }));
    await TrendSheetService.replaySave(payload);
    expect([entryRow()?.sync_status, entryRow()?.last_error]).toEqual([
      "replaced",
      "Replaced by a newer save by Ravi Kumar",
    ]);
  });

  it("shows the server's figures, not the phone's", async () => {
    const payload = await saveElectricity(150);
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: { applied: false, day: storedDay("Ravi Kumar") } }));
    await TrendSheetService.replaySave(payload);
    const view = await TrendSheetService.viewFromCache(SITE, DAY);
    expect(view?.categories[0].saving).toBe(200);
  });
});

describe("replaySave: the server refused the save", () => {
  const refusal = respond(400, {
    success: false,
    error: 'The closing reading for block "Main" (90) is below its opening reading (100).',
    code: "READING_BELOW_OPENING",
  });

  it("marks the entry failed with the server's reason", async () => {
    const payload = await saveElectricity(90);
    mockApiFetch.mockResolvedValueOnce(refusal);
    await caught(TrendSheetService.replaySave(payload));
    expect([entryRow()?.sync_status, entryRow()?.last_error]).toEqual([
      "failed",
      'The closing reading for block "Main" (90) is below its opening reading (100).',
    ]);
  });

  it("resolves, so the queue drops a save the server will never take", async () => {
    const payload = await saveElectricity(90);
    mockApiFetch.mockResolvedValueOnce(refusal);
    const err = await caught(TrendSheetService.replaySave(payload));
    expect(err).toBeNull();
  });

  it("resolves on a lost permission too, so it never blocks sign-out", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(403, { success: false, error: "No access", code: "MODULE_FORBIDDEN" }));
    const err = await caught(TrendSheetService.replaySave(payload));
    expect([err, entryRow()?.sync_status]).toEqual([null, "failed"]);
  });

  it("leaves a newer save of the same category alone", async () => {
    const older = await saveElectricity(90);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveElectricity(180);
    mockApiFetch.mockResolvedValueOnce(refusal);
    await caught(TrendSheetService.replaySave(older));
    expect(entryRow()?.sync_status).toBe("pending");
  });
});

describe("replaySave: the block changed shape while the save was queued", () => {
  const changed = () =>
    respond(400, {
      success: false,
      error: 'Block "Main" now takes units, not readings.',
      code: "ENTRY_MODE_CHANGED",
      details: { day: context({ calc_version: 1, categories_expected: 7 }) },
    });

  it("replaces the cached day with the one in the answer", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(changed());
    await caught(TrendSheetService.replaySave(payload));
    expect(cachedDay()?.categories_expected).toBe(7);
  });

  it("marks the entry failed with a reason a technician can act on", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(changed());
    await caught(TrendSheetService.replaySave(payload));
    expect(entryRow()?.last_error).toBe("This block now takes units");
  });

  it("keeps what was typed in the entry", async () => {
    const payload = await saveElectricity(180);
    mockApiFetch.mockResolvedValueOnce(changed());
    await caught(TrendSheetService.replaySave(payload));
    expect(JSON.parse(entryRow()?.payload).blocks[0].final_reading).toBe(180);
  });
});

describe("replaySave: nothing wrong with the readings", () => {
  it("keeps the entry pending when the server errors", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(503, { success: false, error: "Unavailable" }));
    const err = await caught(TrendSheetService.replaySave(payload));
    expect([entryRow()?.sync_status, err?.statusCode]).toEqual(["pending", 503]);
  });

  it("keeps the entry pending when a 200 answer carries no day", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true }));
    const err = await caught(TrendSheetService.replaySave(payload));
    expect([entryRow()?.sync_status, err?.statusCode]).toEqual(["pending", 502]);
  });

  it("keeps the entry pending when the session has expired", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(401, { success: false, error: "Unauthorized" }));
    await caught(TrendSheetService.replaySave(payload));
    expect(entryRow()?.sync_status).toBe("pending");
  });

  // The queue counts any thrown 4xx towards dead lettering the item, which
  // would strand the entry as "Not sent yet" with nothing left to send it.
  it.each([401, 408, 426, 429])("throws a %i without a status code, so the queue burns no retries", async (status) => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(respond(status, { success: false, error: "Try later" }));
    const err = await caught(TrendSheetService.replaySave(payload));
    expect([err instanceof Error, err?.statusCode]).toEqual([true, undefined]);
  });

  it("keeps the entry pending when there is no network", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockRejectedValueOnce(new Error("Network request failed"));
    const err = await caught(TrendSheetService.replaySave(payload));
    expect([entryRow()?.sync_status, err?.statusCode]).toEqual(["pending", undefined]);
  });
});

describe("viewFromCache", () => {
  it("is empty for a day that was never loaded", async () => {
    expect(await TrendSheetService.viewFromCache(SITE, DAY)).toBeNull();
  });

  it("previews an unsent entry over the cached day", async () => {
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: context() }));
    await TrendSheetService.fetchDay(SITE, DAY);
    await saveElectricity(180);
    const view = await TrendSheetService.viewFromCache(SITE, DAY);
    expect([view?.categories[0].saving, view?.categories[0].sync]).toEqual([200, "pending"]);
  });

  it("opens tomorrow with today's unsent closing reading (AC-44)", async () => {
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: context({ date: "2026-11-16" }) }));
    await TrendSheetService.fetchDay(SITE, "2026-11-16");
    await saveElectricity(180);
    const view = await TrendSheetService.viewFromCache(SITE, "2026-11-16");
    expect(view?.categories[0].blocks[0].opening_reading).toBe(180);
  });
});

describe("giveUpSave: the queue dead lettered the save", () => {
  it("marks the entry failed, so it is not left as 'Not sent yet'", async () => {
    const payload = await saveElectricity();
    await TrendSheetService.giveUpSave(payload);
    expect([entryRow()?.sync_status, entryRow()?.last_error]).toEqual(["failed", TREND_SAVE_GIVEN_UP]);
  });

  it("leaves a newer save of the same category pending", async () => {
    const older = await saveElectricity(90);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveElectricity(180);
    await TrendSheetService.giveUpSave(older);
    expect(entryRow()?.sync_status).toBe("pending");
  });
});

describe("fetchDay: a late answer never replaces a newer cached day", () => {
  const cachedStamp = (stamp: number) => {
    mockTables.trend_day_context.set(`${SITE}|${DAY}`, {
      site_code: SITE,
      entry_date: DAY,
      payload: JSON.stringify(storedDay("Asha")),
      fetched_at: stamp,
    });
  };
  let now: jest.SpyInstance;
  afterEach(() => now?.mockRestore());

  it("keeps a save's answer that arrived after the fetch was sent", async () => {
    cachedStamp(5_000);
    now = jest.spyOn(Date, "now").mockReturnValueOnce(4_000).mockReturnValue(6_000);
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: context() }));
    await TrendSheetService.fetchDay(SITE, DAY);
    expect(cachedDay()?.categories[0].entered_by_name).toBe("Asha");
  });

  it("returns the newer cached day, not the late answer", async () => {
    cachedStamp(5_000);
    now = jest.spyOn(Date, "now").mockReturnValueOnce(4_000).mockReturnValue(6_000);
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: context() }));
    const result = await TrendSheetService.fetchDay(SITE, DAY);
    expect(result.ok && result.data.categories[0].entered_by_name).toBe("Asha");
  });

  it("stores a fetch sent after the cached day was written", async () => {
    cachedStamp(5_000);
    now = jest.spyOn(Date, "now").mockReturnValue(6_000);
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: context() }));
    await TrendSheetService.fetchDay(SITE, DAY);
    expect(cachedDay()?.categories[0].entered_by_name).toBeNull();
  });

  it("is not blocked by a stamp from a clock that was later set back", async () => {
    cachedStamp(9_000_000);
    now = jest.spyOn(Date, "now").mockReturnValueOnce(4_000).mockReturnValue(6_000);
    mockApiFetch.mockResolvedValueOnce(respond(200, { success: true, data: context() }));
    await TrendSheetService.fetchDay(SITE, DAY);
    expect(cachedDay()?.categories[0].entered_by_name).toBeNull();
  });
});

describe("prefetchSite: the selected site switched to a trend sheet site", () => {
  const dayOf = (url: string) => url.split("/days/")[1];

  it("caches yesterday, today and tomorrow for that site", async () => {
    mockApiFetch.mockImplementation(async (url: string) =>
      respond(200, { success: true, data: context({ site_code: "APLTWO", date: dayOf(url) }) }),
    );
    await TrendSheetService.prefetchSite("APLTWO", () => {});
    expect([...mockTables.trend_day_context.keys()].sort()).toEqual([
      "APLTWO|2026-11-14",
      "APLTWO|2026-11-15",
      "APLTWO|2026-11-16",
    ]);
  });

  it("does not throw when a day could not be loaded", async () => {
    mockApiFetch.mockResolvedValue(respond(500, { success: false, error: "boom" }));
    const err = await caught(TrendSheetService.prefetchSite("APLTWO", () => {}));
    expect(err).toBeNull();
  });
});

describe("pull", () => {
  const dayOf = (url: string) => url.split("/days/")[1];

  it("loads yesterday, today and tomorrow for the selected trend sheet site", async () => {
    mockApiFetch.mockImplementation(async (url: string) =>
      respond(200, { success: true, data: context({ date: dayOf(url) }) }),
    );
    await TrendSheetService.pull("u1", () => {});
    expect(mockApiFetch.mock.calls.map((c) => dayOf(c[0]))).toEqual(["2026-11-14", "2026-11-15", "2026-11-16"]);
  });

  it("loads no day when the selected site is not a trend sheet site", async () => {
    mockSelectedSite = "COOL1";
    await TrendSheetService.pull("u1", () => {});
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it("falls back to the first authorized site when none was ever picked", async () => {
    mockSelectedSite = null;
    mockApiFetch.mockImplementation(async (url: string) =>
      respond(200, { success: true, data: context({ date: dayOf(url) }) }),
    );
    await TrendSheetService.pull("u1", () => {});
    expect(mockApiFetch).toHaveBeenCalledTimes(3);
  });

  it("throws when a day could not be loaded, so the domain is not marked fresh", async () => {
    mockApiFetch.mockImplementation(async (url: string) =>
      dayOf(url) === "2026-11-16"
        ? respond(500, { success: false, error: "boom" })
        : respond(200, { success: true, data: context({ date: dayOf(url) }) }),
    );
    const err = await caught(TrendSheetService.pull("u1", () => {}));
    expect(err?.message).toBe("trend sheet pull partial: 1 day(s) failed");
  });

  it("throws when the site list could not be refreshed, so the tab is asked for again soon", async () => {
    mockSiteListFresh = false;
    mockTrendSites = [];
    const err = await caught(TrendSheetService.pull("u1", () => {}));
    expect(err?.message).toBe("trend sheet pull partial: the site list could not be refreshed");
  });

  it("stops at once when sign-out cancels the sync", async () => {
    const err = await caught(
      TrendSheetService.pull("u1", () => {
        throw new Error("Sync cancelled");
      }),
    );
    expect([err?.message, mockApiFetch.mock.calls.length]).toEqual(["Sync cancelled", 0]);
  });

  it("drops cached days older than the keep window", async () => {
    mockTables.trend_day_context.set(`${SITE}|2026-09-01`, {
      site_code: SITE,
      entry_date: "2026-09-01",
      payload: "{}",
      fetched_at: 1,
    });
    mockApiFetch.mockImplementation(async (url: string) =>
      respond(200, { success: true, data: context({ date: dayOf(url) }) }),
    );
    await TrendSheetService.pull("u1", () => {});
    expect(mockTables.trend_day_context.has(`${SITE}|2026-09-01`)).toBe(false);
  });
});

// Last on purpose: the "server needs a newer app" flag lives for the session.
describe("replaySave: the app is older than the server's calculation (AC-49)", () => {
  const outdated = () => respond(400, { success: false, error: "Update the app to enter readings.", code: "CLIENT_OUTDATED" });

  it("does not block entry before the server has said so", () => {
    expect(isTrendCalcOutdated(context())).toBe(false);
  });

  it("blocks entry as soon as a cached day carries a higher calculation version", () => {
    expect(isTrendCalcOutdated(context({ calc_version: 2 }))).toBe(true);
  });

  it("keeps the entry pending, so nothing typed is lost", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(outdated());
    await caught(TrendSheetService.replaySave(payload));
    expect(entryRow()?.sync_status).toBe("pending");
  });

  it("throws without a status code, so the queue burns no retries", async () => {
    const payload = await saveElectricity();
    mockApiFetch.mockResolvedValueOnce(outdated());
    const err = await caught(TrendSheetService.replaySave(payload));
    expect(err?.statusCode).toBeUndefined();
  });

  it("raises the update block for every day", () => {
    expect(isTrendCalcOutdated(context())).toBe(true);
  });
});
