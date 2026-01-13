import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

/**
 * Enhanced logging utility that captures user context and sends errors to the backend.
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
    level: "info" | "warn" | "error",
    message: string,
    metadata: any = {}
  ) {
    const context = await this.getContext();
    const timestamp = new Date().toISOString();

    // Console output for development
    const consoleMsg = `[${timestamp}] [${level.toUpperCase()}] [User:${context.user_id}] ${message}`;
    if (level === "error") {
      console.error(consoleMsg, metadata);
    } else if (level === "warn") {
      console.warn(consoleMsg, metadata);
    } else {
      console.log(consoleMsg, metadata);
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
              module: metadata.module || "MOBILE_APP",
              description: message,
              device_info: context.device,
              metadata: {
                ...metadata,
                timestamp,
                platform: Platform.OS,
              },
            }),
          }).catch((err) =>
            console.log("Failed to send log to backend", err.message)
          );
        }
      } catch (e) {
        // Silently fail to avoid infinite loops if logging itself fails
      }
    }
  },

  info(message: string, metadata?: any) {
    this.log("info", message, metadata);
  },

  warn(message: string, metadata?: any) {
    this.log("warn", message, metadata);
  },

  error(message: string, metadata?: any) {
    this.log("error", message, metadata);
  },
};

export default logger;
