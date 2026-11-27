// The Consumption Trend Sheet works with no network because the phone can
// preview a save itself and knows what to show for an entry the server has not
// answered yet. These are the pure rules behind that (utils/trendSheet).

import {
  gaugeScale,
  addDaysYmd,
  addMonthsYm,
  carryFromPhone,
  categorySubtitle,
  factorLine,
  formatIndian,
  formatPct,
  formatSigned,
  inSentence,
  lastSevenDays,
  lowerThanOpeningMessage,
  mergeDay,
  firstSkippedDay,
  monthLabel,
  openingLabel,
  relativeDayLabel,
  parseTyped,
  previewSave,
  savingSummary,
  viewOfContext,
  weekdayOfYmd,
  type TrendContextBlock,
  type TrendContextCategory,
  type TrendDayContext,
  type TrendLocalEntry,
  type TrendSaveBody,
} from "../utils/trendSheet";

const SITE = "APLMAIN";
const DAY = "2026-11-15";

function block(extra: Partial<TrendContextBlock> & { block_id: string }): TrendContextBlock {
  return {
    name: extra.block_id,
    entry_mode: "readings",
    typed: null,
    opening_reading: null,
    opening_date: null,
    final_reading: null,
    mf: null,
    add_adjustment: 0,
    deduct_adjustment: 0,
    carried_from: null,
    quantity: null,
    litres: null,
    mismatch: null,
    ...extra,
  };
}

function category(extra: Partial<TrendContextCategory> & { category: TrendContextCategory["category"] }): TrendContextCategory {
  return {
    label: extra.category,
    unit: "kWh",
    kind: "meter",
    entered: false,
    entered_by_name: null,
    entered_at: null,
    pending_inputs: [],
    consumption: null,
    adjustment: 0,
    saving: null,
    saving_pct: null,
    not_used: false,
    provisional: false,
    blocks: [],
    ...extra,
  };
}

/** Apollo Main Hospital, 15 Nov 2026 (spec AC-18), before anything is entered. */
function apolloMain(): TrendDayContext {
  return {
    site_code: SITE,
    date: DAY,
    is_sunday: true,
    cycle_month: "2026-11",
    status: "missing",
    categories_expected: 3,
    categories_entered: 0,
    editable: true,
    calc_version: 1,
    categories: [
      category({
        category: "electricity",
        label: "Electricity",
        baseline: 35988.88,
        baseline_kind: "sunday",
        target_pct: 21,
        target: 7557.66,
        manual_allowed: false,
        blocks: [
          block({ block_id: "main", name: "Main Block", opening_reading: 53064.46, opening_date: "2026-11-14", mf: 3000, carried_from: "2026-11-14" }),
          block({
            block_id: "sindoori",
            name: "Sindoori Block",
            opening_reading: 37419.48,
            opening_date: "2026-11-14",
            mf: 800,
            add_adjustment: 4624.8,
            deduct_adjustment: 1873.5,
            carried_from: "2026-11-14",
          }),
        ],
      }),
      category({ category: "dg", label: "DG", kind: "dg", dg_factor: 3.2, blocks: [block({ block_id: "dg1", entry_mode: null })] }),
      category({
        category: "diesel",
        label: "Diesel",
        unit: "L",
        kind: "fuel",
        baseline: 287.6,
        baseline_kind: "sunday",
        target_pct: null,
        target: null,
        blocks: [block({ block_id: "boiler", entry_mode: null })],
      }),
    ],
  };
}

const body = (extra: Partial<TrendSaveBody>): TrendSaveBody => ({
  client_saved_at: "2026-11-15T12:00:00.000Z",
  calc_version: 1,
  blocks: [],
  ...extra,
});

const ELECTRICITY_SAVE = body({
  blocks: [
    { block_id: "main", final_reading: 53073.41, opening_source: "carried" },
    { block_id: "sindoori", final_reading: 37422.66, opening_source: "carried" },
  ],
});

const entry = (extra: Partial<TrendLocalEntry>): TrendLocalEntry => ({
  site_code: SITE,
  entry_date: DAY,
  category: "electricity",
  body: ELECTRICITY_SAVE,
  client_saved_at: ELECTRICITY_SAVE.client_saved_at,
  sync_status: "pending",
  last_error: null,
  ...extra,
});

const of = (view: { categories: { category: string }[] }, id: string) =>
  view.categories.find((c) => c.category === id) as any;

