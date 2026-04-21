import { apiFetch } from "../utils/apiHelper";
import { authEvents } from "../utils/authEvents";
import {
  forceRefreshAuthToken,
  getStoredAuthToken,
  getValidAuthToken,
  isSessionRevokedError,
} from "../services/AuthTokenManager";
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: {
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
  },
}));

jest.mock("../services/firebase", () => ({
  __esModule: true,
  auth: { currentUser: { uid: "u1" } },
}));

jest.mock("../utils/authEvents", () => ({
  __esModule: true,
  authEvents: { emitUnauthorized: jest.fn() },
}));

jest.mock("../services/AuthTokenManager", () => ({
  __esModule: true,
  getValidAuthToken: jest.fn(),
  getStoredAuthToken: jest.fn(),
  forceRefreshAuthToken: jest.fn(),
  isSessionRevokedError: jest.fn(),
}));

describe("apiFetch auth retry", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    (getValidAuthToken as jest.Mock).mockResolvedValue("initial-token");
    (getStoredAuthToken as jest.Mock).mockResolvedValue(null);
    (forceRefreshAuthToken as jest.Mock).mockResolvedValue("refreshed-token");
    (isSessionRevokedError as jest.Mock).mockReturnValue(false);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("retries once on 401 using refreshed token", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("{}", { status: 200 }),
      ) as unknown as typeof fetch;

    const response = await apiFetch("https://api.example.com/v1/ping");

    expect(response.status).toBe(200);
    expect(forceRefreshAuthToken).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const firstInit = (global.fetch as jest.Mock).mock
      .calls[0][1] as RequestInit;
    const secondInit = (global.fetch as jest.Mock).mock
      .calls[1][1] as RequestInit;
    expect(firstInit.headers).toMatchObject({
      Authorization: "Bearer initial-token",
    });
    expect(secondInit.headers).toMatchObject({
      Authorization: "Bearer refreshed-token",
    });
  });

  it("only refreshes once for concurrent 401 responses", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: "Token expired" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValue(
        new Response("{}", { status: 200 }),
      ) as unknown as typeof fetch;

    const refreshPromise = Promise.resolve("shared-refreshed-token");
    (forceRefreshAuthToken as jest.Mock).mockReturnValue(refreshPromise);

    const [resp1, resp2] = await Promise.all([
      apiFetch("https://api.example.com/v1/a"),
      apiFetch("https://api.example.com/v1/b"),
    ]);

    expect(resp1.status).toBe(200);
    expect(resp2.status).toBe(200);
    expect(forceRefreshAuthToken).toHaveBeenCalledTimes(2);
  });

  it("emits session_revoked and skips retry for revoked response", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Token revoked" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    const response = await apiFetch("https://api.example.com/v1/ping");
    expect(response.status).toBe(401);
    expect(forceRefreshAuthToken).not.toHaveBeenCalled();
    expect(authEvents.emitUnauthorized).toHaveBeenCalledWith("session_revoked");
  });

  it("emits session_revoked when refresh fails with revoked classification", async () => {
    global.fetch = jest.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "Token expired" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      }),
    ) as unknown as typeof fetch;
    (forceRefreshAuthToken as jest.Mock).mockRejectedValue(
      new Error("revoked"),
    );
    (isSessionRevokedError as jest.Mock).mockReturnValue(true);

    const response = await apiFetch("https://api.example.com/v1/ping");
    expect(response.status).toBe(401);
    expect(authEvents.emitUnauthorized).toHaveBeenCalledWith("session_revoked");
  });
});
