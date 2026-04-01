import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import NetInfo from "@react-native-community/netinfo";
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
  sendEmailVerification,
  onIdTokenChanged,
  updateProfile,
  User as FirebaseUser
} from "firebase/auth";
import { syncEngine } from "../services/SyncEngine";
import siteResolver from "../services/SiteResolver";
import { API_BASE_URL } from "../constants/api";
import { fetchWithTimeout } from "../utils/apiHelper";
import { clearDatabase } from "@/database";

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
  verifySignupCode: (email: string) => Promise<{ error: any }>;
  resendVerificationEmail: () => Promise<{ error: any }>;
  isEmailVerified: boolean;
  refreshUser: () => Promise<void>;
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
  resendVerificationEmail: async () => ({ error: null }),
  isEmailVerified: false,
  refreshUser: async () => {},
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
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // Fetch extended profile from backend and merge into user state
  const fetchAndSetProfile = useCallback(
    async (firebaseUser: FirebaseUser, idToken: string) => {
      try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/auth/profile`, {
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
        setIsEmailVerified(firebaseUser.emailVerified);
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
        await AsyncStorage.setItem("firebase-token", idToken);
        
        const userProfile = await fetchAndSetProfile(firebaseUser, idToken);
        
        if (userProfile?.user_id) {
          logger.activity("LOGIN_SUCCESS", "AUTH", `User ${userProfile.email} logged in successfully`, { 
            user_id: userProfile.user_id,
            email: userProfile.email 
          });
          syncEngine.initialize(userProfile.user_id).catch(() => {});
          siteResolver.initialize(userProfile.user_id).catch(() => {});
          registerForPushNotifications(userProfile.user_id, idToken)
            .then((result) => {
              if (!result.success) {
                logger.warn("Push registration did not complete during login bootstrap", {
                  module: "AUTH_CONTEXT",
                  userId: userProfile.user_id,
                  error: result.error,
                });
              }
            })
            .catch((error: any) => {
              logger.error("Push registration bootstrap failed", {
                module: "AUTH_CONTEXT",
                error: error.message,
              });
            });
        }
        setIsLoading(false);
      } else {
        if (token) {
          logger.activity("LOGOUT", "AUTH", "User logged out");
        }
        setToken(null);
        setUser(null);
        setIsEmailVerified(false);
        await AsyncStorage.removeItem("firebase-token");
        setIsLoading(false);
      }
    });

    return () => unsubscribe();
  }, [fetchAndSetProfile]);

  useEffect(() => {
    if (!user?.user_id || !token) return;

    let wasConnected = true;
    const unsubscribe = NetInfo.addEventListener((state) => {
      const isConnected =
        state.isConnected === true && state.isInternetReachable !== false;

      if (!wasConnected && isConnected) {
        registerForPushNotifications(user.user_id, token)
          .then((result) => {
            if (!result.success) {
              logger.warn("Push registration retry did not complete after reconnect", {
                module: "AUTH_CONTEXT",
                userId: user.user_id,
                error: result.error,
              });
            }
          })
          .catch((error: any) => {
            logger.error("Push registration retry failed after reconnect", {
              module: "AUTH_CONTEXT",
              error: error.message,
            });
          });
      }

      wasConnected = isConnected;
    });

    NetInfo.fetch().then((state) => {
      wasConnected =
        state.isConnected === true && state.isInternetReachable !== false;
    });

    return () => unsubscribe();
  }, [token, user?.user_id]);

  const signIn = useCallback(async (email: string, password: string) => {
    logger.activity("LOGIN_ATTEMPT", "AUTH", `Login attempt for ${email}`, { email });
    try {
      await signInWithEmailAndPassword(auth, email, password);
      return { error: null };
    } catch (error: any) {
      let msg = error.message || "Sign in failed";
      let logAction = "LOGIN_FAILURE";
      
      if (msg.includes("auth/invalid-credential") || msg.includes("auth/user-not-found") || msg.includes("auth/wrong-password")) {
        msg = "Invalid email or password. Please try again.";
        logAction = "WRONG_PASSWORD";
      } else if (msg.includes("auth/too-many-requests")) {
        msg = "Too many failed login attempts. Please try again later.";
      } else if (msg.includes("Firebase: Error")) {
        msg = msg.replace("Firebase: Error (", "").replace(").", "").trim();
      }
      
      logger.warn("Sign in failed", { module: "AUTH_CONTEXT", error: msg });
      logger.activity(logAction, "AUTH", `Login failed for ${email}: ${msg}`, { email, error: msg });
      return { error: msg };
    }
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      logger.activity("SIGNUP_ATTEMPT", "AUTH", `Signup start for ${email}`, { email, name });
      
      try {
        // 1. Create user in Firebase Auth
        logger.debug("Creating user in Firebase Auth", { module: "AUTH_CONTEXT", email });
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        const firebaseUser = userCredential.user;
        
        logger.activity("FIREBASE_SIGNUP_SUCCESS", "AUTH", `Firebase user created for ${email}`, { 
          uid: firebaseUser.uid,
          email 
        });

        // 2. Set display name in Firebase
        await updateProfile(firebaseUser, { displayName: name });
        logger.debug("Firebase profile updated with name", { module: "AUTH_CONTEXT", name });

        // 3. Send email verification
        logger.debug("Sending Firebase verification email", { module: "AUTH_CONTEXT", email });
        await sendEmailVerification(firebaseUser);
        logger.activity("VERIFICATION_EMAIL_SENT", "AUTH", `Firebase verification email sent to ${email}`, { email });

        // 4. Sync with our PostgreSQL backend
        logger.debug("Syncing user with backend PostgreSQL", { module: "AUTH_CONTEXT", email });
        const idToken = await firebaseUser.getIdToken();
        
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/signup`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${idToken}`
          },
          body: JSON.stringify({ email, password, name, firebase_uid: firebaseUser.uid }),
        });
        
        const result = await res.json();
        if (!res.ok) {
          const errorMsg = result.error || "Backend sync failed during signup";
          logger.activity("BACKEND_SYNC_FAILURE", "AUTH", `Signup backend sync failed for ${email}: ${errorMsg}`, { email, error: errorMsg });
          // Note: We don't return an error here because the Firebase account is created and verification email is sent.
          // The backend sync can be retried or fixed later, but user-facing "SignUp" succeeded in terms of account creation.
        } else {
          logger.activity("SIGNUP_COMPLETE", "AUTH", `Entire signup flow finished for ${email}`, { email });
        }
        
        return { error: null };
      } catch (error: any) {
        let msg = error.message || "Signup failed";
        if (msg.includes("auth/email-already-in-use")) {
          msg = "This email is already registered. Please sign in.";
        } else if (msg.includes("auth/weak-password")) {
          msg = "The password is too weak.";
        } else if (msg.includes("auth/invalid-email")) {
          msg = "Invalid email address.";
        }
        
        logger.warn("Sign up failed", {
          module: "AUTH_CONTEXT",
          error: msg,
        });
        logger.activity("SIGNUP_FAILURE", "AUTH", `Signup process failed for ${email}: ${msg}`, { email, error: msg });
        return { error: msg };
      }
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      const activeToken = (await AsyncStorage.getItem("firebase-token")) || token;
      if (activeToken) {
        await unregisterPushToken(activeToken).catch(() => {});
      }
      await firebaseSignOut(auth);
    } catch (error: any) {
      logger.error("Sign out error", {
        module: "AUTH_CONTEXT",
        error: error.message,
      });
    } finally {
      // Cleanup local data regardless of signout result
      logger.info("Starting logout cleanup of all local data", { module: "AUTH_CONTEXT" });
      
      try {
        // Step 1: Cleanup Sync Engine
        syncEngine.cleanup();

        // Step 2: Wipe SQLite Database
        await clearDatabase();

        // Step 3: Clear AsyncStorage completely
        await AsyncStorage.clear();
        
        logger.activity("LOGOUT_DATA_WIPED", "AUTH", "All local database and cache data cleared successfully");
      } catch (cleanupError: any) {
        logger.error("Logout cleanup failed", {
          module: "AUTH_CONTEXT",
          error: cleanupError.message,
        });
      }
      setToken(null);
      setUser(null);
      setIsEmailVerified(false);
    }
  }, [token]);

  // Listen for global 401 events from API calls
  useEffect(() => {
    const unsubscribe = authEvents.subscribe(() => {
      logger.warn("Global 401 event received. Signing out.", {
        module: "AUTH_CONTEXT",
      });
      signOut();
    });
    return unsubscribe;
  }, [signOut]);

  const sendPasswordResetCode = useCallback(async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
      logger.activity("PASSWORD_RESET_REQUEST", "AUTH", `Password reset email sent to ${email}`, { email });
      return { error: null };
    } catch (e: any) {
      logger.error("Password reset error", {
        module: "AUTH_CONTEXT",
        error: e.message,
      });
      logger.activity("PASSWORD_RESET_FAILURE", "AUTH", `Failed to send reset email to ${email}: ${e.message}`, { email, error: e.message });
      return { error: e.message || "Error sending reset email" };
    }
  }, []);

  const resetPasswordWithCode = useCallback(
    async (email: string, code: string, newPassword: string) => {
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/reset-password-with-code`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code, newPassword }),
        });
        const result = await res.json();
        if (!res.ok) {
          const errorMsg = result.error || "Failed to reset password";
          logger.activity("PASSWORD_RESET_CODE_FAILURE", "AUTH", `Password reset with code failed for ${email}: ${errorMsg}`, { email, error: errorMsg });
          return { error: errorMsg };
        }
        logger.activity("PASSWORD_RESET_CODE_SUCCESS", "AUTH", `Password reset with code successful for ${email}`, { email });
        return { error: null };
      } catch (e: any) {
        logger.activity("PASSWORD_RESET_CODE_FAILURE", "AUTH", `Network error during password reset for ${email}`, { email, error: e.message });
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

      const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ newPassword: password }),
      });
      const result = await res.json();
      if (!res.ok) {
        const errorMsg = result.error || "Failed to change password";
        logger.activity("PASSWORD_CHANGE_FAILURE", "AUTH", `Password change failed: ${errorMsg}`, { error: errorMsg });
        return { error: errorMsg };
      }
      logger.activity("PASSWORD_CHANGE_SUCCESS", "AUTH", "Password changed successfully");
      return { error: null };
    } catch (e: any) {
      logger.activity("PASSWORD_CHANGE_FAILURE", "AUTH", `Network error during password change: ${e.message}`, { error: e.message });
      return { error: e.message || "Network error" };
    }
  }, []);

  const sendVerificationCode = useCallback(async (email: string) => {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (!res.ok) {
        const errorMsg = result.error || "Failed to send code";
        logger.activity("VERIFICATION_CODE_FAILURE", "AUTH", `Failed to send verification code to ${email}: ${errorMsg}`, { email, error: errorMsg });
        return { error: errorMsg };
      }
      logger.activity("VERIFICATION_CODE_REQUEST", "AUTH", `Verification code requested for ${email}`, { email });
      return { error: null };
    } catch (e: any) {
      logger.activity("VERIFICATION_CODE_FAILURE", "AUTH", `Network error sending verification code to ${email}`, { email, error: e.message });
      return { error: e.message || "Network error" };
    }
  }, []);

  const verifySignupCode = useCallback(async (email: string) => {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json();
      if (!res.ok) {
        const errorMsg = result.error || "Invalid code";
        logger.activity("EMAIL_VERIFICATION_FAILURE", "AUTH", `Email verification failed for ${email}: ${errorMsg}`, { email, error: errorMsg });
        return { error: errorMsg };
      }
      logger.activity("EMAIL_VERIFICATION_SUCCESS", "AUTH", `Email verified successfully for ${email}`, { email });
      return { error: null };
    } catch (e: any) {
      logger.activity("EMAIL_VERIFICATION_FAILURE", "AUTH", `Network error during email verification for ${email}`, { email, error: e.message });
      return { error: e.message || "Network error" };
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      logger.warn("Resend ignored: No current user logged in", { module: "AUTH_CONTEXT" });
      return { error: "You must be signed in to request a verification email." };
    }
    try {
      logger.activity("VERIFICATION_RESEND_ATTEMPT", "AUTH", `Resending verification email to ${auth.currentUser.email}`, { email: auth.currentUser.email });
      await sendEmailVerification(auth.currentUser);
      logger.activity("VERIFICATION_RESEND_SUCCESS", "AUTH", `Verification email resent to ${auth.currentUser.email}`, { email: auth.currentUser.email });
      return { error: null };
    } catch (e: any) {
      logger.error("Resend verification failed", { module: "AUTH_CONTEXT", error: e.message });
      logger.activity("VERIFICATION_RESEND_FAILURE", "AUTH", `Failed to resend verification to ${auth.currentUser?.email}`, { email: auth.currentUser?.email, error: e.message });
      return { error: e.message || "Failed to resend verification email" };
    }
  }, []);

  const refreshUser = useCallback(async () => {
    if (!auth.currentUser) return;
    try {
      await auth.currentUser.reload();
      setIsEmailVerified(auth.currentUser.emailVerified);
      logger.debug("Firebase user reloaded", { module: "AUTH_CONTEXT", verified: auth.currentUser.emailVerified });
    } catch (e: any) {
      logger.error("Failed to reload user", { module: "AUTH_CONTEXT", error: e.message });
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
      resendVerificationEmail,
      isEmailVerified,
      refreshUser,
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
      resendVerificationEmail,
      isEmailVerified,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
