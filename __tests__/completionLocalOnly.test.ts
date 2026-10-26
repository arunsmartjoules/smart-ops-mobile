// "Complete & sign" must finish on the phone alone: the server push runs in
// the background, a signature is plain data (no file, no upload), and a photo
// already queued is not copied/queued again on every save. Each of these was a
// place the completion could stall ("button frozen, no response", Oct 2026).

type Row = Record<string, any>;

const mockTables: Record<string, Map<string, Row>> = {
  chiller_readings: new Map(),
  site_logs: new Map(),
};

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return {
    ...actual,
    eq: (col: any, val: any) => ({ op: "eq", col, val }),
    inArray: (col: any, vals: any[]) => ({ op: "in", col, vals }),
  };
});

jest.mock("../database", () => {
  const table = (name: string) => ({ __name: name, id: { name: "id" } });
  const matching = (name: string, cond: any) =>
    [...mockTables[name]!.values()].filter((r) =>
      cond.op === "in" ? cond.vals.includes(r.id) : r.id === cond.val,
    );
  // Awaitable directly (`await db.select().from(t).where(c)`) or via .limit().
  const result = (rows: Row[]) => Object.assign(Promise.resolve(rows), { limit: async () => rows });
  const fakeDb = {
    select: () => ({
      from: (t: any) => ({ where: (cond: any) => result(matching(t.__name, cond)) }),
    }),
    update: (t: any) => ({
      set: (fields: Row) => ({
        where: async (cond: any) => {
          for (const r of matching(t.__name, cond)) {
            mockTables[t.__name]!.set(r.id, { ...r, ...fields });
          }
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
    chillerReadings: table("chiller_readings"),
    siteLogs: table("site_logs"),
    offlineQueue: table("offline_queue"),
    logMaster: table("log_master"),
  };
});

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    enqueue: jest.fn(async () => "q-1"),
    dequeue: jest.fn(async () => {}),
    getPendingQueueItemsByType: jest.fn(async () => []),
  },
}));

const mockQueueAttachment = jest.fn();
const mockFindByLocalUri = jest.fn();
jest.mock("../services/AttachmentQueueService", () => ({
  AttachmentQueueService: {
    queueAttachment: (...a: any[]) => mockQueueAttachment(...a),
    findByLocalUri: (...a: any[]) => mockFindByLocalUri(...a),
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
jest.mock("../services/AttendanceService", () => ({ getISTDateString: jest.fn(() => "2026-10-26") }));

import { SiteLogService } from "../services/SiteLogService";

const CHILLER_ID = "c-1";
const LOG_ID = "l-1";
const SIGNATURE = "data:image/svg+xml;base64,PHN2Zy8+";
const CAMERA_PHOTO = "file:///cache/Camera/photo.jpg";
const QUEUED_COPY = "file:///files/attachments/copy.jpg";

/** A server that never answers — the worst weak-signal case. */
const serverNeverAnswers = () => mockApiFetch.mockImplementation(() => new Promise(() => {}));

beforeEach(() => {
  mockTables.chiller_readings!.clear();
  mockTables.site_logs!.clear();
  mockTables.chiller_readings!.set(CHILLER_ID, { id: CHILLER_ID, status: "Inprogress" });
  mockTables.site_logs!.set(LOG_ID, { id: LOG_ID, status: "Inprogress" });
  mockApiFetch.mockReset();
  mockQueueAttachment.mockReset().mockResolvedValue(QUEUED_COPY);
  mockFindByLocalUri.mockReset().mockResolvedValue(null);
});

describe("chiller completion", () => {
  it("finishes without waiting for the server", async () => {
    serverNeverAnswers();
    const record = await SiteLogService.updateChillerReading(CHILLER_ID, {
      status: "Completed",
      signature: SIGNATURE,
    });
    expect(record.status).toBe("Completed");
  });

  it("stores the signature as data", async () => {
    serverNeverAnswers();
    await SiteLogService.updateChillerReading(CHILLER_ID, { status: "Completed", signature: SIGNATURE });
    expect(mockTables.chiller_readings!.get(CHILLER_ID)!.signature_text).toBe(SIGNATURE);
  });

  it("does not put the signature through the file queue", async () => {
    serverNeverAnswers();
    await SiteLogService.updateChillerReading(CHILLER_ID, { status: "Completed", signature: SIGNATURE });
    expect(mockQueueAttachment).not.toHaveBeenCalled();
  });

  it("queues the same photo only once across saves", async () => {
    serverNeverAnswers();
    await SiteLogService.updateChillerReading(CHILLER_ID, { attachments: CAMERA_PHOTO });
    await SiteLogService.updateChillerReading(CHILLER_ID, { attachments: CAMERA_PHOTO, status: "Completed" });
    expect(mockQueueAttachment).toHaveBeenCalledTimes(1);
  });

  it("saves the photo's public URL once it has uploaded", async () => {
    serverNeverAnswers();
    await SiteLogService.updateChillerReading(CHILLER_ID, { attachments: "file:///cache/Camera/other.jpg" });
    mockFindByLocalUri.mockResolvedValue({ status: "completed", uploaded_url: "https://s3/copy.jpg" });
    await SiteLogService.updateChillerReading(CHILLER_ID, { attachments: "file:///cache/Camera/other.jpg" });
    expect(mockTables.chiller_readings!.get(CHILLER_ID)!.attachments).toBe("https://s3/copy.jpg");
  });
});

describe("site log (Temp RH / Water / Chemical) completion", () => {
  const completedRow = {
    id: LOG_ID,
    site_code: "S1",
    log_name: "Temp RH",
    temperature: 22,
    rh: 50,
    status: "Completed",
    signature: SIGNATURE,
  };

  it("finishes without waiting for the server", async () => {
    serverNeverAnswers();
    await SiteLogService.saveBulkSiteLogs([completedRow]);
    expect(mockTables.site_logs!.get(LOG_ID)!.status).toBe("Completed");
  });

  it("stores the signature as data", async () => {
    serverNeverAnswers();
    await SiteLogService.saveBulkSiteLogs([completedRow]);
    expect(mockTables.site_logs!.get(LOG_ID)!.signature).toBe(SIGNATURE);
  });

  it("does not put the signature through the file queue", async () => {
    serverNeverAnswers();
    await SiteLogService.saveBulkSiteLogs([completedRow, { ...completedRow, id: "l-2" }]);
    expect(mockQueueAttachment).not.toHaveBeenCalled();
  });
});
