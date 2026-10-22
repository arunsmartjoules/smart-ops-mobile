import { addDaysIso, formatOpsRange, rangeForPreset } from "../services/OpsDateRange";

describe("rangeForPreset", () => {
  it("this month covers the whole calendar month", () => {
    expect(rangeForPreset("month", "2026-10-22")).toEqual({ preset: "month", from: "2026-10-01", to: "2026-10-31" });
  });

  it("this week runs Monday to Sunday", () => {
    // 2026-10-22 is a Thursday.
    expect(rangeForPreset("week", "2026-10-22")).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("a Sunday belongs to the week that started the Monday before", () => {
    expect(rangeForPreset("week", "2026-10-25")).toMatchObject({ from: "2026-10-19", to: "2026-10-25" });
  });

  it("last month wraps across the year boundary", () => {
    expect(rangeForPreset("lastMonth", "2026-01-10")).toMatchObject({ from: "2025-12-01", to: "2025-12-31" });
  });

  it("last 3 months starts two months back across the year boundary", () => {
    expect(rangeForPreset("last3", "2026-02-05")).toMatchObject({ from: "2025-12-01", to: "2026-02-28" });
  });
});

describe("addDaysIso", () => {
  it("crosses month ends without timezone drift", () => {
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
  });
});

describe("formatOpsRange", () => {
  it("collapses a range inside one month", () => {
    expect(formatOpsRange("2026-10-01", "2026-10-31", "2026-10-22")).toBe("01–31 Oct");
  });
});
