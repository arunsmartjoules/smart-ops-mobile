// PM list search on the device: word-by-word over asset name / type (same rule
// as the server's PM search), with whole-number matching and the old
// separator-insensitive substring match kept as a fallback.
import { pmSearchMatcher, searchWords } from "../utils/pmSearch";

const linac = ["KBLR /UBF-B/LINAC UPS CSU DX - 2", "CSU NC", "CSU NC Monthly Maintenance"];
const matches = (query: string, fields: string[]) => pmSearchMatcher(query)?.(fields) ?? false;

describe("searchWords", () => {
  it("splits letter↔digit runs so OT1 equals OT 1", () => {
    expect(searchWords("OT1")).toEqual(["ot", "1"]);
  });
});

describe("pmSearchMatcher", () => {
  it("finds words that are not next to each other in the asset name", () => {
    expect(matches("linac csu", linac)).toBe(true);
  });

  it("combines asset name and asset type words", () => {
    expect(matches("ubf csu nc", linac)).toBe(true);
  });

  it("matches words in any order", () => {
    expect(matches("csu linac", linac)).toBe(true);
  });

  it("rejects a PM missing one of the words", () => {
    expect(matches("linac ahu", linac)).toBe(false);
  });

  it("matches a number glued to letters", () => {
    expect(matches("ot 1", ["KMN/F-04/AHU-01/OT1", "AHU"])).toBe(true);
  });

  it("does not count a number inside a bigger one as that word", () => {
    expect(matches("ot 1", ["KHM/F3/OT 4/F 10", "AHU"])).toBe(false);
  });

  it("keeps the separator-insensitive substring match", () => {
    expect(matches("inac", linac)).toBe(true);
  });

  it("returns no matcher for an empty query", () => {
    expect(pmSearchMatcher(" - ")).toBeNull();
  });
});
