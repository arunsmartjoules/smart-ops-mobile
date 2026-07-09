import { isSessionRevokedError } from "../services/AuthTokenManager";
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
  },
}));

// NOTE: getValidAuthToken / forceRefreshAuthToken are now backed by JouleOps
// JWTs + /api/auth/refresh (not Firebase getIdToken). The former Firebase-token
// tests were removed with the Firebase Storage → S3 migration; they asserted
// removed behaviour (a "firebase-token" AsyncStorage key). Add JWT-path tests
// for those functions separately.

describe("AuthTokenManager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
