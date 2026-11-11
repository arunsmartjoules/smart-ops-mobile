// A role's "data visible from" day (Settings › Roles & Permissions) locks the
// shared Ops date range: no window may start before it. Client-side only.

import {
  clampToFloor,
  getOpsDateRange,
  laterDay,
  setOpsDateFloor,
  setOpsDateRange,
} from "../services/OpsDateRange";

describe("clampToFloor", () => {
  it("moves a start before the floor onto the floor", () => {
    expect(clampToFloor({ from: "2026-05-01", to: "2026-06-30" }, "2026-06-01")).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("collapses a window wholly before the floor onto the floor day", () => {
    expect(clampToFloor({ from: "2026-04-01", to: "2026-04-30" }, "2026-06-01")).toEqual({
      from: "2026-06-01",
      to: "2026-06-01",
    });
  });

  it("leaves a window after the floor untouched", () => {
    const r = { from: "2026-07-01", to: "2026-07-31" };
    expect(clampToFloor(r, "2026-06-01")).toBe(r);
  });

  it("does nothing without a floor", () => {
    const r = { from: "2020-01-01", to: "2020-01-31" };
    expect(clampToFloor(r, null)).toBe(r);
  });

  it("keeps extra fields such as the preset", () => {
    expect(
      clampToFloor({ preset: "lastMonth" as const, from: "2026-05-01", to: "2026-05-31" }, "2026-05-15")
        .preset,
    ).toBe("lastMonth");
  });
});

describe("laterDay", () => {
  it("picks the later of two days", () => {
    expect(laterDay("2026-06-01", "2026-07-10")).toBe("2026-07-10");
  });

  it("falls back to whichever is set", () => {
    expect(laterDay(undefined, "2026-07-10")).toBe("2026-07-10");
  });

  it("is undefined when neither is set", () => {
    expect(laterDay(null, null)).toBeUndefined();
  });
});

describe("the shared Ops range under a floor", () => {
  afterEach(() => setOpsDateFloor(null));

  it("clamps a range set while a floor is in force", () => {
    setOpsDateFloor("2026-06-15");
    setOpsDateRange({ preset: "custom", from: "2026-06-01", to: "2026-06-30" });
    expect(getOpsDateRange()).toMatchObject({ from: "2026-06-15", to: "2026-06-30" });
  });

  it("re-clamps the current range when a floor arrives", () => {
    setOpsDateRange({ preset: "custom", from: "2026-01-01", to: "2026-01-31" });
    setOpsDateFloor("2026-03-01");
    expect(getOpsDateRange()).toMatchObject({ from: "2026-03-01", to: "2026-03-01" });
  });
});