describe("previewSave: the phone's twin of the server's preview", () => {
  it("gives the Apollo Main saving of 9,346.18 kWh from the two readings (AC-18)", () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    expect(of(view, "electricity").saving).toBe(9346.18);
  });

  it("gives 25.97% saved for the same day (AC-18)", () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    expect(of(view, "electricity").saving_pct).toBe(25.97);
  });

  it("adds the carried adjustments the save did not mention", () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    expect(of(view, "electricity").adjustment).toBe(2751.3);
  });

  it("reports used as the meters plus DG, Solar and Wind", () => {
    const withElectricity = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    const withDg = previewSave(withElectricity, "dg", body({ blocks: [{ block_id: "dg1", quantity: 320 }] }));
    expect(of(withDg, "electricity").used).toBe(29714);
  });

  it("moves the Electricity saving when DG is saved", () => {
    const withElectricity = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    const withDg = previewSave(withElectricity, "dg", body({ blocks: [{ block_id: "dg1", litres: 100 }] }));
    expect(of(withDg, "electricity").saving).toBe(9026.18);
  });

  it("marks Electricity provisional until DG is entered", () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    expect(of(view, "electricity").provisional).toBe(true);
  });

  it("clears the provisional mark once DG is marked as not run", () => {
    const withElectricity = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    const withDg = previewSave(withElectricity, "dg", body({ not_used: true }));
    expect(of(withDg, "electricity").provisional).toBe(false);
  });

  it("uses a typed opening reading only when the save says the opening was typed", () => {
    const view = previewSave(
      viewOfContext(apolloMain()),
      "electricity",
      body({
        blocks: [
          { block_id: "main", final_reading: 10, opening_source: "typed", initial_reading: 4, mf: 100 },
          { block_id: "sindoori", final_reading: 37422.66, opening_source: "carried", initial_reading: 1 },
        ],
      }),
    );
    expect(of(view, "electricity").blocks.map((b: TrendContextBlock) => b.quantity)).toEqual([600, 2544]);
  });

  it("leaves a category the save does not touch exactly as the server stored it", () => {
    const stored = apolloMain();
    stored.categories[2] = { ...stored.categories[2], entered: true, consumption: 10, saving: 999, saving_pct: 99 };
    const view = previewSave(viewOfContext(stored), "electricity", ELECTRICITY_SAVE);
    expect(of(view, "diesel").saving).toBe(999);
  });

  it("gives a fuel saving equal to the baseline when none was used", () => {
    const view = previewSave(viewOfContext(apolloMain()), "diesel", body({ not_used: true }));
    expect(of(view, "diesel").saving).toBe(287.6);
  });

  it("takes a units block's consumption from the typed units", () => {
    const day = apolloMain();
    day.categories[0].blocks = [block({ block_id: "u1", entry_mode: "units" })];
    const view = previewSave(viewOfContext(day), "electricity", body({ blocks: [{ block_id: "u1", quantity: 9800 }] }));
    expect(of(view, "electricity").consumption).toBe(9800);
  });

  it("keeps a hand typed saving as typed, with no adjustment added", () => {
    const day = apolloMain();
    day.categories[0].manual_allowed = true;
    const view = previewSave(viewOfContext(day), "electricity", body({ manual_saving: -120.5 }));
    expect([of(view, "electricity").saving, of(view, "electricity").adjustment]).toEqual([-120.5, 0]);
  });

  it("works out an hourly PNG baseline from the run hours", () => {
    const day = apolloMain();
    day.categories.push(
      category({
        category: "png",
        label: "PNG",
        unit: "SCM",
        kind: "fuel",
        hourly: true,
        baseline: null,
        baseline_kind: "hourly",
        baseline_per_hour: 12.5,
        blocks: [block({ block_id: "p1", entry_mode: null })],
      }),
    );
    const view = previewSave(viewOfContext(day), "png", body({ run_hours: 8, blocks: [{ block_id: "p1", quantity: 60 }] }));
    expect([of(view, "png").baseline, of(view, "png").saving]).toEqual([100, 40]);
  });

  it("counts the day complete once every category is entered", () => {
    let view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    view = previewSave(view, "dg", body({ not_used: true }));
    view = previewSave(view, "diesel", body({ not_used: true }));
    expect(view.status).toBe("complete");
  });
});

