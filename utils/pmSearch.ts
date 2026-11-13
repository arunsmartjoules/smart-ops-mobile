/**
 * PM list search — the same rule the server uses (backend shared/src/lib/
 * querier.ts `wordSearch`), applied to the offline list on the device.
 *
 * The term is split into words and a PM matches when every word starts a word
 * in its asset name, asset type, title or area, in any order: "linac csu"
 * finds "KBLR /UBF-B/LINAC UPS CSU DX - 2". A number word matches only a whole
 * number and letter↔digit runs split, so "ot1" = "ot 1". The old
 * separator-insensitive substring match is kept as a fallback, so nothing
 * found before is lost (it is also why "ot 1" still lists "OT 10").
 */

const MAX_SEARCH_WORDS = 8;

/** Lowercase words, letter↔digit runs split, anything not a-z/0-9 a separator. */
export function searchWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/([a-z])([0-9])/g, "$1 $2")
    .replace(/([0-9])([a-z])/g, "$1 $2")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

const isNumber = (w: string) => /^[0-9]+$/.test(w);
const stripped = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Build a matcher once per query; call it per PM. Empty query → null. */
export function pmSearchMatcher(
  query: string,
): ((fields: (string | null | undefined)[]) => boolean) | null {
  const words = [...new Set(searchWords(query))].slice(0, MAX_SEARCH_WORDS);
  const loose = stripped(query);
  if (words.length === 0 || !loose) return null;

  return (fields) => {
    const text = fields.filter(Boolean).join(" ");
    if (stripped(text).includes(loose)) return true;
    const textWords = searchWords(text);
    return words.every((w) =>
      isNumber(w)
        ? textWords.includes(w)
        : textWords.some((t) => t.startsWith(w)),
    );
  };
}
