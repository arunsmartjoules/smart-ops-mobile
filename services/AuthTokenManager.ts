import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
import { API_BASE_URL, API_TIMEOUT_SHORT } from "../constants/api";
import { authEvents } from "../utils/authEvents";

// JouleOps session tokens (issued by /api/auth/login|google|refresh). Replaces
// the old Firebase ID token. Kept in AsyncStorage so the session survives app
// restarts and works offline.
const ACCESS_TOKEN_KEY = "jouleops-access-token";
const REFRESH_TOKEN_KEY = "jouleops-refresh-token";
// Legacy Firebase key — cleared on logout so stale tokens don't linger.
const LEGACY_TOKEN_KEY = "firebase-token";
const DEFAULT_MIN_VALIDITY_MS = 5 * 60 * 1000;

let refreshInFlight: Promise<string | null> | null = null;

/**
 * Best-effort connectivity check. Returns true only when the device reports a
 * usable connection; on any error we assume ONLINE so a genuinely-dead session
 * can still be detected (we never want a flaky NetInfo read to trap a user with
 * a truly expired session). Offline is the case we must be certain about before
 * forcing a re-auth, so we only act on an explicit `isConnected === false`.
 */
async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    if (state.isConnected === false) return false;
    if (state.isInternetReachable === false) return false;
    return true;
  } catch {
    return true;
  }
}

function base64UrlDecode(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  try {
    if (typeof globalThis.atob === "function") {
      return globalThis.atob(padded);
    }
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function getTokenExpiryMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payloadRaw = base64UrlDecode(parts[1] || "");
    if (!payloadRaw) return null;
    const payload = JSON.parse(payloadRaw) as { exp?: number };
    if (!payload.exp || Number.isNaN(payload.exp)) return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

export function isTokenExpiringSoon(
  token: string,
  minValidityMs = DEFAULT_MIN_VALIDITY_MS,
): boolean {
  const expiresAt = getTokenExpiryMs(token);
  if (!expiresAt) return false;
  return expiresAt - Date.now() <= minValidityMs;
}

// Retained so apiHelper's existing 401 handling keeps compiling. JouleOps
// signals a dead session with an explicit `code`/`error` on the 401/403 body
// (handled in apiHelper), so this mainly guards against legacy error shapes.
export function isSessionRevokedError(error: unknown): boolean {
  const err = error as { code?: string; message?: string };
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code.includes("revoked") ||
    code.includes("user_blocked") ||
    code.includes("session-expired") ||
    msg.includes("revoked") ||
    msg.includes("disabled")
  );
}

export async function getStoredAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(ACCESS_TOKEN_KEY);
}

export async function getStoredRefreshToken(): Promise<string | null> {
  return AsyncStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function setStoredAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, token);
}

/** Persist an access token and (optionally) a new refresh token together. */
export async function setStoredTokens(
  accessToken: string,
  refreshToken?: string | null,
): Promise<void> {
  await AsyncStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    await AsyncStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export async function clearStoredAuthToken(): Promise<void> {
  await AsyncStorage.multiRemove([
    ACCESS_TOKEN_KEY,
    REFRESH_TOKEN_KEY,
    LEGACY_TOKEN_KEY,
  ]);
}

/**
 * Exchange the stored refresh token for a fresh access token via
 * /api/auth/refresh. Returns null (rather than throwing) on any failure —
 * including offline — so callers can fall back to the cached token.
 */
export async function forceRefreshAuthToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getStoredRefreshToken();
    if (!refreshToken) {
      // No refresh token stored. Only treat this as an unrecoverable session
      // when we're actually online — offline (or connectivity unknown) it must
      // NOT force a logout: a field user with hours of no signal would be
      // dropped at the sign-in screen and lose their session. Return null and
      // let the caller fall back to the cached access token.
      const online = await isOnline();
      if (online) {
        authEvents.emitUnauthorized("session_expired");
      }
      return null;
    }
    // Bound the refresh so a "connected but dead" network (captive portal,
    // plant-room dead zone) can't hang this promise — and every caller de-duped
    // onto it — forever. Falls through to `catch` → returns null on timeout.
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_SHORT);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
        signal: controller.signal,
      });
      // 401 = the refresh token is dead (revoked / expired / logged out). This
      // is unrecoverable, so signal re-authentication. Other non-2xx (5xx,
      // network) are transient — return null and let the caller retry later
      // without disturbing the session.
      if (res.status === 401) {
        authEvents.emitUnauthorized("session_expired");
        return null;
      }
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const newAccess: string | undefined = data?.data?.token;
      const newRefresh: string | undefined = data?.data?.refresh_token;
      if (!newAccess) return null;
      await setStoredTokens(newAccess, newRefresh ?? null);
      return newAccess;
    } catch {
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

/**
 * Return a usable access token, refreshing it first if it is close to expiry.
 * On a failed refresh (e.g. offline) the stored token is returned so requests
 * are still attempted; a truly-dead token then surfaces as a 401 in apiHelper.
 */
export async function getValidAuthToken(
  minValidityMs = DEFAULT_MIN_VALIDITY_MS,
): Promise<string | null> {
  const token = await getStoredAuthToken();
  if (!token) return null;
  if (!isTokenExpiringSoon(token, minValidityMs)) return token;
  const refreshed = await forceRefreshAuthToken();
  return refreshed || token;
}
