import Constants from "expo-constants";
import { Platform } from "react-native";
import logger from "./logger";
import { authEvents } from "./authEvents";
import { auth } from "@/services/firebase";
import {
  forceRefreshAuthToken,
  getStoredAuthToken,
  getValidAuthToken,
  isSessionRevokedError,
} from "../services/AuthTokenManager";
import VersionGateService from "../services/VersionGateService";
import { API_TIMEOUT } from "../constants/api";

/**
 * Identifies this client to the backend version gate. The gate only ever
 * acts on requests carrying `X-Client: jouleops-mobile`; sending these on
 * every request lets the server force outdated builds to update (HTTP 426).
 */
export const APP_VERSION: string =
  Constants.expoConfig?.version ??
  (typeof Constants.expoConfig?.runtimeVersion === "string"
    ? Constants.expoConfig.runtimeVersion
    : undefined) ??
  "0.0.0";

const VERSION_HEADERS: Record<string, string> = {
  "X-Client": "jouleops-mobile",
  "X-App-Version": APP_VERSION,
  "X-Platform": Platform.OS,
};

/**
 * Enhanced fetch with timeout support.
 *
 * Defaults to API_TIMEOUT (30s). The previous 5s default was too aggressive
 * for field networks (plant rooms, basements) and surfaced false
 * "Request timed out after 5000ms" failures during site-log pulls and sync.
 */
export const fetchWithTimeout = async (
  url: string,
  options: RequestInit = {},
  timeout = API_TIMEOUT,
): Promise<Response> => {
  const controller = new AbortController();
  const id = setTimeout(() => {
    controller.abort();
    logger.warn(`Request timeout: ${url}`, { module: "API_HELPER" });
  }, timeout);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } catch (error: any) {
    if (error.name === "AbortError") {
      throw new Error(`Request timed out after ${timeout}ms`);
    }
    throw error;
  } finally {
    clearTimeout(id);
  }
};

/**
 * Centralized API fetch helper that handles Firebase authentication.
 * Automatically attaches the 'firebase-token' from AsyncStorage.
 */
export const apiFetch = async (
  url: string,
  options: RequestInit = {},
  customTimeout?: number
): Promise<Response> => {
  try {
    let token = await getValidAuthToken();
    if (!token) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      token = await getStoredAuthToken();
    }

    let response = await fetchWithTimeout(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...VERSION_HEADERS,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    }, customTimeout);

    // One-time silent token refresh/retry for expired/invalid Firebase tokens.
    if (response.status === 401 && auth.currentUser) {
      try {
        let shouldRetry = true;
        try {
          const body = await response.clone().json();
          const responseErr = String(body?.error || "").toLowerCase();
          if (responseErr.includes("revoked") || responseErr.includes("disabled")) {
            shouldRetry = false;
            authEvents.emitUnauthorized("session_revoked");
          }
        } catch {
          // Ignore parse failures and proceed with retry decision.
        }

        if (shouldRetry) {
          const refreshedToken = await forceRefreshAuthToken();
          if (!refreshedToken) return response;

          logger.info("token_refreshed", { module: "API_HELPER", url });
          response = await fetchWithTimeout(
            url,
            {
              ...options,
              headers: {
                "Content-Type": "application/json",
                ...VERSION_HEADERS,
                Authorization: `Bearer ${refreshedToken}`,
                ...options.headers,
              },
            },
            customTimeout,
          );
        }
      } catch (refreshError) {
        if (isSessionRevokedError(refreshError)) {
          authEvents.emitUnauthorized("session_revoked");
        }
        logger.warn("Token refresh before retry failed", {
          module: "API_HELPER",
          url,
          action: "token_refresh_failed",
          error:
            refreshError instanceof Error
              ? refreshError.message
              : String(refreshError),
        });
      }
    }

    // 426 Upgrade Required — the backend version gate has blocked this build.
    // Surface it globally so the full-screen "update required" screen takes
    // over, regardless of which call triggered it.
    if (response.status === 426) {
      try {
        const body = await response.clone().json();
        VersionGateService.reportBlocked({
          message: body?.error,
          reason: body?.details?.reason,
        });
      } catch {
        VersionGateService.reportBlocked({});
      }
    }

    return response;
  } catch (error) {
    logger.error(`apiFetch failure: ${url}`, { error });
    throw error;
  }
};

/**
 * Exponential backoff delay
 */
export const delay = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Retry logic for sync operations
 */
export async function syncWithRetry(
  syncFn: () => Promise<Response>,
  maxRetries = 3,
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await syncFn();
      if (response.ok) return response;

      if (response.status >= 500) {
        // Server error - retry with backoff
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.debug(
          `Server error ${response.status}, retrying in ${waitTime}ms`,
          {
            module: "API_HELPER",
            attempt: attempt + 1,
          },
        );
        await delay(waitTime);
        continue;
      }
      return response; // Client error - don't retry
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;
      const waitTime = Math.pow(2, attempt) * 1000;
      logger.debug(`Network error, retrying in ${waitTime}ms`, {
        module: "API_HELPER",
        attempt: attempt + 1,
        error: error.message,
      });
      await delay(waitTime);
    }
  }
  throw new Error("Max retries exceeded");
}
