import { isForeignCategorySiteLog } from "../utils/siteLogCategory";

describe("isForeignCategorySiteLog", () => {
  it("flags a Water row seeded from a Temp RH shift", () => {
    expect(
      isForeignCategorySiteLog({ log_name: "Water", meta_date: "Temp RH (1/3) - 03-11-2026" }),
    ).toBe(true);
  });

  it("keeps a Water row seeded from the Water slot", () => {
    expect(isForeignCategorySiteLog({ log_name: "Water", meta_date: "Water - 03-11-2026" })).toBe(false);
  });

  it("keeps a Temp RH row from its own shift", () => {
    expect(
      isForeignCategorySiteLog({ log_name: "Temp RH", meta_date: "Temp RH (3/3) - 03-11-2026" }),
    ).toBe(false);
  });

  it("treats Water aliases as Water", () => {
    expect(
      isForeignCategorySiteLog({ log_name: "Water Monitoring", meta_date: "Water - 03-11-2026" }),
    ).toBe(false);
  });

  it("keeps a row with no schedule label", () => {
    expect(isForeignCategorySiteLog({ log_name: "Water", meta_date: null })).toBe(false);
  });

  it("keeps a row whose label it can't read", () => {
    expect(isForeignCategorySiteLog({ log_name: "Water", meta_date: "Daily round" })).toBe(false);
  });
});
