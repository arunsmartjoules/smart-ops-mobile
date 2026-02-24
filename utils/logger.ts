import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

// Check if we're in production mode
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const IS_DEV =
  typeof (globalThis as any).__DEV__ === "boolean"
    ? (globalThis as any).__DEV__
    : !IS_PRODUCTION;

function getCircularReplacer() {
  const seen = new WeakSet();
  return (_key: string, value: any) => {
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "function") {
      return `[Function ${value.name || "anonymous"}]`;
    }
    if (value instanceof Error) {
      return {
        name: value.name,
        message: value.message,
        stack: value.stack,
      };
    }
    if (value && typeof value === "object") {
      if (seen.has(value)) return "[Circular]";
      seen.add(value);
    }
    return value;
  };
}

function makeSerializable(value: any) {
  // React Native's console/error overlay can choke on circular/unserializable objects.
  // Keep logger side-effect free: never throw from logging.
  try {
    return JSON.parse(JSON.stringify(value, getCircularReplacer()));
  } catch (e: any) {
    return {
      _unserializable: true,
      message: e?.message || "Failed to serialize log metadata",
      preview: String(value),
    };
  }
}

/**
 * Enhanced logging utility that captures user context and sends errors to the backend.
 * In production mode, info and debug logs are suppressed to avoid performance overhead.
 */
export const logger = {
  async getContext() {
    try {
      const userJson = await AsyncStorage.getItem("auth_user");
      const user = userJson ? JSON.parse(userJson) : null;
      return {
        user_id: user?.user_id || user?.id || "unauthenticated",
        device: {
          platform: Platform.OS,
          version: Platform.Version,
        },
      };
    } catch (e) {
      return { user_id: "unknown", device: { platform: Platform.OS } };
    }
  },

  async log(
    level: "info" | "warn" | "error" | "debug",
    message: string,
    metadata: any = {}
  ) {
    try {
      // Skip info and debug logs in production
      if (IS_PRODUCTION && (level === "info" || level === "debug")) {
        return;
      }

      const context = await this.getContext();
      const timestamp = new Date().toISOString();
      const safeMetadata = makeSerializable(metadata);

      // Console output for development
      const consoleMsg = `[${timestamp}] [${level.toUpperCase()}] [User:${context.user_id}] ${message}`;
      try {
        if (level === "error") {
          // React Native dev builds treat console.error as a redbox-worthy error.
          // We still want visibility, but without crashing/interrupting the app.
          if (IS_DEV) console.log(consoleMsg, safeMetadata);
          else console.error(consoleMsg, safeMetadata);
        } else if (level === "warn") {
          console.warn(consoleMsg, safeMetadata);
        } else {
          console.log(consoleMsg, safeMetadata);
        }
      } catch {
        // Last resort: never let logging crash the app.
        try {
          console.log(consoleMsg);
        } catch {
          // ignore
        }
      }

      // Send to backend if it's an error
      if (level === "error") {
        try {
          const token = await AsyncStorage.getItem("auth_token");
          if (token) {
            fetch(`${BACKEND_URL}/api/logs`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({
                action: "APP_ERROR",
                module: safeMetadata?.module || metadata?.module || "MOBILE_APP",
                description: message,
                device_info: context.device,
                metadata: {
                  ...(typeof safeMetadata === "object" && safeMetadata ? safeMetadata : { value: safeMetadata }),
                  timestamp,
                  platform: Platform.OS,
                },
              }),
            }).catch((err) =>
              console.log("Failed to send log to backend", err?.message || String(err))
            );
          }
        } catch {
          // Silently fail to avoid infinite loops if logging itself fails
        }
      }
    } catch {
      // Logger must never throw.
    }
  },

  info(message: string, metadata?: any) {
    void this.log("info", message, metadata);
  },

  warn(message: string, metadata?: any) {
    void this.log("warn", message, metadata);
  },

  error(message: string, metadata?: any) {
    void this.log("error", message, metadata);
  },

  /**
   * Debug log - only outputs in development
   */
  debug(message: string, metadata?: any) {
    void this.log("debug", message, metadata);
  },
};

export default logger;
