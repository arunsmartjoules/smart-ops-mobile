/**
 * API configuration constants
 */

import { Platform } from "react-native";

// Base URLs
const productionUrl = "https://3.110.174.185.sslip.io";

// For Android: 10.0.2.2 is the emulator's bridge to localhost. 
// For physical devices, use your computer's local IP (e.g. 192.168.x.x).
const devUrl = Platform.OS === "android" ? "http://192.168.31.134:3420" : "http://localhost:3420";

const envUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();

const isPrivateOrLocalHost = (urlString: string) => {
  try {
    const host = new URL(urlString).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1") return true;
    if (host.startsWith("10.")) return true;
    if (host.startsWith("192.168.")) return true;
    if (host.startsWith("172.")) {
      const second = Number(host.split(".")[1] || "0");
      if (second >= 16 && second <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
};

const resolveApiBaseUrl = () => {
  if (__DEV__) return envUrl || devUrl;
  if (!envUrl) return productionUrl;

  // Safety guard: prevent preview/production builds from pointing to local LAN URLs.
  if (isPrivateOrLocalHost(envUrl)) return productionUrl;
  return envUrl;
};

export const API_BASE_URL = resolveApiBaseUrl();
export const API_URL = `${API_BASE_URL}/api`;

// Timeouts (in milliseconds)
export const API_TIMEOUT = 30000; // 30 seconds
export const API_TIMEOUT_SHORT = 10000; // 10 seconds
export const API_TIMEOUT_LONG = 60000; // 60 seconds

// Retry configuration
export const API_MAX_RETRIES = 3;
export const API_RETRY_DELAY_BASE = 1000; // Base delay between retries (multiplied by 2^attempt)

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Cache durations (in milliseconds)
export const CACHE_DURATION = {
  SHORT: 5 * 60 * 1000, // 5 minutes
  MEDIUM: 30 * 60 * 1000, // 30 minutes
  LONG: 60 * 60 * 1000, // 1 hour
  DAY: 24 * 60 * 60 * 1000, // 24 hours
} as const;

export default {
  API_BASE_URL,
  API_URL,
  API_TIMEOUT,
  API_TIMEOUT_SHORT,
  API_TIMEOUT_LONG,
  API_MAX_RETRIES,
  API_RETRY_DELAY_BASE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  CACHE_DURATION,
};