describe("mergeDay: what the phone lays over the server's day", () => {
  it("previews a pending entry", () => {
    const view = mergeDay(apolloMain(), [entry({})]);
    expect(of(view, "electricity").saving).toBe(9346.18);
  });

  it("marks a pending entry as not sent", () => {
    const view = mergeDay(apolloMain(), [entry({})]);
    expect(of(view, "electricity").sync).toBe("pending");
  });

  it("keeps the server's figures when the server refused the entry", () => {
    const view = mergeDay(apolloMain(), [entry({ sync_status: "failed", last_error: "Closing reading is below opening" })]);
    expect(of(view, "electricity").entered).toBe(false);
  });

  it("carries the refused entry as the draft to fix, with the server's reason", () => {
    const view = mergeDay(apolloMain(), [entry({ sync_status: "failed", last_error: "Closing reading is below opening" })]);
    expect([of(view, "electricity").draft, of(view, "electricity").sync_error]).toEqual([
      ELECTRICITY_SAVE,
      "Closing reading is below opening",
    ]);
  });

  it("leaves only a notice for an entry a newer save replaced", () => {
    const view = mergeDay(apolloMain(), [entry({ sync_status: "replaced", last_error: "Replaced by a newer save by Ravi" })]);
    expect([of(view, "electricity").sync, of(view, "electricity").draft, of(view, "electricity").entered]).toEqual([
      "replaced",
      null,
      false,
    ]);
  });

  it("adds nothing for an entry the server already stored", () => {
    const view = mergeDay(apolloMain(), [entry({ sync_status: "synced" })]);
    expect(of(view, "electricity").sync).toBeNull();
  });

  it("ignores entries of another day", () => {
    const view = mergeDay(apolloMain(), [entry({ entry_date: "2026-11-14" })]);
    expect(of(view, "electricity").entered).toBe(false);
  });

  it("ignores entries of another site", () => {
    const view = mergeDay(apolloMain(), [entry({ site_code: "OTHER" })]);
    expect(of(view, "electricity").entered).toBe(false);
  });
});

describe("carryFromPhone: tomorrow's opening from today's unsent entry (AC-44)", () => {
  /** 16 Nov as the phone cached it before 15 Nov was entered: openings are still the 14th's. */
  function tomorrow(): TrendDayContext {
    return { ...apolloMain(), date: "2026-11-16", is_sunday: false };
  }

  it("takes the opening reading from the unsent entry of the day before", () => {
    const day = carryFromPhone(tomorrow(), [entry({})]);
    expect(day.categories[0].blocks.map((b) => b.opening_reading)).toEqual([53073.41, 37422.66]);
  });

  it("dates the opening reading to the day it was entered", () => {
    const day = carryFromPhone(tomorrow(), [entry({})]);
    expect(day.categories[0].blocks[0].opening_date).toBe(DAY);
  });

  it("carries a factor the unsent entry changed", () => {
    const changed = entry({
      body: body({
        blocks: [
          { block_id: "main", final_reading: 53073.41, opening_source: "carried", mf: 1500 },
          { block_id: "sindoori", final_reading: 37422.66, opening_source: "carried" },
        ],
      }),
    });
    expect(carryFromPhone(tomorrow(), [changed]).categories[0].blocks[0].mf).toBe(1500);
  });

  it("gives no opening reading after a day of typed units, as the server does", () => {
    const units = entry({ body: body({ blocks: [{ block_id: "main", quantity: 9800 }] }) });
    expect(carryFromPhone(tomorrow(), [units]).categories[0].blocks[0].opening_reading).toBeNull();
  });

  it("does not use an entry the server refused", () => {
    const day = carryFromPhone(tomorrow(), [entry({ sync_status: "failed" })]);
    expect(day.categories[0].blocks[0].opening_reading).toBe(53064.46);
  });

  it("keeps the server's carry when it is as new as the phone's entry", () => {
    const fresh = tomorrow();
    fresh.categories[0].blocks = fresh.categories[0].blocks.map((b) => ({
      ...b,
      opening_reading: 60000,
      opening_date: DAY,
      carried_from: DAY,
    }));
    expect(carryFromPhone(fresh, [entry({})]).categories[0].blocks[0].opening_reading).toBe(60000);
  });

  it("leaves a block that already has a row on that day alone", () => {
    const saved = tomorrow();
    saved.categories[0].blocks[0] = { ...saved.categories[0].blocks[0], typed: false, opening_reading: 1, final_reading: 2 };
    expect(carryFromPhone(saved, [entry({})]).categories[0].blocks[0].opening_reading).toBe(1);
  });

  it("uses the latest of several unsent days", () => {
    const older = entry({
      entry_date: "2026-11-14",
      body: body({ blocks: [{ block_id: "main", final_reading: 53064.46, opening_source: "carried" }] }),
    });
    const day = carryFromPhone({ ...tomorrow(), date: "2026-11-17" }, [older, entry({})]);
    expect(day.categories[0].blocks[0].opening_reading).toBe(53073.41);
  });
});

