// Regression: tapping "Complete Reading" while the reading's create was still
// in offline_queue showed "Chiller reading <uuid> not found on server (404)".
// A 404 on the update PUT must now be recovered silently.

type Row = Record<string, any>;

const mockTables: Record<string, Map<string, Row>> = {
  chiller_readings: new Map(),
  offline_queue: new Map(),
};

jest.mock("drizzle-orm", () => {
  const actual = jest.requireActual("drizzle-orm");
  return { ...actual, eq: (col: any, val: any) => ({ col, val }) };
});

jest.mock("../database", () => {
  const table = (name: string) => ({
    __name: name,
    id: { name: "id" },
    entity_type: { name: "entity_type" },
    status: { name: "status" },
  });
  const byId = (name: string, cond: any) =>
    [...mockTables[name].values()].filter((r) => r.id === cond.val);
  const fakeDb = {
    select: () => ({
      from: (t: any) => ({
        where: (cond: any) => ({
          limit: async () => byId(t.__name, cond),
        }),
      }),
    }),
    update: (t: any) => ({
      set: (fields: Row) => ({
        where: async (cond: any) => {
          for (const r of byId(t.__name, cond)) {
            mockTables[t.__name].delete(r.id);
            const next = { ...r, ...fields };
            mockTables[t.__name].set(next.id, next);
          }
        },
      }),
    }),
  };
  return {
    db: fakeDb,
    chillerReadings: table("chiller_readings"),
    offlineQueue: table("offline_queue"),
    siteLogs: table("site_logs"),
    logMaster: table("log_master"),
  };
});

const mockEnqueue = jest.fn(async (item: Row) => {
  const id = `q-${mockTables.offline_queue.size + 1}`;
  mockTables.offline_queue.set(id, {
    id,
    entity_type: item.entity_type,
    payload: JSON.stringify(item.payload),
  });
  return id;
});

const mockDequeue = jest.fn(async (id: string) => {
  mockTables.offline_queue.delete(id);
});

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    enqueue: (item: Row) => mockEnqueue(item),
    dequeue: (id: string) => mockDequeue(id),
    getPendingQueueItemsByType: async (type: string) =>
      [...mockTables.offline_queue.values()]
        .filter((r) => r.entity_type === type)
        .map((r) => ({ ...r, payload: JSON.parse(r.payload) })),
  },
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

import { SiteLogService, settleBackgroundPushes } from "../services/SiteLogService";
import logger from "../utils/logger";

/** Save, then let its background server push finish. */
const updateAndSettle = async (id: string, data: Record<string, any>) => {
  const record = await SiteLogService.updateChillerReading(id, data);
  await settleBackgroundPushes();
  return record;
};

const ID = "8805ab3a-3fcb-4c36-b851-a260957a641e";

