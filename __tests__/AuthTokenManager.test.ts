import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  forceRefreshAuthToken,
  getValidAuthToken,
  isSessionRevokedError,
} from "../services/AuthTokenManager";
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

const mockGetIdToken = jest.fn();

jest.mock("../services/firebase", () => ({
  __esModule: true,
  auth: {
    currentUser: {
      getIdToken: (...args: unknown[]) => mockGetIdToken(...args),
    },
  },
}));

describe("AuthTokenManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns cached firebase token and persists it when still valid", async () => {
    const farFutureExp = Math.floor((Date.now() + 10 * 60 * 1000) / 1000);
    const token = `x.${Buffer.from(JSON.stringify({ exp: farFutureExp })).toString("base64url")}.y`;
    mockGetIdToken.mockResolvedValue(token);

    const result = await getValidAuthToken();

    expect(result).toBe(token);
    expect(mockGetIdToken).toHaveBeenCalledWith(false);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith("firebase-token", token);
  });

  it("coalesces concurrent force refresh calls into one underlying refresh", async () => {
    let resolver: (value: string) => void = () => {};
    const pending = new Promise<string>((resolve) => {
      resolver = resolve;
    });
    mockGetIdToken.mockReturnValue(pending);

    const p1 = forceRefreshAuthToken();
    const p2 = forceRefreshAuthToken();
    resolver("new-token");

    const [t1, t2] = await Promise.all([p1, p2]);

    expect(t1).toBe("new-token");
    expect(t2).toBe("new-token");
    expect(mockGetIdToken).toHaveBeenCalledTimes(1);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith(
      "firebase-token",
      "new-token",
    );
  });

  it("classifies revoked/disabled token errors", () => {
    expect(isSessionRevokedError({ code: "auth/id-token-revoked" })).toBe(true);
    expect(
      isSessionRevokedError({
        message: "The Firebase ID token has been revoked",
      }),
    ).toBe(true);
    expect(isSessionRevokedError({ code: "auth/network-request-failed" })).toBe(
      false,
    );
  });
});
