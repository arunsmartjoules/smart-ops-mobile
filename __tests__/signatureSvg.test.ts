import {
  SIGNATURE_DATA_URI_PREFIX,
  addPoint,
  asciiToBase64,
  buildSignatureDataUri,
  hasInk,
  strokeToPath,
  type Stroke,
} from "../utils/signatureSvg";

const decode = (uri: string) =>
  Buffer.from(uri.slice(SIGNATURE_DATA_URI_PREFIX.length), "base64").toString("ascii");

/** A realistic 3-stroke signature: ~2s of 60Hz pan events per stroke. */
function realisticSignature(): Stroke[] {
  const strokes: Stroke[] = [];
  for (let s = 0; s < 3; s += 1) {
    let stroke: Stroke = [];
    for (let i = 0; i < 120; i += 1) {
      const x = 20 + s * 90 + i * 0.7 + Math.sin(i / 5) * 12;
      const y = 120 + Math.cos(i / 7 + s) * 40;
      stroke = addPoint(stroke, x, y);
    }
    strokes.push(stroke);
  }
  return strokes;
}

describe("addPoint", () => {
  it("rounds to whole pixels", () => {
    expect(addPoint([], 10.6, 20.2)).toEqual([11, 20]);
  });

  it("skips a point too close to the previous one", () => {
    const stroke = [10, 10];
    expect(addPoint(stroke, 11, 10)).toBe(stroke);
  });

  it("keeps a point far enough from the previous one", () => {
    expect(addPoint([10, 10], 13, 10)).toEqual([10, 10, 13, 10]);
  });
});

describe("strokeToPath", () => {
  it("uses relative segments after the first point", () => {
    expect(strokeToPath([10, 10, 13, 8, 15, 12])).toBe("M10 10l3-2 2 4");
  });

  it("draws a single tap as a dot", () => {
    expect(strokeToPath([5, 6])).toBe("M5 6l0 0");
  });
});

describe("hasInk", () => {
  it("is false for no strokes", () => {
    expect(hasInk([[]])).toBe(false);
  });
});

describe("asciiToBase64", () => {
  it.each(["", "a", "ab", "abc", "<svg viewBox=\"0 0 1 1\"/>"])("matches Buffer for %p", (s) => {
    expect(asciiToBase64(s)).toBe(Buffer.from(s, "ascii").toString("base64"));
  });
});

describe("buildSignatureDataUri", () => {
  it("produces an SVG data URI", () => {
    expect(buildSignatureDataUri([[10, 10, 20, 20]], 300, 200).startsWith(SIGNATURE_DATA_URI_PREFIX)).toBe(true);
  });

  it("embeds the drawn path", () => {
    expect(decode(buildSignatureDataUri([[10, 10, 20, 20]], 300, 200))).toContain('d="M10 10l10 10"');
  });

  it("uses the pad size as the viewBox", () => {
    expect(decode(buildSignatureDataUri([[10, 10, 20, 20]], 300, 200))).toContain('viewBox="0 0 300 200"');
  });

  it("never clips ink when the pad size is unknown", () => {
    expect(decode(buildSignatureDataUri([[10, 10, 250, 90]], 0, 0))).toContain('viewBox="0 0 254 94"');
  });

  it("keeps a realistic signature small", () => {
    expect(buildSignatureDataUri(realisticSignature(), 340, 260).length).toBeLessThan(8_000);
  });

  it("caps a very long scribble at 24 KB", () => {
    let stroke: Stroke = [];
    for (let i = 0; i < 20_000; i += 1) stroke = addPoint(stroke, (i * 7) % 340, (i * 13) % 260);
    expect(buildSignatureDataUri([stroke], 340, 260).length).toBeLessThanOrEqual(24_000);
  });
});
