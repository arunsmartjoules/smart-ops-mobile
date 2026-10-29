// "Create RCA": the pure rules behind the wizard — what a section needs before
// the person can move on, the photo limits and the JPG/PNG check, and the exact
// payload sent to POST /api/incidents/rca-create.
import {
  CAPTION_MAX,
  PHOTOS_PER_SECTION,
  PHOTOS_TOTAL,
  SECTION_TEXT_MAX,
  buildCreateFields,
  buildSectionsPayload,
  checkPhotoAsset,
  collectProblems,
  filterTemplates,
  firstLine,
  initialFields,
  isSectionRequired,
  narrativeFromAnswers,
  photoKey,
  photoSlots,
  planPhotoAdds,
  sectionProblem,
  type AnswerMap,
  type PhotoItem,
  type SectionAnswer,
} from "../components/incidents/rcaCreateLib";
import type { RcaSection, RcaTemplate } from "../services/RcaCreateService";
import type { RcaFields, RcaImportResult } from "../services/RcaImportService";

const section = (over: Partial<RcaSection> = {}): RcaSection => ({
  id: "s1",
  title: "Root cause",
  prompt: "What was the root cause?",
  help: "The underlying reason.",
  kind: "text",
  maps_to: null,
  required: false,
  ...over,
});

const photo = (over: Partial<PhotoItem> = {}): PhotoItem => ({
  id: "p1",
  localUri: "file:///a.jpg",
  ext: "jpg",
  url: "https://bucket.example/incidents/S1/rca-create/a.jpg",
  caption: "",
  status: "done",
  ...over,
});

const answer = (over: Partial<SectionAnswer> = {}): SectionAnswer => ({ text: "", photos: [], ...over });

