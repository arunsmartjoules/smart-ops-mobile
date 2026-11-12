// Incidents can name several assets (2026-11): the read fallback for rows from
// before the list existed, the list clean-up, and how the RCA flows keep
// `asset_locations` and its primary `asset_location` in step.
import {
  assetFields,
  cleanAssetList,
  incidentAssets,
  toggleAsset,
} from "../utils/incidentAssets";
import { buildCreateFields, initialFields } from "../components/incidents/rcaCreateLib";
import { isQuestionAnswered, validateRcaFields, withField } from "../components/incidents/rcaImportLib";
import type { RcaFields, RcaImportResult, RcaQuestion } from "../services/RcaImportService";

const fields = (over: Partial<RcaFields> = {}): RcaFields => ({
  site_code: "S1",
  asset_location: null,
  asset_locations: [],
  fault_symptom: "Motor tripping",
  fault_type: "Mechanical",
  severity: "Low",
  operating_condition: "Running",
  status: "Inprogress",
  incident_created_time: "2026-10-28T10:30",
  incident_updated_time: null,
  incident_resolved_time: null,
  immediate_action_taken: "",
  root_cause: "",
  corrective_action: "",
  preventive_action: "",
  remarks: "",
  vendor_tagged: "",
  raised_by: "",
  assigned_to: "user-1",
  ...over,
});

const assetQuestion: RcaQuestion = {
  id: "asset_location",
  field: "asset_location",
  kind: "asset",
  multiple: true,
  title: "Which equipment was affected?",
  required: true,
};

describe("incidentAssets", () => {
  it("reads the list when the server sent one", () => {
    expect(incidentAssets({ asset_location: "AHU-1", asset_locations: ["AHU-1", "AHU-2"] })).toEqual(["AHU-1", "AHU-2"]);
  });

  it("falls back to the single asset for a row from before the list existed", () => {
    expect(incidentAssets({ asset_location: "AHU-1", asset_locations: [] })).toEqual(["AHU-1"]);
  });

  it("falls back to the single asset when the list field is missing", () => {
    expect(incidentAssets({ asset_location: "AHU-1" })).toEqual(["AHU-1"]);
  });

  it("parses the JSON text the local cache stores", () => {
    expect(incidentAssets({ asset_location: "AHU-1", asset_locations: '["AHU-1","Pump 2"]' })).toEqual(["AHU-1", "Pump 2"]);
  });

  it("falls back when the cached text is an empty list", () => {
    expect(incidentAssets({ asset_location: "AHU-1", asset_locations: "[]" })).toEqual(["AHU-1"]);
  });

  it("returns nothing for a row with no asset at all", () => {
    expect(incidentAssets({ asset_location: null, asset_locations: null })).toEqual([]);
  });

  it("treats a blank single asset as none", () => {
    expect(incidentAssets({ asset_location: "   " })).toEqual([]);
  });
});

describe("cleanAssetList", () => {
  it("trims, drops blanks and duplicates, and keeps the order", () => {
    expect(cleanAssetList([" B ", "A", "", "B", 7, "A "])).toEqual(["B", "A"]);
  });

  it("stops at 50 like the server", () => {
    expect(cleanAssetList(Array.from({ length: 60 }, (_, i) => `A${i}`))).toHaveLength(50);
  });

  it("gives an empty list for unreadable cached text", () => {
    expect(cleanAssetList("[not json")).toEqual([]);
  });
});

describe("toggleAsset", () => {
  it("adds a new asset at the end so the primary stays first", () => {
    expect(toggleAsset(["AHU-1"], "AHU-2")).toEqual(["AHU-1", "AHU-2"]);
  });

  it("removes an asset that is already picked", () => {
    expect(toggleAsset(["AHU-1", "AHU-2"], "AHU-1")).toEqual(["AHU-2"]);
  });

  it("does not add past the limit", () => {
    expect(toggleAsset(["A", "B"], "C", 2)).toEqual(["A", "B"]);
  });
});

describe("assetFields", () => {
  it("sets the primary to the first asset", () => {
    expect(assetFields(["AHU-2", "AHU-1"])).toEqual({ asset_locations: ["AHU-2", "AHU-1"], asset_location: "AHU-2" });
  });

  it("clears the primary for an empty list", () => {
    expect(assetFields([])).toEqual({ asset_locations: [], asset_location: null });
  });
});

describe("withField (RCA answers)", () => {
  it("moves the primary with the list", () => {
    const out = withField(fields(), "asset_locations", ["Pump 1", "Pump 2"]);
    expect([out.asset_location, out.asset_locations]).toEqual(["Pump 1", ["Pump 1", "Pump 2"]]);
  });

  it("turns a single pick into a one-item list", () => {
    const out = withField(fields({ asset_locations: ["A", "B"], asset_location: "A" }), "asset_location", "C");
    expect([out.asset_location, out.asset_locations]).toEqual(["C", ["C"]]);
  });

  it("leaves other fields alone", () => {
    expect(withField(fields(), "fault_symptom", "New title").fault_symptom).toBe("New title");
  });
});

describe("asset question and validation", () => {
  it("is unanswered with no assets", () => {
    expect(isQuestionAnswered(assetQuestion, fields())).toBe(false);
  });

  it("is answered once one asset is picked", () => {
    expect(isQuestionAnswered(assetQuestion, fields({ asset_locations: ["AHU-1"], asset_location: "AHU-1" }))).toBe(true);
  });

  it("asks for the equipment when no asset is picked", () => {
    expect(validateRcaFields(fields()).asset_location).toBe("Please choose the affected equipment.");
  });

  it("accepts an older result that only has the single asset", () => {
    expect(validateRcaFields(fields({ asset_locations: undefined, asset_location: "AHU-1" })).asset_location).toBeUndefined();
  });
});

describe("Create RCA payload", () => {
  it("sends every asset and the first as the primary", () => {
    const out = buildCreateFields(fields({ asset_locations: ["AHU-1", "AHU-2"], asset_location: "AHU-1" }));
    expect([out.asset_locations, out.asset_location]).toEqual([["AHU-1", "AHU-2"], "AHU-1"]);
  });

  it("seeds the list from a result that only has the single asset", () => {
    const result = {
      fields: fields({ asset_locations: undefined, asset_location: "AHU-9" }),
      questions: [],
    } as unknown as RcaImportResult;
    expect(initialFields(result, "S1").asset_locations).toEqual(["AHU-9"]);
  });
});