describe("savingSummary: what the footer says (AC-42)", () => {
  const saved = () => of(previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE), "electricity");

  it("says how far above the target the saving is", () => {
    expect(savingSummary(saved()).note).toBe("1,788.52 kWh above the 21% target");
  });

  it("is on target when saved % is at or above target %", () => {
    expect(savingSummary(saved()).tone).toBe("ok");
  });

  it("says how far below the target the saving is", () => {
    expect(savingSummary({ ...saved(), saving: 5000, saving_pct: 13.89 }).note).toBe("2,557.66 kWh below the 21% target");
  });

  it("warns when the saving is below target", () => {
    expect(savingSummary({ ...saved(), saving: 5000, saving_pct: 13.89 }).tone).toBe("warn");
  });

  it("keeps the saving % of a day over baseline below zero", () => {
    expect(savingSummary({ ...saved(), saving: -1011.83, saving_pct: -2.84 }).saving_pct).toBe(-2.84);
  });

  it("writes a negative percentage with the same minus sign as a negative figure", () => {
    expect([formatPct(-2.84), formatIndian(-1011.83)]).toEqual(["−2.84%", "−1,011.83"]);
  });

  it("writes a percentage that rounds to zero with no sign", () => {
    expect(formatPct(-0.001)).toBe("0.00%");
  });

  it("says how far over baseline a negative saving is", () => {
    expect(savingSummary({ ...saved(), saving: -250.5, saving_pct: -0.7 }).note).toBe("250.50 kWh over baseline");
  });

  it("asks for the readings still to enter", () => {
    expect(savingSummary(saved(), { missing: 2 }).note).toBe("Enter 2 readings to see savings");
  });

  it("asks to fix a single wrong reading", () => {
    expect(savingSummary(saved(), { missing: 1, fixing: true }).note).toBe("Fix 1 reading to see savings");
  });

  it("treats a negative target like any other: met when saved % is at or above it", () => {
    expect(savingSummary({ ...saved(), target_pct: -4.2, target: -1511.53, saving: 100, saving_pct: 0.28 }).tone).toBe("ok");
  });

  it("shows no percentage when there is no baseline", () => {
    expect(savingSummary({ ...saved(), baseline: null }).saving_pct).toBeNull();
  });

  it("places no target tick for a negative target", () => {
    expect(savingSummary({ ...saved(), target_pct: -4.2 }).target_mark_pct).toBeNull();
  });
});

describe("words on the screens", () => {
  it("names yesterday in the reading check", () => {
    expect(lowerThanOpeningMessage(53064.46, "2026-11-14", DAY)).toBe("Lower than yesterday’s 53,064.46. Check the meter.");
  });

  it("does not call an older reading yesterday's", () => {
    expect(lowerThanOpeningMessage(53064.46, "2026-11-12", DAY)).toBe(
      "Lower than the opening reading 53,064.46. Check the meter.",
    );
  });

  it("labels an opening carried from the day before as Yesterday", () => {
    expect(openingLabel("2026-11-14", DAY)).toBe("Yesterday");
  });

  it("labels an opening carried across a gap with its date", () => {
    expect(openingLabel("2026-11-12", DAY)).toBe("12 Nov");
  });

  it("writes the factor line with the net adjustment", () => {
    expect(factorLine({ mf: 800, add_adjustment: 4624.8, deduct_adjustment: 1873.5, entry_mode: "readings" })).toBe(
      "× 800, adjustment +2,751.30",
    );
  });

  it("writes the factor line with no adjustment", () => {
    expect(factorLine({ mf: 3000, add_adjustment: 0, deduct_adjustment: 0, entry_mode: "readings" })).toBe(
      "× 3,000, no adjustment",
    );
  });

  it("leaves the factor out for a units block", () => {
    expect(factorLine({ mf: null, add_adjustment: 0, deduct_adjustment: 132, entry_mode: "units" })).toBe("Adjustment −132.00");
  });

  it("describes an entered Electricity row by its meters", () => {
    const view = previewSave(viewOfContext(apolloMain()), "electricity", ELECTRICITY_SAVE);
    expect(categorySubtitle(of(view, "electricity"))).toBe("29,394 kWh from 2 meters");
  });

  it("shows a DG that did not run as zero", () => {
    const view = previewSave(viewOfContext(apolloMain()), "dg", body({ not_used: true }));
    expect(categorySubtitle(of(view, "dg"))).toBe(`0 ${of(view, "dg").unit}`);
  });

  it("keeps short capital labels as they are inside a sentence", () => {
    expect([inSentence("DG"), inSentence("PNG"), inSentence("Diesel"), inSentence("Bio-Diesel")]).toEqual([
      "DG",
      "PNG",
      "diesel",
      "bio-diesel",
    ]);
  });
});