const fields = (over: Partial<RcaFields> = {}): RcaFields => ({
  site_code: "S1",
  asset_location: "AHU-3",
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

describe("sectionProblem", () => {
  it("blocks a required text section with no text", () => {
    expect(sectionProblem(section({ required: true }), answer())).toBe("Please answer “Root cause”.");
  });

  it("treats whitespace-only text as empty", () => {
    expect(sectionProblem(section({ required: true }), answer({ text: "  \n " }))).not.toBeNull();
  });

  it("lets a required text section through once it has text", () => {
    expect(sectionProblem(section({ required: true }), answer({ text: "Bearing failed" }))).toBeNull();
  });

  it("lets an optional section stay blank", () => {
    expect(sectionProblem(section(), undefined)).toBeNull();
  });

  it("always requires the closing remark, even when the template said optional", () => {
    const remarks = section({ maps_to: "remarks", required: false });
    expect(isSectionRequired(remarks)).toBe(true);
    expect(sectionProblem(remarks, answer())).not.toBeNull();
  });

  it("does not demand text from a required text_photos section's photos", () => {
    expect(sectionProblem(section({ kind: "text_photos", required: true }), answer({ text: "ok" }))).toBeNull();
  });

  it("requires at least one photo for a required photos section", () => {
    expect(sectionProblem(section({ kind: "photos", required: true }), answer())).toBe(
      "Please add at least one photo for “Root cause”.",
    );
  });

  it("accepts a required photos section with one uploaded photo", () => {
    expect(sectionProblem(section({ kind: "photos", required: true }), answer({ photos: [photo()] }))).toBeNull();
  });

  it("does not count a failed photo toward the required photo", () => {
    const a = answer({ photos: [photo({ status: "failed", url: null })] });
    expect(sectionProblem(section({ kind: "photos", required: true }), a)).toBe(
      "A photo didn't upload. Tap Retry on it, or remove it.",
    );
  });

  it("blocks moving on while a photo is uploading", () => {
    const a = answer({ text: "ok", photos: [photo({ status: "uploading", url: null })] });
    expect(sectionProblem(section({ kind: "text_photos" }), a)).toBe(
      "Please wait for the photos to finish uploading.",
    );
  });

  it("blocks text over the length limit", () => {
    const a = answer({ text: "x".repeat(SECTION_TEXT_MAX + 1) });
    expect(sectionProblem(section(), a)).toContain(String(SECTION_TEXT_MAX));
  });
});

describe("photo limits", () => {
  it("allows the per-section limit when the total has room", () => {
    expect(photoSlots(0, 0)).toBe(PHOTOS_PER_SECTION);
  });

  it("shrinks to what is left of the per-section limit", () => {
    expect(photoSlots(5, 5)).toBe(3);
  });

  it("is limited by the overall total when sections are nearly full", () => {
    expect(photoSlots(2, PHOTOS_TOTAL - 1)).toBe(1);
  });

  it("is zero when the section is full", () => {
    expect(photoSlots(PHOTOS_PER_SECTION, 8)).toBe(0);
  });

  it("is zero when the total is used up", () => {
    expect(photoSlots(0, PHOTOS_TOTAL)).toBe(0);
  });

  it("keeps only the photos that fit in the section, first come first kept", () => {
    const assets = Array.from({ length: 10 }, (_, i) => ({ uri: `file:///${i}.jpg`, mimeType: "image/jpeg" }));
    const plan = planPhotoAdds(assets, 0, 0);
    expect(plan.accepted.map((a) => a.uri)).toEqual(assets.slice(0, PHOTOS_PER_SECTION).map((a) => a.uri));
  });

  it("explains why photos beyond the section limit were left out", () => {
    const assets = Array.from({ length: 9 }, (_, i) => ({ uri: `file:///${i}.jpg`, mimeType: "image/jpeg" }));
    expect(planPhotoAdds(assets, 0, 0).messages).toEqual([
      `You can add up to ${PHOTOS_PER_SECTION} photos in each section.`,
    ]);
  });

  it("stops at the overall total", () => {
    const plan = planPhotoAdds([{ uri: "file:///a.jpg", mimeType: "image/jpeg" }], 0, PHOTOS_TOTAL);
    expect(plan.accepted).toEqual([]);
    expect(plan.messages).toEqual([`An RCA can have up to ${PHOTOS_TOTAL} photos in total.`]);
  });

  it("adds the good photos and reports the rejected one once", () => {
    const plan = planPhotoAdds(
      [
        { uri: "file:///a.jpg", mimeType: "image/jpeg" },
        { uri: "file:///b.webp", mimeType: "image/webp" },
        { uri: "file:///c.heic", mimeType: "image/heic" },
      ],
      0,
      0,
    );
    expect(plan.accepted).toHaveLength(1);
    expect(plan.messages).toEqual(["Please use a JPG or PNG photo."]);
  });
});

describe("checkPhotoAsset (JPG / PNG only)", () => {
  it("accepts a JPEG by mime type", () => {
    expect(checkPhotoAsset({ uri: "file:///x", mimeType: "image/jpeg" })).toEqual({ ok: true, ext: "jpg" });
  });

  it("accepts a PNG by mime type", () => {
    expect(checkPhotoAsset({ uri: "file:///x", mimeType: "image/png" })).toEqual({ ok: true, ext: "png" });
  });

  it("falls back to the file extension when there is no mime type", () => {
    expect(checkPhotoAsset({ uri: "file:///IMG_1.JPEG?x=1" })).toEqual({ ok: true, ext: "jpg" });
  });

  it.each(["image/webp", "image/heic", "image/gif"])("rejects %s", (mimeType) => {
    expect(checkPhotoAsset({ uri: "file:///x.jpg", mimeType })).toEqual({
      ok: false,
      error: "Please use a JPG or PNG photo.",
    });
  });

  it("trusts the mime type over a misleading file name", () => {
    expect(checkPhotoAsset({ uri: "file:///x.jpg", mimeType: "image/webp" }).ok).toBe(false);
  });

  it("rejects a file with no recognisable type", () => {
    expect(checkPhotoAsset({ uri: "file:///photo" }).ok).toBe(false);
  });

  it("rejects a photo over 5 MB", () => {
    const r = checkPhotoAsset({ uri: "file:///x.jpg", mimeType: "image/jpeg", fileSize: 5 * 1024 * 1024 + 1 });
    expect(r).toEqual({ ok: false, error: "That photo is larger than 5 MB. Please use a smaller one." });
  });

  it("accepts a photo of exactly 5 MB", () => {
    expect(checkPhotoAsset({ uri: "file:///x.jpg", mimeType: "image/jpeg", fileSize: 5 * 1024 * 1024 }).ok).toBe(true);
  });
});

describe("photoKey", () => {
  it("builds the contract's S3 key", () => {
    expect(photoKey("SITE1", "abc", "png")).toBe("incidents/SITE1/rca-create/abc.png");
  });
});

describe("buildSectionsPayload", () => {
  const sections = [
    section({ id: "s1", title: "What happened", kind: "text_photos", required: true }),
    section({ id: "s2", title: "Site photos", kind: "photos" }),
    section({ id: "s3", title: "Closing", kind: "text", maps_to: "remarks", required: false }),
  ];

  it("returns every section in order with its metadata echoed", () => {
    const out = buildSectionsPayload(sections, {});
    expect(out.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(out[0]).toMatchObject({ title: "What happened", prompt: "What was the root cause?", kind: "text_photos" });
  });

  it("marks the closing remark required in the payload", () => {
    expect(buildSectionsPayload(sections, {})[2]!.required).toBe(true);
  });

  it("sends only photos that finished uploading", () => {
    const answers: AnswerMap = {
      s1: answer({
        text: "x",
        photos: [
          photo({ id: "a" }),
          photo({ id: "b", status: "failed", url: null }),
          photo({ id: "c", status: "uploading", url: null }),
        ],
      }),
    };
    expect(buildSectionsPayload(sections, answers)[0]!.photos).toHaveLength(1);
  });

  it("trims text and cuts captions to the limit", () => {
    const answers: AnswerMap = {
      s1: answer({ text: "  hello  ", photos: [photo({ caption: `  ${"c".repeat(CAPTION_MAX + 20)}  ` })] }),
    };
    const s1 = buildSectionsPayload(sections, answers)[0]!;
    expect(s1.text).toBe("hello");
    expect(s1.photos[0]!.caption).toHaveLength(CAPTION_MAX);
  });

  it("drops text from a photos-only section", () => {
    expect(buildSectionsPayload(sections, { s2: answer({ text: "stray" }) })[1]!.text).toBe("");
  });

  it("drops photos from a text-only section", () => {
    expect(buildSectionsPayload(sections, { s3: answer({ text: "done", photos: [photo()] }) })[2]!.photos).toEqual([]);
  });
});

describe("narrativeFromAnswers", () => {
  it("joins every section that maps to the same column with a blank line", () => {
    const secs = [
      section({ id: "s1", maps_to: "root_cause" }),
      section({ id: "s2", maps_to: "root_cause" }),
      section({ id: "s3", maps_to: null }),
    ];
    const out = narrativeFromAnswers(secs, {
      s1: answer({ text: "Part one" }),
      s2: answer({ text: "Part two" }),
      s3: answer({ text: "ignored" }),
    });
    expect(out.root_cause).toBe("Part one\n\nPart two");
  });

  it("leaves columns with no answer empty", () => {
    expect(narrativeFromAnswers([section({ maps_to: "remarks" })], {}).remarks).toBe("");
  });
});

describe("buildCreateFields", () => {
  it("converts the three local times to ISO instants", () => {
    const out = buildCreateFields(
      fields({
        status: "Resolved",
        incident_created_time: "2026-10-28T10:30",
        incident_updated_time: "2026-10-28T11:00",
        incident_resolved_time: "2026-10-28T12:15",
      }),
    );
    expect([out.incident_created_time, out.incident_updated_time, out.incident_resolved_time]).toEqual([
      new Date(2026, 9, 28, 10, 30).toISOString(),
      new Date(2026, 9, 28, 11, 0).toISOString(),
      new Date(2026, 9, 28, 12, 15).toISOString(),
    ]);
  });

  it("sends no resolved time for an in-progress incident", () => {
    const out = buildCreateFields(fields({ status: "Inprogress", incident_resolved_time: "2026-10-28T12:15" }));
    expect(out.incident_resolved_time).toBeNull();
  });

  it("leaves the narrative columns to the sections", () => {
    const out = buildCreateFields(fields({ root_cause: "should not be sent", remarks: "nor this" }));
    expect(Object.keys(out)).not.toEqual(expect.arrayContaining(["root_cause"]));
  });

  it("trims the title and turns a blank asset into null", () => {
    const out = buildCreateFields(fields({ fault_symptom: "  Tripping  ", asset_location: "   " }));
    expect([out.fault_symptom, out.asset_location]).toEqual(["Tripping", null]);
  });
});

describe("collectProblems", () => {
  const secs = [
    section({ id: "s1", kind: "text", required: true }),
    section({ id: "s2", title: "Closing", kind: "text", maps_to: "remarks" }),
  ];

  it("reports nothing when everything is answered", () => {
    const answers: AnswerMap = { s1: answer({ text: "a" }), s2: answer({ text: "b" }) };
    expect(collectProblems(fields(), secs, answers)).toEqual([]);
  });

  it("sends a missing closing remark to its section, not to a details question", () => {
    const problems = collectProblems(fields({ status: "Resolved", incident_resolved_time: "2026-10-28T12:00" }), secs, {
      s1: answer({ text: "a" }),
    });
    expect(problems.find((p) => p.key === "remarks")?.target).toEqual({ type: "section", id: "s2" });
  });

  it("lists details problems before section problems", () => {
    const problems = collectProblems(fields({ assigned_to: null }), secs, {});
    expect(problems.map((p) => p.target.type)).toEqual(["field", "section", "section"]);
  });

  it("flags an unanswered enum the server starts blank", () => {
    const blank = fields({ fault_type: "" as RcaFields["fault_type"] });
    const answers: AnswerMap = { s1: answer({ text: "a" }), s2: answer({ text: "b" }) };
    expect(collectProblems(blank, secs, answers).map((p) => p.key)).toEqual(["fault_type"]);
  });
});

describe("initialFields", () => {
  const result = {
    fields: fields({ status: "" as RcaFields["status"], site_code: "" }),
    questions: [
      {
        id: "status",
        field: "status",
        kind: "choice",
        title: "Status",
        required: true,
        options: [
          { value: "Resolved", label: "Resolved", recommended: true },
          { value: "Inprogress", label: "In progress" },
        ],
      },
    ],
  } as unknown as RcaImportResult;

  it("selects the recommended choice", () => {
    expect(initialFields(result, "S1").status).toBe("Resolved");
  });

  it("falls back to the chosen site when the server left it blank", () => {
    expect(initialFields(result, "S1").site_code).toBe("S1");
  });
});

describe("template list helpers", () => {
  const tpl = (over: Partial<RcaTemplate>): RcaTemplate => ({
    incident_id: "INC-1",
    site_code: "S1",
    site_name: "Sunshine",
    fault_symptom: "Chiller trip",
    file_url: "https://x/y.pdf",
    file_name: "RCA chiller.pdf",
    created_at: null,
    ...over,
  });

  it("returns everything for an empty search", () => {
    expect(filterTemplates([tpl({}), tpl({ incident_id: "INC-2" })], "  ")).toHaveLength(2);
  });

  it("matches on file name, incident id, site or title, ignoring case", () => {
    const list = [tpl({}), tpl({ incident_id: "INC-2", file_name: "Pump.pdf", site_name: "KIMS", fault_symptom: "Leak" })];
    expect(filterTemplates(list, "kims").map((t) => t.incident_id)).toEqual(["INC-2"]);
  });

  it("takes the first non-empty line, shortened", () => {
    expect(firstLine("\n  First line here  \nsecond", 8)).toBe("First l…");
  });
});
