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
import { auth } from "../services/firebase";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signOut as firebaseSignOut, 
  sendPasswordResetEmail,
  onIdTokenChanged,
  updateProfile,
  User as FirebaseUser
} from "firebase/auth";
import { syncEngine } from "../services/SyncEngine";
import siteResolver from "../services/SiteResolver";
import { API_BASE_URL } from "../constants/api";

const BACKEND_URL = API_BASE_URL;

interface AuthUser {
  id: string;
  user_id: string;
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
  sendPasswordResetCode: (email: string) => Promise<{ error: any }>;
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
  changePassword: (password: string) => Promise<{ error: any }>;
  sendVerificationCode: (email: string) => Promise<{ error: any }>;
  verifySignupCode: (email: string, code: string) => Promise<{ error: any }>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  token: null,
  isLoading: true,
  signIn: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  signOut: async () => {},
  sendPasswordResetCode: async () => ({ error: null }),
  resetPasswordWithCode: async () => ({ error: null }),
  refreshProfile: async () => {},
  changePassword: async () => ({ error: null }),
  sendVerificationCode: async () => ({ error: null }),
  verifySignupCode: async () => ({ error: null }),
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
};

/** Map a Firebase user + optional profile data into our AuthUser shape */
function mapFirebaseUser(
  firebaseUser: FirebaseUser,
  profile?: Partial<AuthUser>,
): AuthUser {
  // Prefer the DB user_id from profile (may differ from Firebase UID)
  const dbUserId = profile?.user_id ?? profile?.id ?? firebaseUser.uid;
  return {
    id: dbUserId,
    user_id: dbUserId,
    email: firebaseUser.email ?? "",
    name: profile?.name ?? firebaseUser.displayName ?? "",
    full_name: profile?.full_name ?? firebaseUser.displayName ?? "",
    role: profile?.role ?? "",
    work_location_type: profile?.work_location_type ?? null,
    department: profile?.department ?? "",
    designation: profile?.designation ?? "",
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch extended profile from backend and merge into user state
  const fetchAndSetProfile = useCallback(
    async (firebaseUser: FirebaseUser, idToken: string) => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const result = await response.json();
        if (result.success && result.data) {
          const mapped = mapFirebaseUser(firebaseUser, result.data);
          await AsyncStorage.setItem("auth_user", JSON.stringify(mapped));
          setUser(mapped);
          return mapped;
        }
      } catch (e: any) {
        logger.warn("Profile fetch failed, falling back to cached or session metadata", {
          module: "AUTH_CONTEXT",
          error: e.message,
        });
      }
      
      const cached = await AsyncStorage.getItem("auth_user");
      if (cached) {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        return parsed;
      }

      const mapped = mapFirebaseUser(firebaseUser);
      setUser(mapped);
      return mapped;
    },
    [],
  );

  useEffect(() => {
    const unsubscribe = onIdTokenChanged(auth, async (firebaseUser) => {
      logger.debug(`Firebase auth state change: ${!!firebaseUser}`, { module: "AUTH_CONTEXT" });

      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
        await AsyncStorage.setItem("firebase-token", idToken);
        
        const userProfile = await fetchAndSetProfile(firebaseUser, idToken);
        
        if (userProfile?.user_id) {
          syncEngine.initialize(userProfile.user_id).catch(() => {});
          siteResolver.initialize(userProfile.user_id).catch(() => {});
          registerForPushNotifications(userProfile.user_id, idToken).catch(() => {});
        }
        setIsLoading(false);
      } else {
        setToken(null);
        setUser(null);
        await AsyncStorage.removeItem("firebase-token");
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchAndSetProfile]);

  // Listen for global 401 events from API calls
  useEffect(() => {
    const unsubscribe = authEvents.subscribe(() => {
      logger.warn("Global 401 event received. Signing out.", {
        module: "AUTH_CONTEXT",
      });
      signOut();
    });
    return unsubscribe;
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      let msg = error.message || "Sign in failed";
      if (msg.includes("auth/invalid-credential") || msg.includes("auth/user-not-found") || msg.includes("auth/wrong-password")) {
        msg = "Invalid email or password. Please try again.";
      } else if (msg.includes("auth/too-many-requests")) {
        msg = "Too many failed login attempts. Please try again later.";
      } else if (msg.includes("Firebase: Error")) {
        msg = msg.replace("Firebase: Error (", "").replace(").", "").trim();
      }
      logger.warn("Sign in failed", { module: "AUTH_CONTEXT", error: msg });
      return { error: msg };
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const result = await res.json();
        if (!res.ok) return { error: result.error || "Signup failed" };
        
        // The backend signup creates the user in both DB and Firebase (via custom token).
        // Since Firebase SDK's createUserWithEmailAndPassword would conflict or redundancy,
        // we just call our backend and let the user signed in later or here if we have a token.
        // For now, signup succeeds and tells user to verify.
        return { error: null };
      } catch (error: any) {
        logger.warn("Sign up failed", {
          module: "AUTH_CONTEXT",
          error: error.message,
        });
        return { error: error.message };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      if (token) {
        await unregisterPushToken(token).catch(() => {});
      }
      await firebaseSignOut(auth);
    } catch (error: any) {
      logger.error("Sign out error", {
        module: "AUTH_CONTEXT",
        error: error.message,
      });
    } finally {
      // Cleanup local data regardless of network result
      syncEngine.cleanup();
      try {
        const keysToRemove = [
          "auth_user",
          "@sync_status",
          "@ticket_sync_status",
          "@offline_ticket_updates",
          "@cache_metadata",
          "last_sync_time",
          "push_token",
        ];
        await AsyncStorage.multiRemove(keysToRemove);
        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = allKeys.filter(
          (key) => key.startsWith("@cache_") || key.startsWith("@offline_"),
        );
        if (cacheKeys.length > 0) {
          await AsyncStorage.multiRemove(cacheKeys);
        }
      } catch (cleanupError: any) {
        logger.error("Logout cleanup failed", {
          module: "AUTH_CONTEXT",
          error: cleanupError.message,
        });
      }
      setToken(null);
      setUser(null);
    }
  }, []);

  const sendPasswordResetCode = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      return { error: null };
    } catch (e: any) {
      logger.error("Password reset error", {
        module: "AUTH_CONTEXT",
        error: e.message,
      });
      return { error: e.message || "Error sending reset email" };
    }
  }, []);

  const resetPasswordWithCode = useCallback(
    async (email: string, code: string, newPassword: string) => {
      try {
        const res = await fetch(`${BACKEND_URL}/api/auth/reset-password-with-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, newPassword }),
        });
        const result = await res.json();
        if (!res.ok) return { error: result.error || "Failed to reset password" };
        return { error: null };
      } catch (e: any) {
        return { error: e.message || "Network error" };
      }
    },
    [],
  );

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) return;
    const idToken = await auth.currentUser.getIdToken(true);
    setToken(idToken);
    await fetchAndSetProfile(auth.currentUser, idToken);
  }, [fetchAndSetProfile]);

  const changePassword = useCallback(async (password: string) => {
    try {
      const idToken = await AsyncStorage.getItem("firebase-token");
      if (!idToken) return { error: "Not authenticated" };

      const res = await fetch(`${BACKEND_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ newPassword: password }),
      });
      const result = await res.json();
      if (!res.ok) return { error: result.error || "Failed to change password" };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Network error" };
    }
  }, []);

  const sendVerificationCode = useCallback(async (email: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (!res.ok) return { error: result.error || "Failed to send code" };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Network error" };
    }
  }, []);

  const verifySignupCode = useCallback(async (email: string, code: string) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const result = await res.json();
      if (!res.ok) return { error: result.error || "Invalid code" };
      return { error: null };
    } catch (e: any) {
      return { error: e.message || "Network error" };
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
      sendPasswordResetCode,
      resetPasswordWithCode,
      refreshProfile,
      changePassword,
      sendVerificationCode,
      verifySignupCode,
    }),
    [
      user,
      token,
      isLoading,
      signIn,
      signUp,
      signOut,
      sendPasswordResetCode,
      resetPasswordWithCode,
      refreshProfile,
      changePassword,
      sendVerificationCode,
      verifySignupCode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