describe("numbers", () => {
  it("groups digits the Indian way", () => {
    expect(formatIndian(1221571.9)).toBe("12,21,571.90");
  });

  it("leaves numbers under a thousand ungrouped", () => {
    expect(formatIndian(287.6)).toBe("287.60");
  });

  it("drops trailing zeros when asked", () => {
    expect(formatIndian(29394, 0, 2)).toBe("29,394");
  });

  it("shows a minus sign for a negative number", () => {
    expect(formatIndian(-132)).toBe("−132.00");
  });

  it("always signs an adjustment", () => {
    expect([formatSigned(2751.3), formatSigned(-132), formatSigned(0)]).toEqual(["+2,751.30", "−132.00", "+0.00"]);
  });

  it("reads a typed number with separators", () => {
    expect(parseTyped("53,073.41")).toEqual({ state: "ok", value: 53073.41 });
  });

  it("tells an empty field from a wrong one", () => {
    expect([parseTyped("  ").state, parseTyped("12a").state]).toEqual(["empty", "invalid"]);
  });

  it("refuses a minus sign unless the field allows one", () => {
    expect([parseTyped("-5").state, parseTyped("-5", true)]).toEqual(["invalid", { state: "ok", value: -5 }]);
  });
});

describe("dates", () => {
  it("steps a date across a month end", () => {
    expect(addDaysYmd("2026-11-30", 1)).toBe("2026-12-01");
  });

  it("steps a date back across a year start", () => {
    expect(addDaysYmd("2027-01-01", -1)).toBe("2026-12-31");
  });

  it("knows 29 February in a leap year", () => {
    expect(addDaysYmd("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("gives the seven days ending today, oldest first", () => {
    expect(lastSevenDays(DAY)).toEqual([
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
    ]);
  });

  it("knows 15 Nov 2026 is a Sunday", () => {
    expect(weekdayOfYmd(DAY)).toBe(0);
  });

  it("steps a month across a year end", () => {
    expect(addMonthsYm("2026-12", 1)).toBe("2027-01");
  });

  it("names a month", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});

describe("firstSkippedDay", () => {
  const none = new Set<string>();

  it("finds the day after the last one entered", () => {
    expect(firstSkippedDay("2026-11-22", "2026-11-25", none)).toBe("2026-11-23");
  });

  it("finds nothing when the day before was the last one entered", () => {
    expect(firstSkippedDay("2026-11-24", "2026-11-25", none)).toBeNull();
  });

  it("skips over days this phone holds", () => {
    expect(firstSkippedDay("2026-11-22", "2026-11-25", new Set(["2026-11-23"]))).toBe("2026-11-24");
  });

  it("finds nothing when the phone holds every day between", () => {
    expect(firstSkippedDay("2026-11-22", "2026-11-25", new Set(["2026-11-23", "2026-11-24"]))).toBeNull();
  });

  it("finds nothing on a category's first day", () => {
    expect(firstSkippedDay(null, "2026-11-25", none)).toBeNull();
  });

  it("finds nothing when the server did not say", () => {
    expect(firstSkippedDay(undefined, "2026-11-25", none)).toBeNull();
  });

  it("crosses a month end", () => {
    expect(firstSkippedDay("2026-10-30", "2026-11-02", none)).toBe("2026-10-31");
  });
});

describe("relativeDayLabel", () => {
  it.each([
    ["2026-11-25", "Today"],
    ["2026-11-24", "Yesterday"],
    ["2026-11-23", "2 days ago"],
    ["2026-10-31", "25 days ago"],
  ])("calls %s %s on 25 Nov", (date, label) => {
    expect(relativeDayLabel(date, "2026-11-25")).toBe(label);
  });
});

describe("gaugeScale", () => {
  it("never goes below 5 % so a tiny saving still has room", () => {
    expect(gaugeScale(0.19, -2.9)).toBe(5);
  });

  it("rounds up to the next step with headroom over the larger figure", () => {
    expect(gaugeScale(2.38, 8)).toBe(10);
  });

  it("keeps the target on the scale when it is above the saving", () => {
    expect(gaugeScale(4, 20)).toBe(25);
  });

  it("ignores a loss and a missing figure", () => {
    expect(gaugeScale(-10.9, null)).toBe(5);
  });

  it("caps at 100 %", () => {
    expect(gaugeScale(100, 100)).toBe(100);
  });
});
