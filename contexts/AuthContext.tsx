import React, { createContext, useContext, useEffect, useState } from "react";
import { router } from "expo-router";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { authEvents } from "../utils/authEvents";
import {
  registerForPushNotifications,
  unregisterPushToken,
} from "../services/NotificationService";

const BACKEND_URL =
  process.env.EXPO_PUBLIC_BACKEND_URL || "http://192.168.31.152:3420";

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
    name: string
  ) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  resetPassword: (
    email: string,
    employeeCode: string,
    newPassword: string
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
        const savedToken = await AsyncStorage.getItem("auth_token");
        const savedUser = await AsyncStorage.getItem("auth_user");

        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        }
      } catch (e) {
        console.error("Failed to load session", e);
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, []);

  useEffect(() => {
    const unsubscribe = authEvents.subscribe(() => {
      console.log("Global 401 Unauthorized event received. Signing out.");
      signOut();
    });
    return unsubscribe;
  }, []);

  const signIn = async (email: string, password: string) => {
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
        return {
          error: `Server error (${response.status}). Please try again later.`,
        };
      }

      if (!result.success) {
        return { error: result.error || "Login failed" };
      }

      const { token, user } = result.data;

      await AsyncStorage.setItem("auth_token", token);
      await AsyncStorage.setItem("auth_user", JSON.stringify(user));

      setToken(token);
      setUser(user);

      // Register for push notifications (don't block login if it fails)
      registerForPushNotifications(user.user_id, token).catch((error) => {
        console.log("Failed to register for push notifications:", error);
      });

      return { error: null };
    } catch (error: any) {
      return { error: error.message };
    }
  };

  const signUp = async (email: string, password: string, name: string) => {
    try {
      console.log(`Calling Signup API: ${BACKEND_URL}/api/auth/signup`);
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

      const { token, user } = result.data;

      await AsyncStorage.setItem("auth_token", token);
      await AsyncStorage.setItem("auth_user", JSON.stringify(user));

      setToken(token);
      setUser(user);

      return { error: null };
    } catch (error: any) {
      console.log("Error from frontend", error);
      return { error: error.message };
    }
  };

  const signOut = async () => {
    try {
      const savedToken = await AsyncStorage.getItem("auth_token");
      if (savedToken) {
        // Unregister push token
        await unregisterPushToken(savedToken).catch((error) => {
          console.log("Failed to unregister push token:", error);
        });

        await fetch(`${BACKEND_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${savedToken}`,
            "Content-Type": "application/json",
          },
        });
      }
    } catch (error) {
      console.error("Logout API call failed", error);
    } finally {
      await AsyncStorage.removeItem("auth_token");
      await AsyncStorage.removeItem("auth_user");
      setToken(null);
      setUser(null);
      router.replace("/sign-in");
    }
  };

  const resetPassword = async (
    email: string,
    employeeCode: string,
    newPassword: string
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
      console.log("Error from frontend", error);
      return { error: error.message };
    }
  };

  const refreshProfile = async () => {
    try {
      const savedToken = await AsyncStorage.getItem("auth_token");

      if (!savedToken) {
        console.log("No token available for refresh");
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
      } catch (e) {
        console.error("Failed to parse profile JSON", e);
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
    } catch (error) {
      console.error("Failed to refresh profile", error);
    }
  };

  const value = {
    user,
    token,
    isLoading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
