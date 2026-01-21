import { SecureStorage, SECURE_KEYS } from "../utils/secureStorage";
import logger from "../utils/logger";

// We need to avoid circular dependencies if we import API_CONFIG constant
// So we define the base URL dynamically or import carefully
const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

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

    // Check if token is about to expire (within 2 minutes)
    // Note: This relies on us tracking expiry. If we don't have it tracked in memory (e.g. app restart),
    // we assume it's valid until a 401 happens.
    if (this.tokenExpiresAt && Date.now() > this.tokenExpiresAt - 120000) {
      logger.debug("Token about to expire, refreshing...", {
        module: "AUTH_SERVICE",
      });
      return this.refreshToken();
    }

    return token;
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
        await SecureStorage.setItem(SECURE_KEYS.AUTH_TOKEN, result.data.token);
        this.tokenExpiresAt = Date.now() + result.data.expires_in * 1000;
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
}

export const authService = new AuthService();
