/**
 * Teach the runtime's TextDecoder "latin1" (and its aliases).
 *
 * Hermes / the Expo TextDecoder only decode UTF-8, but `fast-png` (pulled in
 * by jsPDF) runs `new TextDecoder("latin1")` as soon as it loads — which
 * throws "Unknown encoding: latin1" and takes the importing screen down with
 * it. Latin-1 maps every byte to the code point of the same value, so it can
 * be decoded directly; every other encoding is passed to the native decoder.
 *
 * Import this before anything that loads jsPDF. It is a no-op where latin1 is
 * already supported.
 */
const LATIN1_LABELS = new Set([
  "latin1",
  "l1",
  "iso-8859-1",
  "iso8859-1",
  "iso_8859-1",
  "ascii",
  "us-ascii",
  "windows-1252",
  "cp1252",
]);

type DecoderCtor = typeof TextDecoder;

const Native: DecoderCtor | undefined = (globalThis as { TextDecoder?: DecoderCtor }).TextDecoder;

function nativeSupportsLatin1(): boolean {
  if (!Native) return false;
  try {
    new Native("latin1");
    return true;
  } catch {
    return false;
  }
}

function toBytes(input?: ArrayBuffer | ArrayBufferView | null): Uint8Array {
  if (!input) return new Uint8Array(0);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
}

if (!nativeSupportsLatin1()) {
  class Latin1AwareTextDecoder {
    readonly encoding: string;
    readonly fatal: boolean;
    readonly ignoreBOM: boolean;
    private readonly inner: TextDecoder | null;

    constructor(label: string = "utf-8", options?: TextDecoderOptions) {
      const normalized = String(label).trim().toLowerCase();
      if (LATIN1_LABELS.has(normalized)) {
        this.inner = null;
        // The WHATWG spec maps all of these labels to windows-1252.
        this.encoding = "windows-1252";
        this.fatal = Boolean(options?.fatal);
        this.ignoreBOM = Boolean(options?.ignoreBOM);
      } else {
        if (!Native) throw new RangeError(`Unknown encoding: ${label}`);
        this.inner = new Native(label, options);
        this.encoding = this.inner.encoding;
        this.fatal = this.inner.fatal;
        this.ignoreBOM = this.inner.ignoreBOM;
      }
    }

    decode(input?: ArrayBuffer | ArrayBufferView | null, options?: TextDecodeOptions): string {
      if (this.inner) return this.inner.decode(input ?? undefined, options);
      const bytes = toBytes(input);
      let out = "";
      // Chunked so very large buffers don't overflow the argument limit.
      for (let i = 0; i < bytes.length; i += 8192) {
        out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + 8192)));
      }
      return out;
    }
  }

  (globalThis as { TextDecoder?: unknown }).TextDecoder = Latin1AwareTextDecoder;
}

export {};
