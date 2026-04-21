import AsyncStorage from "@react-native-async-storage/async-storage";
import { auth } from "./firebase";

const TOKEN_KEY = "firebase-token";
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

export function isSessionRevokedError(error: unknown): boolean {
  const err = error as { code?: string; message?: string; errorInfo?: { code?: string } };
  const code = String(err?.code || err?.errorInfo?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return (
    code.includes("id-token-revoked") ||
    code.includes("user-disabled") ||
    code.includes("user-not-found") ||
    code.includes("invalid-user-token") ||
    code.includes("session-expired") ||
    msg.includes("token has been revoked") ||
    msg.includes("user disabled")
  );
}

export async function getStoredAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function setStoredAuthToken(token: string): Promise<void> {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearStoredAuthToken(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_KEY);
}

export async function forceRefreshAuthToken(): Promise<string | null> {
  if (!auth.currentUser) return null;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshed = await auth.currentUser!.getIdToken(true);
    await setStoredAuthToken(refreshed);
    return refreshed;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

export async function getValidAuthToken(
  minValidityMs = DEFAULT_MIN_VALIDITY_MS,
): Promise<string | null> {
  const firebaseUser = auth.currentUser;
  if (!firebaseUser) {
    return getStoredAuthToken();
  }

  let token: string | null = null;
  try {
    token = await firebaseUser.getIdToken(false);
    await setStoredAuthToken(token);
  } catch {
    token = await getStoredAuthToken();
  }

  if (!token) return null;
  if (!isTokenExpiringSoon(token, minValidityMs)) return token;
  return forceRefreshAuthToken();
}
