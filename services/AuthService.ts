import { SecureStorage, SECURE_KEYS } from "../utils/secureStorage";
import logger from "../utils/logger";
import AsyncStorage from "@react-native-async-storage/async-storage";

// We need to avoid circular dependencies if we import API_CONFIG constant
// So we define the base URL dynamically or import carefully
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

interface TokenResponse {
  success: boolean;
  data?: {
    token: string;
    expires_in: number;
  };
  error?: string;
}

class AuthService {
  private refreshPromise: Promise<string | null> | null = null;
  private tokenExpiresAt: number | null = null;

  async getValidToken(): Promise<string | null> {
    const token = await SecureStorage.getItem(SECURE_KEYS.AUTH_TOKEN);

    if (!token) return null;

    // 1. If we don't have expiry in memory (e.g. app reload), try to decode from token
    if (!this.tokenExpiresAt) {
      const exp = this.getExpiryFromToken(token);
      if (exp) {
        this.tokenExpiresAt = exp * 1000;
      }
    }

    // 2. Check if token is about to expire (within 5 minutes for more proactivity)
    const isExpired =
      !this.tokenExpiresAt || Date.now() > this.tokenExpiresAt - 300000;

    if (isExpired) {
      logger.debug("Token expired or about to expire, refreshing...", {
        module: "AUTH_SERVICE",
      });
      return this.refreshToken();
    }

    return token;
  }

  private getExpiryFromToken(token: string): number | null {
    try {
      const payload = token.split(".")[1];
      const decoded = JSON.parse(this.base64Decode(payload));
      return decoded.exp || null;
    } catch (e) {
      return null;
    }
  }

  private base64Decode(str: string): string {
    // Basic base64 decode for JSON strings in React Native
    const chars =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
    let output = "";
    str = str.replace(/=/g, "");
    for (
      let bc = 0, bs = 0, buffer, i = 0;
      (buffer = str.charAt(i++));
      ~buffer && ((bs = bc % 4 ? bs * 64 + buffer : buffer), bc++ % 4)
        ? (output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6))))
        : 0
    ) {
      buffer = chars.indexOf(buffer);
    }
    return output;
  }

  async refreshToken(): Promise<string | null> {
    // Prevent multiple simultaneous refresh requests
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this._doRefresh();

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async _doRefresh(): Promise<string | null> {
    try {
      const refreshToken = await SecureStorage.getItem(
        SECURE_KEYS.REFRESH_TOKEN,
      );

      if (!refreshToken) {
        logger.debug("No refresh token found", { module: "AUTH_SERVICE" });
        return null;
      }

      logger.debug("Refreshing access token", { module: "AUTH_SERVICE" });
      const response = await fetch(`${BACKEND_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      const result: TokenResponse = await response.json();

      if (result.success && result.data) {
        // Save new access token
        await SecureStorage.setItem(SECURE_KEYS.AUTH_TOKEN, result.data.token);
        this.tokenExpiresAt = Date.now() + result.data.expires_in * 1000;

        // --- Handle Refresh Token Rotation ---
        // Save new refresh token if provided by the backend
        if ((result.data as any).refresh_token) {
          await SecureStorage.setItem(
            SECURE_KEYS.REFRESH_TOKEN,
            (result.data as any).refresh_token,
          );
          logger.debug("Refresh token rotated", { module: "AUTH_SERVICE" });
        }

        logger.debug("Token refreshed successfully", {
          module: "AUTH_SERVICE",
        });
        return result.data.token;
      }

      // Refresh failed - clear tokens
      logger.warn("Refresh failed, clearing tokens", {
        module: "AUTH_SERVICE",
        error: result.error,
      });
      await this.clearTokens();
      return null;
    } catch (error: any) {
      logger.error("Token refresh network/exception failed", {
        module: "AUTH_SERVICE",
        error: error.message,
      });
      return null;
    }
  }

  async setTokens(
    accessToken: string,
    refreshToken: string,
    expiresIn: number,
  ): Promise<void> {
    await SecureStorage.setItem(SECURE_KEYS.AUTH_TOKEN, accessToken);
    await SecureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    this.tokenExpiresAt = Date.now() + expiresIn * 1000;
  }

  async clearTokens(): Promise<void> {
    await SecureStorage.clearAll();
    this.tokenExpiresAt = null;
  }

  async getCurrentUserId(): Promise<string | null> {
    // This assumes we stored it during login.
    // Usually it's in the decoded token or saved as a separate key.
    return await SecureStorage.getItem("user_id");
  }

  async getCurrentSiteCode(): Promise<string | null> {
    const userId = await this.getCurrentUserId();
    if (!userId) return null;
    return await AsyncStorage.getItem(`last_site_${userId}`);
  }
}

export const authService = new AuthService();
