import {
  cachedAuthUserMatchesFirebaseSession,
  normalizeAuthCacheEmail,
} from "../utils/authUserCacheMatch";

describe("cachedAuthUserMatchesFirebaseSession", () => {
  it("accepts cache when Firebase email is empty and cache has user_id and email (Google / custom token)", () => {
    expect(
      cachedAuthUserMatchesFirebaseSession(null, {
        email: "a@b.com",
        user_id: "u-1",
      }),
    ).toBe(true);
    expect(
      cachedAuthUserMatchesFirebaseSession("", {
        email: "a@b.com",
        user_id: "u-1",
      }),
    ).toBe(true);
  });

  it("requires a non-empty user_id", () => {
    expect(
      cachedAuthUserMatchesFirebaseSession(null, { email: "a@b.com" }),
    ).toBe(false);
  });

  it("when both sides have email, they must match", () => {
    expect(
      cachedAuthUserMatchesFirebaseSession("A@B.com", {
        email: "a@b.com",
        user_id: "u-1",
      }),
    ).toBe(true);
    expect(
      cachedAuthUserMatchesFirebaseSession("a@b.com", {
        email: "c@d.com",
        user_id: "u-1",
      }),
    ).toBe(false);
  });
});

describe("normalizeAuthCacheEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeAuthCacheEmail("  A@B.COM  ")).toBe("a@b.com");
  });
});