const res = (status: number, body: any = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

beforeEach(() => {
  mockTables.chiller_readings.clear();
  mockTables.offline_queue.clear();
  mockEnqueue.mockClear();
  mockDequeue.mockClear();
  mockApiFetch.mockReset();
  mockTables.chiller_readings.set(ID, { id: ID, status: "Inprogress" });
});

describe("updateChillerReading on 404", () => {
  describe("when the create is still queued", () => {
    beforeEach(() => {
      mockTables.offline_queue.set("q-create", {
        id: "q-create",
        entity_type: "chiller_reading_create",
        payload: JSON.stringify({ id: ID, status: "Inprogress" }),
      });
      mockApiFetch.mockResolvedValue(res(404));
    });

    it("does not throw", async () => {
      await expect(updateAndSettle(ID, { status: "Completed" })).resolves.toBeDefined();
    });

    it("folds the completion into the queued create", async () => {
      await updateAndSettle(ID, { status: "Completed" });
      const queued = JSON.parse(mockTables.offline_queue.get("q-create")!.payload);
      expect(queued.status).toBe("Completed");
    });

    it("queues the update behind the create", async () => {
      await updateAndSettle(ID, { status: "Completed" });
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: "chiller_reading_update" }),
      );
    });
  });

  describe("when no create is queued", () => {
    it("re-creates the row on the server with the local state", async () => {
      mockApiFetch
        .mockResolvedValueOnce(res(404))
        .mockResolvedValueOnce(res(201, { data: { id: ID } }));
      await updateAndSettle(ID, { status: "Completed" });
      const [url, init] = mockApiFetch.mock.calls[1];
      expect([url, init.method, JSON.parse(init.body).status]).toEqual([
        "https://api.test/api/chiller-readings",
        "POST",
        "Completed",
      ]);
    });

    it("queues the re-create when the network drops", async () => {
      mockApiFetch
        .mockResolvedValueOnce(res(404))
        .mockRejectedValueOnce(new Error("Fetch request has been canceled"));
      await updateAndSettle(ID, { status: "Completed" });
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: "chiller_reading_create" }),
      );
    });

    // The push runs in the background now, so a rejected re-create can't
    // reach the screen; it must be logged (and never thrown at the caller).
    it("logs, never throws, when the server rejects the re-created row", async () => {
      mockApiFetch
        .mockResolvedValueOnce(res(404))
        .mockResolvedValueOnce(res(400, { error: "bad" }));
      await expect(updateAndSettle(ID, { status: "Completed" })).resolves.toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        "recoverMissingChillerRow: server rejected re-create",
        expect.anything(),
      );
    });
  });
});

// Regression: an operator on a slow site connection tapped "Complete reading",
// saw nothing for up to a minute (PUT timeout) and left the screen. The
// completion had been saved on the phone but was only queued AFTER the PUT
// failed — so it was never queued, and the server row stayed "Pending".
describe("updateChillerReading durability", () => {
  const queuedUpdates = () =>
    [...mockTables.offline_queue.values()].filter((r) => r.entity_type === "chiller_reading_update");

  it("queues a completion before sending it", async () => {
    let queuedWhenSent = -1;
    mockApiFetch.mockImplementationOnce(async () => {
      queuedWhenSent = queuedUpdates().length;
      return res(200, { success: true });
    });
    await updateAndSettle(ID, { status: "Completed" });
    expect(queuedWhenSent).toBe(1);
  });

  it("removes the queued completion once the server confirms it", async () => {
    mockApiFetch.mockResolvedValueOnce(res(200, { success: true }));
    await updateAndSettle(ID, { status: "Completed" });
    expect(queuedUpdates()).toHaveLength(0);
  });

  it("keeps exactly one queued completion when the network drops", async () => {
    mockApiFetch.mockRejectedValueOnce(new Error("Network request failed"));
    await updateAndSettle(ID, { status: "Completed" });
    expect(queuedUpdates()).toHaveLength(1);
  });

  it("keeps the queued completion when the session expired (401)", async () => {
    mockApiFetch.mockResolvedValueOnce(res(401, { error: "expired" }));
    await updateAndSettle(ID, { status: "Completed" });
    expect(queuedUpdates()).toHaveLength(1);
  });

  it("drops the queued completion when the server rejects it (400)", async () => {
    mockApiFetch.mockResolvedValueOnce(res(400, { error: "bad" }));
    await updateAndSettle(ID, { status: "Completed" });
    expect(queuedUpdates()).toHaveLength(0);
  });

  it("does not queue a successful auto-save (no status change)", async () => {
    mockApiFetch.mockResolvedValueOnce(res(200, { success: true }));
    await updateAndSettle(ID, { load: 75 });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });
});

// Regression: saving waited on the server, so a weak site connection froze
// the entry screen for up to the 30s request timeout.
describe("updateChillerReading does not wait for the server", () => {
  it("returns while the server request is still outstanding", async () => {
    let answer: (v: unknown) => void = () => {};
    mockApiFetch.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)));
    let returned = false;
    const pending = SiteLogService.updateChillerReading(ID, { status: "Completed" }).then(() => {
      returned = true;
    });
    await pending;
    expect(returned).toBe(true);
    answer(res(200, { success: true }));
    await settleBackgroundPushes();
  });
});
