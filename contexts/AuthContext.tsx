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
import { syncEngine } from "../services/SyncEngine";
import { cacheManager } from "../services/CacheManager";
import siteResolver from "../services/SiteResolver";
import {
  clearStoredAuthToken,
  getStoredAuthToken,
  getValidAuthToken,
  setStoredAuthToken,
  setStoredTokens,
} from "../services/AuthTokenManager";
import { API_BASE_URL } from "../constants/api";
import { fetchWithTimeout } from "../utils/apiHelper";
import { clearDatabase } from "@/database";

const BACKEND_URL = API_BASE_URL;
const LAST_PROFILE_FETCH_STATUS_KEY = "last_profile_fetch_status";

const normalizeEmail = (email?: string | null) =>
  String(email || "").trim().toLowerCase();

interface AuthUser {
  id: string;
  user_id: string;
  email: string;
  name?: string;
  full_name?: string;
  role?: string;
  is_superadmin?: boolean;
  work_location_type?: "WHF" | "WFH" | null;
  department?: string;
  designation?: string;
  phone?: string;
  site_code?: string;
  employee_code?: string;
  /** ISO or backend string, for offline "Joined" display */
  created_at?: string;
  date_of_joining?: string;
  profile_photo_url?: string | null;
}

/** Exactly what `POST /api/signup-requests` accepts — mirrors the web form. */
export interface SignupRequestPayload {
  name: string;
  employee_code: string;
  email: string;
  designation: string;
  phone: string;
  /** Calendar date, YYYY-MM-DD. */
  date_of_joining: string;
  approving_authority: string;
  password: string;
}

export interface ApprovingAuthority {
  name: string;
  designation: string | null;
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
  signInWithGoogleIdToken: (idToken: string) => Promise<{ error: any }>;
  signInWithApple: (payload: {
    identityToken: string;
    fullName?: string | null;
    email?: string | null;
  }) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  /** Soft-deletes the account server-side and wipes this device. */
  deleteAccount: () => Promise<void>;
  sendPasswordResetCode: (email: string) => Promise<{ error: any }>;
  resetPasswordWithCode: (email: string, code: string, newPassword: string) => Promise<{ error: any }>;
  refreshProfile: () => Promise<void>;
  changePassword: (password: string) => Promise<{ error: any }>;
  sendVerificationCode: (email: string) => Promise<{ error: any }>;
  verifySignupCode: (email: string, code: string) => Promise<{ error: any }>;
  /**
   * Files a signup request for admin approval. This does NOT create an
   * account — an admin/super-admin approving the request is what creates the
   * user, so the applicant cannot sign in until then.
   */
  submitSignupRequest: (
    payload: SignupRequestPayload,
  ) => Promise<{ error: any }>;
  /** Public directory of admins/managers who can approve a request. */
  fetchApprovingAuthorities: () => Promise<ApprovingAuthority[]>;
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
  signInWithGoogleIdToken: async () => ({ error: null }),
  signInWithApple: async () => ({ error: null }),
  signOut: async () => {},
  deleteAccount: async () => {},
  sendPasswordResetCode: async () => ({ error: null }),
  resetPasswordWithCode: async () => ({ error: null }),
  refreshProfile: async () => {},
  changePassword: async () => ({ error: null }),
  sendVerificationCode: async () => ({ error: null }),
  verifySignupCode: async () => ({ error: null }),
  submitSignupRequest: async () => ({ error: null }),
  fetchApprovingAuthorities: async () => [],
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

function pickOptionalString(value: unknown): string | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "string") return value;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

