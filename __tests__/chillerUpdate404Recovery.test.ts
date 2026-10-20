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

jest.mock("../services/CacheManager", () => ({
  __esModule: true,
  default: {
    enqueue: (item: Row) => mockEnqueue(item),
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

import { SiteLogService } from "../services/SiteLogService";

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
      await expect(
        SiteLogService.updateChillerReading(ID, { status: "Completed" }),
      ).resolves.toBeDefined();
    });

    it("folds the completion into the queued create", async () => {
      await SiteLogService.updateChillerReading(ID, { status: "Completed" });
      const queued = JSON.parse(mockTables.offline_queue.get("q-create")!.payload);
      expect(queued.status).toBe("Completed");
    });

    it("queues the update behind the create", async () => {
      await SiteLogService.updateChillerReading(ID, { status: "Completed" });
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
      await SiteLogService.updateChillerReading(ID, { status: "Completed" });
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
      await SiteLogService.updateChillerReading(ID, { status: "Completed" });
      expect(mockEnqueue).toHaveBeenCalledWith(
        expect.objectContaining({ entity_type: "chiller_reading_create" }),
      );
    });

    it("never surfaces the raw 404 even if the server rejects the row", async () => {
      mockApiFetch
        .mockResolvedValueOnce(res(404))
        .mockResolvedValueOnce(res(400, { error: "bad" }));
      await expect(
        SiteLogService.updateChillerReading(ID, { status: "Completed" }),
      ).rejects.toThrow(/saved on your device/);
    });
  });
});
