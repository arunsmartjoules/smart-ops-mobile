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

      // Send errors to backend immediately
      if (level === "error") {
        void this._sendToBackend(
          "APP_ERROR",
          safeMetadata?.module || metadata?.module || "MOBILE_APP",
          message,
          context.device,
          { ...(typeof safeMetadata === "object" && safeMetadata ? safeMetadata : { value: safeMetadata }), timestamp, platform: Platform.OS },
        );
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

  /**
   * Send a structured activity log to the backend activity_logs table.
   * Fire-and-forget — never throws, never blocks the caller.
   * Works both online (immediate POST) and offline (queued in AsyncStorage).
   */
  activity(
    action: string,
    module: string,
    description: string,
    metadata?: Record<string, any>,
  ) {
    void (async () => {
      try {
      const token = await AsyncStorage.getItem("firebase-token");
        if (!token) return;

        const context = await this.getContext();
        const payload = {
          action,
          module,
          description,
          device_info: context.device,
          metadata: {
            ...(metadata ? makeSerializable(metadata) : {}),
            platform: Platform.OS,
            timestamp: new Date().toISOString(),
          },
        };

        // Try to send immediately
        fetch(`${BACKEND_URL}/api/logs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        }).catch(async () => {
          // If network fails, queue for later
          try {
            const queueRaw = await AsyncStorage.getItem("@activity_log_queue");
            const queue: any[] = queueRaw ? JSON.parse(queueRaw) : [];
            queue.push({ ...payload, queued_at: new Date().toISOString() });
            // Keep queue bounded to 200 entries
            const trimmed = queue.slice(-200);
            await AsyncStorage.setItem("@activity_log_queue", JSON.stringify(trimmed));
          } catch {
            // ignore
          }
        });
      } catch {
        // Logger must never throw
      }
    })();
  },

  /**
   * Flush queued activity logs to backend (call on network reconnect).
   */
  async flushActivityQueue(): Promise<void> {
    try {
      const token = await AsyncStorage.getItem("firebase-token");
      if (!token) return;

      const queueRaw = await AsyncStorage.getItem("@activity_log_queue");
      if (!queueRaw) return;

      const queue: any[] = JSON.parse(queueRaw);
      if (queue.length === 0) return;

      const failed: any[] = [];
      for (const entry of queue) {
        try {
          const res = await fetch(`${BACKEND_URL}/api/logs`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(entry),
          });
          if (!res.ok) failed.push(entry);
        } catch {
          failed.push(entry);
        }
      }

      await AsyncStorage.setItem("@activity_log_queue", JSON.stringify(failed));
    } catch {
      // ignore
    }
  },

  // Internal helper — shared by log() and activity()
  async _sendToBackend(
    action: string,
    module: string,
    description: string,
    deviceInfo: any,
    metadata: any,
  ): Promise<void> {
    try {
      const token = await AsyncStorage.getItem("firebase-token");
      if (!token) return;
      fetch(`${BACKEND_URL}/api/logs`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action, module, description, device_info: deviceInfo, metadata }),
      }).catch((err) =>
        console.log("Failed to send log to backend", err?.message || String(err))
      );
    } catch {
      // Silently fail
    }
  },
};

export default logger;