/** Map a backend profile / login-response user into our AuthUser shape. */
function mapUser(
  data: Partial<AuthUser> & {
    id?: string;
    user_id?: string;
    email?: string;
    name?: string;
    mobile?: string;
    date_of_joining?: unknown;
    created_at?: unknown;
  },
): AuthUser {
  const backendUserId = String(data.user_id || data.id || "").trim();
  const wltRaw = data.work_location_type;
  const workLocationType: AuthUser["work_location_type"] =
    wltRaw == null || String(wltRaw).trim() === ""
      ? null
      : (String(wltRaw) as NonNullable<AuthUser["work_location_type"]>);
  return {
    id: backendUserId,
    user_id: backendUserId,
    email: normalizeEmail(data.email),
    name: data.name ?? "",
    full_name: data.full_name ?? data.name ?? "",
    role: data.role ?? "",
    is_superadmin: Boolean(
      (data as { is_superadmin?: unknown }).is_superadmin,
    ),
    work_location_type: workLocationType,
    department: data.department ?? "",
    designation: data.designation ?? "",
    phone: data.phone || data.mobile,
    site_code: data.site_code,
    employee_code: data.employee_code,
    created_at: pickOptionalString(data.created_at),
    date_of_joining: pickOptionalString(data.date_of_joining),
    profile_photo_url:
      (data as { profile_photo_url?: string | null }).profile_photo_url ?? null,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEmailVerified, setIsEmailVerified] = useState(false);

  // Fetch extended profile from the backend and merge into user state. Also
  // validates the access token (a dead token surfaces as a non-success here).
  const fetchAndSetProfile = useCallback(
    async (accessToken: string): Promise<AuthUser | null> => {
      const maxAttempts = 3;
      let lastError = "unknown";

      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          const response = await fetchWithTimeout(`${BACKEND_URL}/api/auth/profile`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          const result = await response.json();

          if (
            result.success &&
            result.data &&
            String(result.data.user_id || result.data.id || "").trim()
          ) {
            const mapped = mapUser(result.data);
            await AsyncStorage.setItem("auth_user", JSON.stringify(mapped));
            await AsyncStorage.setItem(
              LAST_PROFILE_FETCH_STATUS_KEY,
              JSON.stringify({
                status: "success",
                normalized_email: normalizeEmail(mapped.email),
                attempts: attempt,
                at: Date.now(),
              }),
            );
            setUser(mapped);
            return mapped;
          }

          lastError = result?.error || "no profile data";
        } catch (e: any) {
          lastError = e?.message || "profile fetch failed";
        }

        if (attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 500));
        }
      }

      logger.warn("Profile fetch failed after retries", {
        module: "AUTH_CONTEXT",
        error: lastError,
      });
      await AsyncStorage.setItem(
        LAST_PROFILE_FETCH_STATUS_KEY,
        JSON.stringify({ status: "failed", error: lastError, at: Date.now() }),
      );

      // Keep the session alive with a cached profile if we have one (offline).
      const cached = await AsyncStorage.getItem("auth_user");
      if (cached) {
        const parsed = JSON.parse(cached) as AuthUser;
        setUser((prev) => (prev?.user_id ? prev : parsed));
        return parsed;
      }
      return null;
    },
    [],
  );

  // Establish an authenticated session from an access token: render a cached
  // user immediately (offline-friendly), fetch the fresh profile, then boot
  // the sync engine, site resolver and push registration. Shared by app
  // startup and every sign-in path.
  const bootstrapSession = useCallback(
    async (accessToken: string, knownUser?: AuthUser | null) => {
      setToken(accessToken);
      await setStoredAuthToken(accessToken);
      setIsEmailVerified(true);

      let earlyUser: AuthUser | null = knownUser ?? null;
      if (!earlyUser) {
        try {
          const cached = await AsyncStorage.getItem("auth_user");
          if (cached) earlyUser = JSON.parse(cached) as AuthUser;
        } catch {
          // ignore malformed cache
        }
      }
      if (earlyUser) {
        setUser(earlyUser);
        if (earlyUser.user_id) {
          await AsyncStorage.setItem("auth_user", JSON.stringify(earlyUser));
        }
        setIsLoading(false);
      }

      const profile = await fetchAndSetProfile(accessToken);
      const bootstrapUserId = profile?.user_id || earlyUser?.user_id || "";

      if (bootstrapUserId) {
        const logEmail = profile?.email || earlyUser?.email || "";
        logger.activity("LOGIN_SUCCESS", "AUTH", `User ${logEmail} logged in successfully`, {
          user_id: bootstrapUserId,
          email: logEmail,
        });
        syncEngine.initialize(bootstrapUserId).catch(() => {});
        siteResolver.initialize(bootstrapUserId).catch(() => {});
        registerForPushNotifications(bootstrapUserId, accessToken)
          .then((result) => {
            if (!result.success) {
              logger.warn("Push registration did not complete during login bootstrap", {
                module: "AUTH_CONTEXT",
                userId: bootstrapUserId,
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
      } else {
        logger.warn("Login in degraded profile mode; sync bootstrap deferred", {
          module: "AUTH_CONTEXT",
        });
      }

      setIsLoading(false);
    },
    [fetchAndSetProfile],
  );

  // On startup, restore a session from the stored token (if any).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = await getStoredAuthToken();
      if (cancelled) return;
      if (stored) {
        await bootstrapSession(stored);
      } else {
        setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bootstrapSession]);

  // Re-register for push when connectivity returns.
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

  // Ensure data sync bootstrap recovers when the profile is refreshed later.
  useEffect(() => {
    if (!token || !user?.user_id) return;
    syncEngine.initialize(user.user_id).catch(() => {});
    siteResolver.initialize(user.user_id).catch(() => {});
  }, [token, user?.user_id]);

  const signIn = useCallback(
    async (email: string, password: string) => {
      logger.activity("LOGIN_ATTEMPT", "AUTH", `Login attempt for ${email}`, { email });
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const result = await res.json();

        if (!res.ok || !result?.success || !result?.data?.token) {
          const msg = result?.error || "Invalid email or password. Please try again.";
          logger.activity("LOGIN_FAILURE", "AUTH", `Login failed for ${email}: ${msg}`, { email, error: msg });
          return { error: msg };
        }

        await setStoredTokens(result.data.token, result.data.refresh_token);
        const mapped = result.data.user ? mapUser(result.data.user) : undefined;
        await bootstrapSession(result.data.token, mapped);
        return { error: null };
      } catch (error: any) {
        const msg = error?.message || "Sign in failed";
        logger.warn("Sign in failed", { module: "AUTH_CONTEXT", error: msg });
        return { error: msg };
      }
    },
    [bootstrapSession],
  );

  const signInWithGoogleIdToken = useCallback(
    async (idToken: string) => {
      try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken }),
        });
        const result = await response.json();

        if (!response.ok || !result?.success || !result?.data?.token) {
          return { error: result?.error || "Google authentication failed" };
        }

        await setStoredTokens(result.data.token, result.data.refresh_token);
        const mapped = result.data.user ? mapUser(result.data.user) : undefined;
        await bootstrapSession(result.data.token, mapped);
        return { error: null };
      } catch (e: any) {
        logger.error("Google sign-in failed", {
          module: "AUTH_CONTEXT",
          error: e?.message || String(e),
        });
        return { error: e?.message || String(e) };
      }
    },
    [bootstrapSession],
  );

  const signInWithApple = useCallback(
    async (payload: {
      identityToken: string;
      fullName?: string | null;
      email?: string | null;
    }) => {
      try {
        const response = await fetchWithTimeout(`${BACKEND_URL}/api/auth/apple`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            identityToken: payload.identityToken,
            fullName: payload.fullName ?? undefined,
            email: payload.email ?? undefined,
          }),
        });
        const result = await response.json();

        if (!response.ok || !result?.success || !result?.data?.token) {
          return { error: result?.error || "Apple authentication failed" };
        }

        await setStoredTokens(result.data.token, result.data.refresh_token);
        const mapped = result.data.user ? mapUser(result.data.user) : undefined;
        await bootstrapSession(result.data.token, mapped);
        return { error: null };
      } catch (e: any) {
        logger.error("Apple sign-in failed", {
          module: "AUTH_CONTEXT",
          error: e?.message || String(e),
        });
        return { error: e?.message || String(e) };
      }
    },
    [bootstrapSession],
  );

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      logger.activity("SIGNUP_ATTEMPT", "AUTH", `Signup start for ${email}`, { email, name });
      try {
        const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/signup`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const result = await res.json();

        if (!res.ok || !result?.success || !result?.data?.token) {
          const msg = result?.error || "Signup failed";
          logger.activity("SIGNUP_FAILURE", "AUTH", `Signup failed for ${email}: ${msg}`, { email, error: msg });
          return { error: msg };
        }

        await setStoredTokens(result.data.token, result.data.refresh_token);
        const mapped = result.data.user ? mapUser(result.data.user) : undefined;
        await bootstrapSession(result.data.token, mapped);
        logger.activity("SIGNUP_COMPLETE", "AUTH", `Signup finished for ${email}`, { email });
        return { error: null };
      } catch (error: any) {
        const msg = error?.message || "Signup failed";
        logger.warn("Sign up failed", { module: "AUTH_CONTEXT", error: msg });
        return { error: msg };
      }
    },
    [bootstrapSession],
  );

  const signOut = useCallback(async () => {
    // Step 0: Drain the offline queue before touching anything else. Logout
    // must not lose unsynced work, and must not leave queued mutations behind
    // for the next user on a shared device to push under their identity.
    const pendingBefore = await cacheManager.getQueueCount();
    if (pendingBefore > 0) {
      logger.info(
        `Logout: flushing ${pendingBefore} pending mutation(s) before sign-out`,
        { module: "AUTH_CONTEXT" },
      );
      try {
        await syncEngine.flushQueue();
      } catch (flushErr: any) {
        logger.error("Logout: queue flush threw", {
          module: "AUTH_CONTEXT",
          error: flushErr?.message,
        });
      }
      const pendingAfter = await cacheManager.getQueueCount();
      if (pendingAfter > 0) {
        logger.error("Logout blocked: queue still has items after flush", {
          module: "AUTH_CONTEXT",
          pendingAfter,
        });
        throw new Error(
          `Cannot sign out: ${pendingAfter} change(s) couldn't be synced. Check your connection and try again.`,
        );
      }
    }

    try {
      const activeToken = (await getStoredAuthToken()) || token;
      if (activeToken) {
        await unregisterPushToken(activeToken).catch(() => {});
      }
    } catch (error: any) {
      logger.error("Sign out error", {
        module: "AUTH_CONTEXT",
        error: error.message,
      });
    }

    // Dead-lettered mutations (retries exhausted — the server permanently
    // rejected them) can never sync, so the flush gate above doesn't catch them
    // and the wipe below would erase them silently. Record what's being
    // discarded first so the loss is auditable rather than invisible.
    try {
      const failed = await cacheManager.getDeadLetterItems();
      if (failed.length > 0) {
        const byType = failed.reduce<Record<string, number>>((acc, it) => {
          acc[it.entity_type] = (acc[it.entity_type] ?? 0) + 1;
          return acc;
        }, {});
        logger.activity(
          "LOGOUT_DISCARDED_FAILED_MUTATIONS",
          "SYNC",
          `Logout discarded ${failed.length} mutation(s) that could not be synced`,
          { count: failed.length, byType, user_id: user?.user_id, email: user?.email },
        );
      }
    } catch (dlErr: any) {
      logger.warn("Logout: failed to inspect dead-letter queue", {
        module: "AUTH_CONTEXT",
        error: dlErr?.message,
      });
    }

    // Cleanup local data. If the wipe fails, do NOT clear the auth state —
    // keeping the user logged in is safer than dropping them at a login screen
    // with another user's data still sitting in SQLite.
    logger.info("Starting logout cleanup of all local data", { module: "AUTH_CONTEXT" });
    await syncEngine.cleanup();
    await clearDatabase();
    await clearStoredAuthToken();
    await AsyncStorage.clear();
    logger.activity("LOGOUT_DATA_WIPED", "AUTH", "All local database and cache data cleared successfully");

    setToken(null);
    setUser(null);
    setIsEmailVerified(false);
  }, [token, user]);

  /**
   * Delete the signed-in user's account (App Store requirement).
   *
   * The backend performs a soft delete — the account is marked Inactive and
   * every session is revoked, so it can no longer sign in. Locally we wipe the
   * device the same way sign-out does, but WITHOUT the "flush the offline queue
   * first" gate: the account is gone server-side, so queued mutations can never
   * be pushed and blocking on them would strand the user in a deleted account.
   */
  const deleteAccount = useCallback(async () => {
    const activeToken = (await getStoredAuthToken()) || token;

    const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/account`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
      },
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}) as any);
      const msg =
        body?.error || "Couldn't delete your account. Please try again.";
      logger.activity(
        "ACCOUNT_DELETE_FAILURE",
        "AUTH",
        `Account deletion failed for ${user?.email || "unknown"}: ${msg}`,
      );
      throw new Error(msg);
    }

    logger.activity(
      "ACCOUNT_DELETED",
      "AUTH",
      `Account deleted for ${user?.email || "unknown"}`,
    );

    // Best-effort: stop push notifications for this device before the local wipe.
    if (activeToken) {
      await unregisterPushToken(activeToken).catch(() => {});
    }

    await syncEngine.cleanup().catch(() => {});
    await clearDatabase().catch(() => {});
    await clearStoredAuthToken();
    await AsyncStorage.clear();

    setToken(null);
    setUser(null);
    setIsEmailVerified(false);
  }, [token, user?.email]);

  // Listen for global auth events, but do not sign users out on generic 401s.
  // Users stay logged in unless they explicitly sign out or their session is
  // revoked (e.g. an admin deactivates the account -> USER_BLOCKED).
  useEffect(() => {
    const unsubscribe = authEvents.subscribe((reason) => {
      // A revoked account (admin deactivation) or a genuinely-dead refresh token
      // (revoked/expired/logged-out) cannot be recovered — sign out so the
      // operator re-authenticates instead of being stuck on "Token expired".
      // Generic 401s (which the API layer transparently refresh-and-retries) do
      // NOT sign the user out.
      if (reason === "session_revoked" || reason === "session_expired") {
        logger.warn("Session ended event received. Signing out.", {
          module: "AUTH_CONTEXT",
          reason,
        });
        signOut();
        return;
      }

      logger.warn("Unauthorized API response received, keeping user signed in.", {
        module: "AUTH_CONTEXT",
        reason,
      });
    });
    return unsubscribe;
  }, [signOut]);

  const sendPasswordResetCode = useCallback(async (email: string) => {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { error: result?.error || "Error sending reset code" };
      }
      logger.activity("PASSWORD_RESET_REQUEST", "AUTH", `Password reset requested for ${email}`, { email });
      return { error: null };
    } catch (e: any) {
      logger.error("Password reset error", { module: "AUTH_CONTEXT", error: e.message });
      return { error: e.message || "Error sending reset code" };
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
    const accessToken = await getValidAuthToken();
    if (!accessToken) return;
    setToken(accessToken);
    try {
      const refreshed = await fetchAndSetProfile(accessToken);
      if (refreshed?.user_id) {
        syncEngine.initialize(refreshed.user_id).catch(() => {});
        siteResolver.initialize(refreshed.user_id).catch(() => {});
      }
    } catch (e: any) {
      logger.warn("refreshProfile: profile fetch error (state unchanged)", {
        module: "AUTH_CONTEXT",
        error: e?.message,
      });
    }
  }, [fetchAndSetProfile]);

  const changePassword = useCallback(async (password: string) => {
    try {
      const accessToken = await getValidAuthToken();
      if (!accessToken) return { error: "Not authenticated" };

      const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
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

  const verifySignupCode = useCallback(async (email: string, code: string) => {
    try {
      const res = await fetchWithTimeout(`${BACKEND_URL}/api/auth/verify-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
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

  /**
   * Files a pending `signup_requests` row and emails every active admin /
   * super-admin to review it. No `users` row is created here — approval is
   * what creates the account, which is what keeps the app closed until then.
   */
  const submitSignupRequest = useCallback(
    async (payload: SignupRequestPayload) => {
      try {
        const res = await fetchWithTimeout(
          `${BACKEND_URL}/api/signup-requests`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        const result = await res.json().catch(() => ({}));
        if (!res.ok || !result?.success) {
          const msg = result?.error || "Could not submit your request";
          logger.activity(
            "SIGNUP_REQUEST_FAILURE",
            "AUTH",
            `Signup request failed for ${payload.email}: ${msg}`,
            { email: payload.email, error: msg },
          );
          return { error: msg };
        }
        logger.activity(
          "SIGNUP_REQUEST_SUBMITTED",
          "AUTH",
          `Signup request submitted for ${payload.email}`,
          { email: payload.email },
        );
        return { error: null };
      } catch (e: any) {
        const msg = e?.message || "Network error";
        logger.warn("Signup request failed", {
          module: "AUTH_CONTEXT",
          error: msg,
        });
        return { error: msg };
      }
    },
    [],
  );

  const fetchApprovingAuthorities = useCallback(async (): Promise<
    ApprovingAuthority[]
  > => {
    try {
      const res = await fetchWithTimeout(
        `${BACKEND_URL}/api/signup-requests/approving-authorities`,
        { method: "GET" },
      );
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result?.success) return [];
      const rows = (result.data ?? result.authorities ?? []) as unknown;
      return Array.isArray(rows) ? (rows as ApprovingAuthority[]) : [];
    } catch (e: any) {
      logger.warn("Could not load approving authorities", {
        module: "AUTH_CONTEXT",
        error: e?.message,
      });
      return [];
    }
  }, []);

  const resendVerificationEmail = useCallback(async () => {
    if (!user?.email) {
      return { error: "You must be signed in to request a verification code." };
    }
    return sendVerificationCode(user.email);
  }, [user?.email, sendVerificationCode]);

  const refreshUser = useCallback(async () => {
    // JouleOps sessions are considered verified; nothing to reload from a
    // provider. Kept for API compatibility with the verification screens.
    setIsEmailVerified(true);
  }, []);

  const value = useMemo(
    () => ({
      user,
      token,
      isLoading,
      signIn,
      signUp,
      signInWithGoogleIdToken,
      signInWithApple,
      signOut,
      deleteAccount,
      sendPasswordResetCode,
      resetPasswordWithCode,
      refreshProfile,
      changePassword,
      sendVerificationCode,
      verifySignupCode,
      submitSignupRequest,
      fetchApprovingAuthorities,
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
      signInWithGoogleIdToken,
      signInWithApple,
      signOut,
      deleteAccount,
      sendPasswordResetCode,
      resetPasswordWithCode,
      refreshProfile,
      changePassword,
      sendVerificationCode,
      verifySignupCode,
      submitSignupRequest,
      fetchApprovingAuthorities,
      resendVerificationEmail,
      isEmailVerified,
      refreshUser,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
