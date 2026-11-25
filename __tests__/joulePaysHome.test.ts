import {
  cycleBars,
  cycleProgress,
  datesInWords,
  formatLakh,
  formatLakhSigned,
  missedDates,
  pickContractSite,
  shareOfTarget,
  stripScale,
  stripSummary,
  targetGapWords,
} from "@/utils/joulePaysHome";
import type { TrendDayListItem } from "@/utils/trendSheet";

const day = (date: string, over: Partial<TrendDayListItem> = {}): TrendDayListItem => ({
  date,
  status: "complete",
  provisional: false,
  electricity_saving_pct: 3,
  electricity_target_pct: 2,
  has_mismatch: false,
  ...over,
});

// APLINDR-style billing month: 8 Nov to 7 Dec.
const list = {
  from: "2026-11-08",
  to: "2026-12-07",
  days: [
    day("2026-11-08"),
    day("2026-11-09", { electricity_saving_pct: 1.5 }),
    day("2026-11-10", { status: "missing", electricity_saving_pct: null }),
    day("2026-11-11", { electricity_saving_pct: 0 }),
    day("2026-11-12", { status: "partial", electricity_saving_pct: null }),
    day("2026-11-13", { status: "missing", electricity_saving_pct: null }),
  ],
};
const today = "2026-11-13";

describe("cycleBars", () => {
  const bars = cycleBars(list, today);

  it("draws one bar per day of the billing month", () => {
    expect(bars).toHaveLength(30);
  });

  it("marks a day at or above its target as on target", () => {
    expect(bars[0]!.state).toBe("on_target");
  });

  it("marks a day under its target as below", () => {
    expect(bars[1]!.state).toBe("below");
  });

  it("marks an earlier day with nothing entered as not entered", () => {
    expect(bars[2]!.state).toBe("not_entered");
  });

  it("never claims a target for a day floored to 0 %", () => {
    expect(bars[3]!.state).toBe("no_saving");
  });

  it("marks an entered day with no worked-out saving as pending", () => {
    expect(bars[4]!.state).toBe("pending");
  });

  it("keeps today open rather than missed", () => {
    expect(bars[5]!.state).toBe("today");
  });

  it("marks days after today as upcoming", () => {
    expect(bars[6]!.state).toBe("upcoming");
  });

  it("reads a day the server left out as not entered", () => {
    const gap = cycleBars({ from: "2026-11-08", to: "2026-11-09", days: [day("2026-11-09")] }, "2026-11-09");
    expect(gap[0]!.state).toBe("not_entered");
  });

  it("draws nothing for a range that ends before it starts", () => {
    expect(cycleBars({ from: "2026-11-09", to: "2026-11-08", days: [] }, today)).toEqual([]);
  });
});

describe("missedDates", () => {
  it("lists only earlier days with nothing entered", () => {
    expect(missedDates(cycleBars(list, today))).toEqual(["2026-11-10"]);
  });
});

describe("cycleProgress", () => {
  it("counts today as a day of the billing month", () => {
    expect(cycleProgress(list, today)).toEqual({ day: 6, of: 30 });
  });

  it("is day 0 before the month starts", () => {
    expect(cycleProgress(list, "2026-11-01").day).toBe(0);
  });

  it("stops at the last day once the month has ended", () => {
    expect(cycleProgress(list, "2026-12-20").day).toBe(30);
  });
});

describe("stripScale", () => {
  it("rounds up to the next step above the highest bar or target", () => {
    expect(stripScale(cycleBars(list, today), 20)).toBe(20);
  });

  it("never goes below 5 %", () => {
    expect(stripScale([], null)).toBe(5);
  });

  it("ignores a negative target", () => {
    expect(stripScale(cycleBars(list, today), -2.9)).toBe(5);
  });
});

describe("targetGapWords", () => {
  it("says how far above the target", () => {
    expect(targetGapWords(21.4, 20)).toBe("1.40 pts above the 20% target");
  });

  it("says how far below the target", () => {
    expect(targetGapWords(19.5, 20)).toBe("0.50 pts below the 20% target");
  });

  it("reads a negative target as it is set", () => {
    expect(targetGapWords(2.4, -2.9)).toBe("5.30 pts above the −2.9% target");
  });

  it("leaves the target's figure out when asked for the short form", () => {
    expect(targetGapWords(13.75, 19.98, true)).toBe("6.23 pts below target");
  });

  it("says nothing without a target", () => {
    expect(targetGapWords(3, null)).toBeNull();
  });
});

describe("datesInWords", () => {
  it("names one date", () => {
    expect(datesInWords(["2026-11-12"])).toBe("12 Nov");
  });

  it("joins two dates of one month", () => {
    expect(datesInWords(["2026-11-12", "2026-11-14"])).toBe("12 and 14 Nov");
  });

  it("counts the dates it leaves out", () => {
    expect(datesInWords(["2026-11-12", "2026-11-14", "2026-11-15", "2026-11-19"])).toBe("12, 14, 15 Nov and 1 more");
  });

  it("keeps each month name across a month change", () => {
    expect(datesInWords(["2026-11-30", "2026-12-02"])).toBe("30 Nov and 2 Dec");
  });
});

describe("formatLakh", () => {
  it("shows rupees in lakh", () => {
    expect(formatLakh(421000)).toBe("₹4.21 L");
  });

  it("shows a loss with a minus sign", () => {
    expect(formatLakh(-39000)).toBe("−₹0.39 L");
  });

  it("signs a deviation either way", () => {
    expect(formatLakhSigned(42000)).toBe("+₹0.42 L");
  });

  it("shows a dash for nothing", () => {
    expect(formatLakh(null)).toBe("—");
  });
});

describe("pickContractSite", () => {
  const body = {
    yesterday: "2026-11-24",
    sites: [
      { site_code: "OTHER", revenue: 1 },
      {
        site_code: "APLINDR",
        from: "2026-11-08",
        to: "2026-12-07",
        started: true,
        energy_saving_pct: 20.4,
        energy_target_pct: 20,
        revenue: 421000,
        provisional_days: 2,
      },
    ],
  };

  it("takes the asked site's row", () => {
    expect(pickContractSite(body, "APLINDR")?.site.revenue).toBe(421000);
  });

  it("reads a field an older server lacks as none, not zero", () => {
    expect(pickContractSite(body, "APLINDR")?.site.target_revenue).toBeNull();
  });

  it("returns null when the site has no row", () => {
    expect(pickContractSite(body, "MISSING")).toBeNull();
  });

  it("returns null for an answer with no site list", () => {
    expect(pickContractSite({}, "APLINDR")).toBeNull();
  });
});

describe("shareOfTarget", () => {
  it("caps at 100", () => {
    expect(shareOfTarget(30, 20)).toBe(100);
  });

  it("has no share for a target at or below zero", () => {
    expect(shareOfTarget(3, -2.9)).toBeNull();
  });
});

describe("stripSummary", () => {
  it("names each kind of day the strip shows", () => {
    expect(stripSummary(cycleBars(list, today))).toBe(
      "1 day on target, 1 day below target, 2 days with no saving, 1 day not entered, today still to enter, 24 days to come",
    );
  });

  it("says so when there are no days", () => {
    expect(stripSummary([])).toBe("No days to show");
  });
});
