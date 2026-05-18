/**
 * UserLookupService
 *
 * Resolves employee_code to employee name using the backend API.
 * Caches results in memory to avoid repeated lookups.
 */

import { apiFetch as centralApiFetch } from "../utils/apiHelper";
import { API_BASE_URL } from "../constants/api";

const nameCache = new Map<string, string>();

const UserLookupService = {
  /**
   * Resolve an employee code to a display name.
   * Returns the name if found, otherwise the code itself.
   */
  async getNameByCode(employeeCode: string): Promise<string> {
    if (!employeeCode || employeeCode === "unknown") return employeeCode;

    // Check cache first
    if (nameCache.has(employeeCode)) {
      return nameCache.get(employeeCode)!;
    }

    try {
      // Exact employee_code filter — NOT the fuzzy `search` param. `search`
      // does ILIKE '%term%' across name/email/employee_code and is ORDER BY
      // name ASC, so a substring-matching code returns the alphabetically
      // first user (the "everyone is Amreen Parveen" bug). The `equals`
      // filter guarantees we only match the exact code.
      const res = await centralApiFetch(
        `${API_BASE_URL}/api/users?employee_code=${encodeURIComponent(employeeCode)}&limit=1`,
        {},
        10000,
      );

      if (res.ok) {
        const json = await res.json();
        const users = json.data || [];
        const match = users[0];
        // Defensive: only accept a result whose employee_code actually
        // equals what we asked for. Anything else means executor_id was a
        // name/UID, not a code — fall through and return it verbatim.
        if (
          match?.name &&
          String(match.employee_code) === String(employeeCode)
        ) {
          nameCache.set(employeeCode, match.name);
          return match.name;
        }
      }
    } catch (error) {
      // Silently fail — just return the code/value as-is
      console.warn("UserLookup failed for", employeeCode, error);
    }

    // No exact code match: executor_id is already a display name (backend
    // writes the operator's name) or a UID. Return it verbatim.
    nameCache.set(employeeCode, employeeCode);
    return employeeCode;
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
