import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL } from "../constants/api";

// JouleOps session tokens (issued by /api/auth/login|google|refresh). Replaces
// the old Firebase ID token. Kept in AsyncStorage so the session survives app
// restarts and works offline.
const ACCESS_TOKEN_KEY = "jouleops-access-token";
const REFRESH_TOKEN_KEY = "jouleops-refresh-token";
// Legacy Firebase key — cleared on logout so stale tokens don't linger.
const LEGACY_TOKEN_KEY = "firebase-token";
const DEFAULT_MIN_VALIDITY_MS = 5 * 60 * 1000;

let refreshInFlight: Promise<string | null> | null = null;

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
    if (!refreshToken) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });
      if (!res.ok) return null;
      const data = await res.json().catch(() => null);
      const newAccess: string | undefined = data?.data?.token;
      const newRefresh: string | undefined = data?.data?.refresh_token;
      if (!newAccess) return null;
      await setStoredTokens(newAccess, newRefresh ?? null);
      return newAccess;
    } catch {
      return null;
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
