/**
 * The app runtime's TextDecoder only knows UTF-8; jsPDF's PNG helper asks for
 * "latin1" at load time. Simulate that runtime, then load the shim.
 */
const RealDecoder = globalThis.TextDecoder;

class Utf8OnlyDecoder extends RealDecoder {
  constructor(label = "utf-8", options?: TextDecoderOptions) {
    if (!["utf-8", "utf8"].includes(String(label).toLowerCase())) {
      throw new RangeError(`Unknown encoding: ${label} (normalized: ${label})`);
    }
    super(label, options);
  }
}

describe("latin1TextDecoder shim", () => {
  beforeAll(() => {
    globalThis.TextDecoder = Utf8OnlyDecoder as unknown as typeof TextDecoder;
    jest.isolateModules(() => {
      require("../utils/latin1TextDecoder");
    });
  });

  afterAll(() => {
    globalThis.TextDecoder = RealDecoder;
  });

  it("decodes latin1 bytes to the same code points", () => {
    const bytes = new Uint8Array([0x4b, 0xe9, 0xb0, 0xff]);
    expect(new TextDecoder("latin1").decode(bytes)).toBe("Ké°ÿ");
  });

  it("still decodes UTF-8 through the native decoder", () => {
    const bytes = new TextEncoder().encode("°C ✓");
    expect(new TextDecoder("utf-8").decode(bytes)).toBe("°C ✓");
  });
});
