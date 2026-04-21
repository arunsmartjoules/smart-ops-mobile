/**
 * Decides if persisted `auth_user` from AsyncStorage belongs to the
 * current Firebase session (for offline / degraded profile recovery).
 */

export function normalizeAuthCacheEmail(email?: string | null): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * True if cached profile row is safe to use for the signed-in Firebase user.
 * When Firebase has no email (e.g. custom token / Google), accept cache if
 * it has a valid `user_id` (identity came from a prior online profile fetch).
 */
export function cachedAuthUserMatchesFirebaseSession(
  firebaseUserEmail: string | null | undefined,
  parsed: { email?: string; user_id?: string } | null,
): boolean {
  const userId = String(parsed?.user_id || "").trim();
  if (!userId) {
    return false;
  }
  const firebaseN = normalizeAuthCacheEmail(firebaseUserEmail);
  const cachedN = normalizeAuthCacheEmail(parsed?.email);
  if (firebaseN) {
    return Boolean(cachedN) && cachedN === firebaseN;
  }
  return true;
}
