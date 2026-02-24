/**
 * API configuration constants
 */

import { Platform } from "react-native";

// Base URLs
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL ||
  (Platform.OS === "android"
    ? "http://10.0.2.2:3420"
    : "http://localhost:3420");
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
