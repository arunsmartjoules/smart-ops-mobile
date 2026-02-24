import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authEvents } from "../utils/authEvents";
import {
  registerForPushNotifications,
  unregisterPushToken,
} from "../services/NotificationService";
import logger from "../utils/logger";
import { SecureStorage, SECURE_KEYS } from "../utils/secureStorage";
import { performLogoutCleanup } from "../services/CleanupService";
import { syncManager } from "../services/SyncManager";

import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

interface AuthUser {
  id: string;
  user_id: string; // Actual database user_id
  email: string;
  name?: string;
  full_name?: string;
  role?: string;
  work_location_type?: "WHF" | "WFH" | null;
  department?: string;
  designation?: string;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signUp: (
    email: string,
    password: string,
    name: string,
  ) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (
    email: string,
    employeeCode: string,
    newPassword: string,
  ) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  resetPassword: async () => ({ error: null }),
  refreshProfile: async () => {},
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Get initial session from storage
    const loadSession = async () => {
      try {
        const savedToken = await SecureStorage.getItem(SECURE_KEYS.AUTH_TOKEN);
        const savedUser = await AsyncStorage.getItem("auth_user");

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (error: any) {
        logger.error("Failed to load session from storage", {
          module: "AUTH_CONTEXT",
          error: error.message,
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  useEffect(() => {
    const unsubscribe = authEvents.subscribe(() => {
      logger.warn("Global 401 Unauthorized event received. Signing out.");
      signOut();
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        logger.error("Login JSON parse error", {
          module: "AUTH_CONTEXT",
          status: response.status,
          email,
        });
        return {
          error: `Server error (${response.status}). Please try again later.`,
        };
      }

      if (!result.success) {
        logger.warn("Login failed: logic error", {
          module: "AUTH_CONTEXT",
          error: result.error,
          email,
        });
        return { error: result.error || "Login failed" };
      }

      const { token, refresh_token, user: userData } = result.data;

      // Ensure consistent mapping: some controllers return 'id' as user_id
      const mappedUser = {
        ...userData,
        user_id: userData.user_id || userData.id,
        id: userData.user_id || userData.id,
      };

      await SecureStorage.setItem(SECURE_KEYS.AUTH_TOKEN, token);
      await SecureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStorage.setItem("user_id", mappedUser.user_id);
      await AsyncStorage.setItem("auth_user", JSON.stringify(mappedUser));

      setToken(token);
      setUser(mappedUser);

      if (userData) {
        // Register for push notifications (don't block login if it fails)
        registerForPushNotifications(userData.user_id, token).catch((error) => {
          logger.warn("Push registration background failure", {
            module: "AUTH_CONTEXT",
            error: error.message,
            userId: userData.user_id,
          });
        });
      }

      return { error: null };
    } catch (error: any) {
      logger.error("Login network/exception error", {
        module: "AUTH_CONTEXT",
        error: error.message,
        email,
      });
      return { error: error.message };
    }
  }, []);

  const signUp = async (email: string, password: string, name: string) => {
    try {
      logger.debug(`Calling Signup API: ${BACKEND_URL}/api/auth/signup`);
      const response = await fetch(`${BACKEND_URL}/api/auth/signup`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, name }),
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        return {
          error: `Server error (${response.status}). Please try again later.`,
        };
      }

      if (!result.success) {
        return { error: result.error || "Signup failed" };
      }

      const { token, refresh_token, user: userData } = result.data;

      const mappedUser = {
        ...userData,
        user_id: userData.user_id || userData.id,
        id: userData.user_id || userData.id,
      };

      await SecureStorage.setItem(SECURE_KEYS.AUTH_TOKEN, token);
      await SecureStorage.setItem(SECURE_KEYS.REFRESH_TOKEN, refresh_token);
      await SecureStorage.setItem("user_id", mappedUser.user_id);
      await AsyncStorage.setItem("auth_user", JSON.stringify(mappedUser));

      setToken(token);
      setUser(mappedUser);

      return { error: null };
    } catch (error: any) {
      logger.error("Error from signup frontend", error);
      return { error: error.message };
    }
  };

  const signOut = useCallback(async () => {
    try {
      const savedToken = await SecureStorage.getItem(SECURE_KEYS.AUTH_TOKEN);
      if (savedToken) {
        // Unregister push token
        await unregisterPushToken(savedToken).catch((error) => {
          logger.warn("SignOut: push unregistration failure", {
            module: "AUTH_CONTEXT",
            error: error.message,
          });
        });

        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${savedToken}`,
            "Content-Type": "application/json",
          },
        });
      }
    } catch (error: any) {
      logger.error("Logout API call exception", {
        module: "AUTH_CONTEXT",
        error: error.message,
      });
    } finally {
      // 1. Cleanup sync manager
      syncManager.cleanup();

      // 2. Perform comprehensive data cleanup
      await performLogoutCleanup();

      // 3. Reset state
      setToken(null);
      setUser(null);
      // Navigation will be handled by the consuming component (e.g., index.tsx)
      // which already redirects to sign-in when user is null
    }
  }, []);

  const resetPassword = async (
    email: string,
    employeeCode: string,
    newPassword: string,
  ) => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/reset-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, employeeCode, newPassword }),
      });

      let result;
      try {
        result = await response.json();
      } catch (e) {
        return {
          error: `Server error (${response.status}). Please try again later.`,
        };
      }

      if (!result.success) {
        return { error: result.error || "Reset failed" };
      }

      return { error: null };
    } catch (error: any) {
      logger.error("Error from reset password frontend", error);
      return { error: error.message };
    }
  };

  const refreshProfile = useCallback(async () => {
    try {
      const savedToken = await SecureStorage.getItem(SECURE_KEYS.AUTH_TOKEN);

      if (!savedToken) {
        return;
      }

      const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${savedToken}`,
          "Content-Type": "application/json",
        },
      });

      let result;
      try {
        result = await response.json();
      } catch (error: any) {
        logger.error("Refresh profile JSON parse error", {
          module: "AUTH_CONTEXT",
          status: response.status,
          error: error.message,
        });
        return;
      }

      if (result.success && result.data) {
        const updatedUser = {
          id: result.data.user_id,
          user_id: result.data.user_id,
          email: result.data.email,
          name: result.data.name,
          full_name: result.data.full_name,
          role: result.data.role,
          work_location_type: result.data.work_location_type,
          department: result.data.department,
          designation: result.data.designation,
        };

        // Update both state and AsyncStorage
        await AsyncStorage.setItem("auth_user", JSON.stringify(updatedUser));
        setUser(updatedUser);
      }
    } catch (error: any) {
      logger.error("Failed to refresh profile", {
        module: "AUTH_CONTEXT",
        error: error.message,
      });
    }
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
    }),
    [
      user,
      token,
      isLoading,
      signIn,
      signUp,
      signOut,
      resetPassword,
      refreshProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
