/**
 * UserLookupService
 *
 * Resolves an executor identifier (employee_code OR user UUID) to a display
 * label using the backend API. Caches results in memory.
 */

import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

const nameCache = new Map<string, string>();

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Email local-part — everything before "@". */
const emailLocalPart = (email?: string | null): string => {
  const s = String(email ?? "").trim();
  if (!s) return "";
  return (s.includes("@") ? s.slice(0, s.indexOf("@")) : s).trim();
};

/** Display label for a users row: name -> employee_code -> email local-part. */
const labelFromUser = (u: any, fallback: string): string => {
  const name = String(u?.name ?? "").trim();
  const code = String(u?.employee_code ?? "").trim();
  return name || code || emailLocalPart(u?.email) || fallback;
};

const UserLookupService = {
  /**
   * Resolve an executor identifier to a display label.
   * Accepts an employee_code or a user UUID; returns the value itself when
   * it can't be resolved (e.g. it's already a display name).
   */
  async getNameByCode(value: string): Promise<string> {
    if (!value || value === "unknown") return value;

    // Check cache first
    if (nameCache.has(value)) {
      return nameCache.get(value)!;
    }

    // A UUID is a users.user_id, NOT an employee_code — older chiller rows
    // stored the operator's UUID in executor_id. Query the matching column
    // so those rows still resolve to a name instead of rendering the UUID.
    const isUuid = UUID_RE.test(value);

    try {
      // Exact filter — NOT the fuzzy `search` param. `search` does ILIKE
      // '%term%' across name/email/employee_code ORDER BY name ASC, so a
      // substring match returns the alphabetically first user (the
      // "everyone is Amreen Parveen" bug). Exact filters avoid that.
      const filter = isUuid
        ? `user_id=${encodeURIComponent(value)}`
        : `employee_code=${encodeURIComponent(value)}`;
      const res = await centralApiFetch(
        `${API_BASE_URL}/api/users?${filter}&limit=1`,
        {},
        10000,
      );

      if (res.ok) {
        const json = await res.json();
        const match = (json.data || [])[0];
        // Defensive: confirm the row is exactly the one we asked for.
        // Anything else means `value` was a name, not a code/UUID — fall
        // through and return it verbatim.
        const confirmed = isUuid
          ? Boolean(match) &&
            (String(match.user_id) === value || String(match.id) === value)
          : Boolean(match) &&
            String(match.employee_code) === String(value);
        if (confirmed) {
          const label = labelFromUser(match, value);
          nameCache.set(value, label);
          return label;
        }
      }
    } catch (error) {
      // Silently fail — just return the value as-is
      console.warn("UserLookup failed for", value, error);
    }

    // No match: `value` is already a display name (backend writes the
    // operator's name) or an unresolvable id. Return it verbatim.
    nameCache.set(value, value);
    return value;
  },

  /**
   * Batch resolve employee codes to names.
   * Returns a map of code → name.
   */
  async resolveMany(codes: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uncached: string[] = [];

    for (const code of codes) {
      if (nameCache.has(code)) {
        result.set(code, nameCache.get(code)!);
      } else {
        uncached.push(code);
      }
    }

    // Resolve uncached in parallel (max 5 concurrent)
    const batches = [];
    for (let i = 0; i < uncached.length; i += 5) {
      batches.push(uncached.slice(i, i + 5));
    }

    for (const batch of batches) {
      await Promise.all(
        batch.map(async (code) => {
          const name = await this.getNameByCode(code);
          result.set(code, name);
        }),
      );
    }

    return result;
  },

  /**
   * Clear the cache (e.g., on logout)
   */
  clearCache() {
    nameCache.clear();
  },
};

export default UserLookupService;
