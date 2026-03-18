export type SortDirection = "asc" | "desc" | null;

/**
 * Sorts an array of items (Tasks) by sequence number.
 * @param items The items to sort
 * @param sequenceMap A map of task name to sequence number
 * @param direction The sort direction
 */
export function sortBySequenceNumber<T extends { name: string }>(
  items: T[],
  sequenceMap: Map<string, number>,
  direction: SortDirection
): T[] {
  if (!direction) return items;

  return [...items].sort((a, b) => {
    const seqA = sequenceMap.get(a.name) ?? 999;
    const seqB = sequenceMap.get(b.name) ?? 999;

    if (seqA !== seqB) {
      return direction === "asc" ? seqA - seqB : seqB - seqA;
    }
    
    // Tie-breaker: alphabetical
    return a.name.localeCompare(b.name);
  });
}
