import { describeChillerLock, describeLogLock } from "../components/sitelogs/completionGate";

describe("describeLogLock", () => {
  it("lets a fully filled log through", () => {
    expect(describeLogLock({ type: "TempRH", loading: false, total: 14, filled: 14 })).toBeNull();
  });

  it("explains rooms still missing Temp and RH", () => {
    expect(describeLogLock({ type: "TempRH", loading: false, total: 14, filled: 12 })).toBe(
      "2 of 14 rooms still need both Temp and RH.",
    );
  });

  it("explains a water point still empty", () => {
    expect(describeLogLock({ type: "Water", loading: false, total: 1, filled: 0 })).toBe(
      "1 of 1 room still need at least one of TDS, pH or hardness.",
    );
  });

  it("explains an empty room list instead of staying silent", () => {
    expect(describeLogLock({ type: "Chemical", loading: false, total: 0, filled: 0 })).toMatch(
      /No rooms are loaded .* Pull down to refresh/,
    );
  });

  it("asks for patience while rooms are loading", () => {
    expect(describeLogLock({ type: "TempRH", loading: true, total: 0, filled: 0 })).toMatch(/Still loading/);
  });
});

describe("describeChillerLock", () => {
  it("lets a complete form through", () => {
    expect(describeChillerLock({ hasChiller: true, missing: [] })).toBeNull();
  });

  it("asks for the chiller first", () => {
    expect(describeChillerLock({ hasChiller: false, missing: ["load"] })).toBe("Select the chiller first.");
  });

  it("names the empty readings by their on-screen labels", () => {
    expect(describeChillerLock({ hasChiller: true, missing: ["inlineBtuMeter"] })).toBe(
      "1 required reading is still empty: BTU Meter.",
    );
  });

  it("truncates a long list of empty readings", () => {
    const missing = ["condenserInletTemp", "condenserOutletTemp", "evaporatorInletTemp", "evaporatorOutletTemp", "load", "inlineBtuMeter"];
    expect(describeChillerLock({ hasChiller: true, missing })).toBe(
      "6 required readings are still empty: Cond. Inlet, Cond. Outlet, Evap. Inlet, Evap. Outlet and 2 more.",
    );
  });
});
