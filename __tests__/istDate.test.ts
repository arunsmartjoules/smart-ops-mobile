// IST date helpers run once per row over whole cached lists (PM list search
// and status counts), so they must reuse their Intl formatters: building one
// per call froze the JS thread for seconds on Hermes Android.

import { formatIST, istDateString, istParts } from "../utils/istDate";

type IstDate = typeof import("../utils/istDate");

/** A fresh copy of the module (empty formatter cache) with Intl.DateTimeFormat counted. */
function loadCounting(): { ist: IstDate; constructed: () => number } {
  const spy = jest.spyOn(Intl, "DateTimeFormat");
  let ist!: IstDate;
  jest.isolateModules(() => {
    ist = require("../utils/istDate");
  });
  spy.mockClear();
  return { ist, constructed: () => spy.mock.calls.length };
}

afterEach(() => {
  jest.restoreAllMocks();
});

const rows = Array.from({ length: 200 }, (_, i) => Date.UTC(2026, 10, 1) + i * 3_600_000);

describe("formatter reuse", () => {
  it("builds the istDateString formatter once across many rows", () => {
    const { ist, constructed } = loadCounting();
    rows.forEach((ms) => ist.istDateString(ms));
    expect(constructed()).toBe(1);
  });

  it("builds the istParts formatter once across many rows", () => {
    const { ist, constructed } = loadCounting();
    rows.forEach((ms) => ist.istParts(ms));
    expect(constructed()).toBe(1);
  });

  it("builds one formatIST formatter per distinct option set", () => {
    const { ist, constructed } = loadCounting();
    rows.forEach((ms) => {
      ist.formatIST(ms, { day: "numeric", month: "short" });
      ist.formatIST(ms, { day: "numeric", month: "short", year: "numeric" });
    });
    expect(constructed()).toBe(2);
  });

  it("builds the formatter once for pmStatusKey style day starts", () => {
    const { ist, constructed } = loadCounting();
    rows.forEach((ms) => ist.istDayStartMs(ms));
    expect(constructed()).toBe(1);
  });
});

describe("IST results are unchanged", () => {

  it("rolls the calendar day at 00:00 IST, not UTC midnight", () => {
    expect(istDateString(Date.parse("2026-11-12T18:30:00.000Z"))).toBe("2026-11-13");
  });

  it("keeps the previous day one millisecond before 00:00 IST", () => {
    expect(istDateString(Date.parse("2026-11-12T18:29:59.999Z"))).toBe("2026-11-12");
  });

  it("reports IST clock parts", () => {
    expect(istParts(Date.parse("2026-11-12T18:30:05.000Z"))).toEqual({
      year: 2026,
      month: 11,
      day: 13,
      hour: 0,
      minute: 0,
      second: 5,
    });
  });

  it("keeps different option sets apart", () => {
    const ms = Date.parse("2026-11-12T18:30:00.000Z");
    expect([
      formatIST(ms, { day: "numeric", month: "short" }),
      formatIST(ms, { day: "numeric", month: "short", year: "numeric" }),
    ]).toEqual(["13 Nov", "13 Nov 2026"]);
  });

  it("returns an empty string for an invalid date", () => {
    expect(istDateString("not a date")).toBe("");
  });
});
