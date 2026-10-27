// Regression: the Site Logs history panel pulls 25-row pages. Both pull paths
// carry a "absent from the response ⇒ gone from the server" pass — pending
// site logs get marked Completed, chiller readings get DELETED. A page is a
// slice, so that pass must never run on one, or scrolling the history would
// wipe or falsely complete every row outside the page.

type Row = Record<string, any>;

const mockLocal: Record<string, Row[]> = { site_logs: [], chiller_readings: [] };
const mockUpdate = jest.fn();
const mockDelete = jest.fn();
const mockWrite = jest.fn(async () => {});

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: (col: any, val: any) => ({ col, val }),
    ne: (col: any, val: any) => ({ col, val }),
    and: (...conds: any[]) => ({ conds }),
    inArray: (col: any, vals: any[]) => ({ col, vals }),
  };
});

jest.mock("../database", () => {
  const table = (name: string) => ({
    __name: name,
    id: { name: "id" },
    site_code: { name: "site_code" },
    log_name: { name: "log_name" },
    status: { name: "status" },
    signature: { name: "signature" },
  });
  const fakeDb = {
    select: () => ({
      from: (t: any) => ({ where: async () => mockLocal[t.__name] ?? [] }),
    }),
    update: (t: any) => ({
      set: (fields: Row) => ({ where: async () => mockUpdate(t.__name, fields) }),
    }),
    delete: (t: any) => ({ where: async () => mockDelete(t.__name) }),
  };
  return {
    db: fakeDb,
    chillerReadings: table("chiller_readings"),
    offlineQueue: table("offline_queue"),
    siteLogs: table("site_logs"),
    logMaster: table("log_master"),
  };
});

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: { write: (...args: any[]) => mockWrite(...(args as [])) },
}));

const mockApiFetch = jest.fn();
jest.mock("../utils/apiHelper", () => ({
  apiFetch: (...args: any[]) => mockApiFetch(...args),
}));
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    activity: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));
jest.mock("../utils/authEvents", () => ({
  authEvents: { emitUnauthorized: jest.fn() },
}));
jest.mock("../constants/api", () => ({ API_BASE_URL: "https://api.test" }));
jest.mock("@react-native-community/netinfo", () => ({}));
jest.mock("../services/SiteConfigService", () => ({ getLogVariants: jest.fn() }));
jest.mock("../services/AttachmentQueueService", () => ({
  AttachmentQueueService: {},
}));
jest.mock("../services/AttendanceService", () => ({
  getISTDateString: jest.fn(),
}));

import { SiteLogService } from "../services/SiteLogService";

const ok = (body: any) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const SITE = "JCL-TEST";
const IN_RANGE_MS = Date.UTC(2026, 9, 10, 6, 0);

beforeEach(() => {
  mockUpdate.mockClear();
  mockDelete.mockClear();
  mockWrite.mockClear();
  mockApiFetch.mockReset();
  // A pending log and an in-range reading on the phone that the page below
  // does not contain.
  mockLocal.site_logs = [{ id: "local-pending", status: "Open" }];
  mockLocal.chiller_readings = [
    { id: "local-reading", reading_time: IN_RANGE_MS },
  ];
});

describe("pullSiteLogs, paged", () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue(
      ok({
        success: true,
        data: [{ id: "server-1", status: "Open", log_name: "Temp RH" }],
        pagination: { total: 2673 },
      }),
    );
  });

  it("does not mark pending logs outside the page as Completed", async () => {
    await SiteLogService.pullSiteLogs(SITE, {
      logName: "Temp RH",
      status: "pending",
      page: 1,
      limit: 25,
    });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("returns the page's ids and the server's filtered total", async () => {
    const pulled = await SiteLogService.pullSiteLogs(SITE, {
      logName: "Temp RH",
      page: 1,
      limit: 25,
    });
    expect(pulled).toEqual({ ids: ["server-1"], total: 2673 });
  });

  it("requests exactly one page of the requested size", async () => {
    await SiteLogService.pullSiteLogs(SITE, { logName: "Temp RH", page: 3, limit: 25 });
    expect(String(mockApiFetch.mock.calls[0][0])).toMatch(/[?&]limit=25&page=3(&|$)/);
  });
});

describe("pullChillerReadings", () => {
  beforeEach(() => {
    mockApiFetch.mockResolvedValue(
      ok({ success: true, data: [{ id: "server-r1" }], pagination: { total: 470 } }),
    );
  });

  it("does not delete local readings missing from a page", async () => {
    await SiteLogService.pullChillerReadings(SITE, {
      fromDate: IN_RANGE_MS - 1000,
      toDate: IN_RANGE_MS + 1000,
      page: 1,
      limit: 25,
    });
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("still prunes readings missing from a full, unpaged pull", async () => {
    await SiteLogService.pullChillerReadings(SITE, {
      fromDate: IN_RANGE_MS - 1000,
      toDate: IN_RANGE_MS + 1000,
    });
    expect(mockDelete).toHaveBeenCalledWith("chiller_readings");
  });
});
