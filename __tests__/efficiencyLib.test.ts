import {
  aggregate,
  allDates,
  big,
  monthRange,
  n3,
  niceStepTicks,
  overTarget,
  recentMonths,
  whole,
  type EffRow,
} from "../components/efficiency/lib";

const row = (date: string, sec: string | null, kwh: string | null): EffRow => ({
  id: date,
  report_date: date,
  site_id: "S1",
  plant_sec: sec,
  plant_consumption: kwh,
});

describe("aggregate", () => {
  // node-pg returns numeric columns as strings.
  const rows = [row("2026-10-01", "0.8", "1000.5"), row("2026-10-02", "0.9", null), row("2026-10-03", null, "499.5")];

  it("sums string-typed kWh, skipping nulls", () => {
    expect(aggregate(rows, "plant_consumption", "sum")).toBe(1500);
  });

  it("averages SEC over days that have a reading", () => {
    expect(aggregate(rows, "plant_sec", "mean")).toBeCloseTo(0.85, 10);
  });

  it("is null when no row has a value", () => {
    expect(aggregate([row("2026-10-01", null, null)], "plant_sec", "mean")).toBeNull();
  });
});

describe("overTarget", () => {
  it("flags a value strictly above the target", () => {
    expect(overTarget("0.851", 0.85)).toBe(true);
  });

  it("does not flag a value equal to the target", () => {
    expect(overTarget(0.85, 0.85)).toBe(false);
  });

  it("never flags when the side has no target", () => {
    expect(overTarget(5, null)).toBe(false);
  });
});

describe("formatters", () => {
  it("groups whole numbers the Indian way", () => {
    expect(whole("1234567.4")).toBe("12,34,567");
  });

  it("compacts lakhs for counter headlines", () => {
    expect(big(2_50_000)).toBe("2.50 L");
  });

  it("renders a missing SEC as an em dash", () => {
    expect(n3(null)).toBe("—");
  });
});

describe("niceStepTicks", () => {
  it("uses 0.2 steps up past the target", () => {
    expect(niceStepTicks(0.85)).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
  });
});

describe("calendar ranges", () => {
  it("lists every day across a month boundary without timezone drift", () => {
    expect(allDates("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("caps the current month at today", () => {
    expect(monthRange("2026-10", "2026-10-22")).toEqual({ from: "2026-10-01", to: "2026-10-22" });
  });

  it("covers a past month to its last day, leap February included", () => {
    expect(monthRange("2028-02", "2028-10-22")).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });

  it("lists recent months newest first across the year boundary", () => {
    expect(recentMonths("2026-02", 3)).toEqual(["2026-02", "2026-01", "2025-12"]);
  });
});
