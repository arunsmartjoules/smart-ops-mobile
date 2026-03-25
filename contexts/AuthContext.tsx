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
import { supabase } from "../services/supabase";
import { syncManager } from "../services/SyncManager";
import { clearAllOfflineTicketData } from "../utils/offlineTicketStorage";
import { clearAllOfflineSiteLogData } from "../utils/syncSiteLogStorage";
import { clearAllCache } from "../utils/offlineDataCache";
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
  resetPassword: (email: string) => Promise<{ error: any }>;
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

/** Map a Supabase session user + optional profile data into our AuthUser shape */
function mapSupabaseUser(
  supabaseUser: any,
  profile?: Partial<AuthUser>,
): AuthUser {
  const meta = supabaseUser.user_metadata || {};
  // Prefer the DB user_id from profile (may differ from Supabase sub)
  const dbUserId = profile?.user_id ?? profile?.id ?? supabaseUser.id;
  return {
    id: dbUserId,
    user_id: dbUserId,
    email: supabaseUser.email ?? "",
    name: profile?.name ?? meta.full_name ?? meta.name ?? "",
    full_name: profile?.full_name ?? meta.full_name ?? meta.name ?? "",
    role: profile?.role ?? meta.role ?? "",
    work_location_type: profile?.work_location_type ?? null,
    department: profile?.department ?? meta.department ?? "",
    designation: profile?.designation ?? meta.designation ?? "",
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
    async (supabaseUser: any, accessToken: string) => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/auth/profile`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const result = await response.json();
        if (result.success && result.data) {
          const mapped = mapSupabaseUser(supabaseUser, result.data);
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
      
      // Fallback: Use fully cached profile if available, otherwise construct from session
      const cached = await AsyncStorage.getItem("auth_user");
      if (cached) {
        const parsed = JSON.parse(cached);
        setUser(parsed);
        return parsed;
      }

      const mapped = mapSupabaseUser(supabaseUser);
      setUser(mapped);
      return mapped;
    },
    [],
  );

  useEffect(() => {
    const initSession = async () => {
      try {
        // Bootstrap: get current session with timeout for offline resilience
        const sessionPromise = supabase.auth.getSession();
        const timeoutPromise = new Promise<null>((resolve) =>
          setTimeout(() => resolve(null), 5000),
        );

        const result = await Promise.race([sessionPromise, timeoutPromise]);

        if (result && "data" in result) {
          const session = result.data.session;
          if (session) {
            setToken(session.access_token);
            // Try cached profile first for instant render
            const cached = await AsyncStorage.getItem("auth_user");
            if (cached) setUser(JSON.parse(cached));
            const userProfile = await fetchAndSetProfile(session.user, session.access_token);
            
            // Register for push notifications on app startup if user is logged in
            if (userProfile?.user_id) {
              registerForPushNotifications(userProfile.user_id, session.access_token)
                .then((result) => {
                  if (result.success) {
                    logger.info("Push notifications registered on startup", {
                      module: "AUTH_CONTEXT",
                    });
                  }
                })
                .catch((error) => {
                  logger.warn("Push notification registration failed on startup", {
                    module: "AUTH_CONTEXT",
                    error: error.message,
                  });
                });
            }
          }
        } else {
          // Trigger the catch block for timeout handling
          throw new Error("Session fetch timed out");
        }
      } catch (error: any) {
        // Timeout or offline network error: fall back to cached user profile
        logger.warn("getSession failed (offline/error) — using cached profile", {
          module: "AUTH_CONTEXT",
          error: error.message,
        });
        const cached = await AsyncStorage.getItem("auth_user");
        if (cached) {
          setUser(JSON.parse(cached));
          // Try to get token from cached session without network
          const storedToken = await AsyncStorage.getItem("sb-token");
          if (storedToken) setToken(storedToken);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initSession();

    // Subscribe to auth state changes (sign-in, sign-out, token refresh, password recovery)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      logger.debug(`Auth state change: ${event}`, { module: "AUTH_CONTEXT" });

      if (session) {
        setToken(session.access_token);
        const userProfile = await fetchAndSetProfile(session.user, session.access_token);
        
        // Register for push notifications after successful sign-in
        if (userProfile?.user_id) {
          registerForPushNotifications(userProfile.user_id, session.access_token)
            .then((result) => {
              if (result.success) {
                logger.info("Push notifications registered successfully", {
                  module: "AUTH_CONTEXT",
                });
              } else {
                logger.warn("Push notification registration failed", {
                  module: "AUTH_CONTEXT",
                  error: result.error,
                });
              }
            })
            .catch((error) => {
              logger.error("Push notification registration error", {
                module: "AUTH_CONTEXT",
                error: error.message,
              });
            });
        }
      } else {
        setToken(null);
        setUser(null);
      }
    });

    return () => subscription.unsubscribe();
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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      logger.warn("Sign in failed", { module: "AUTH_CONTEXT", error: error.message });
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const signUp = useCallback(
    async (email: string, password: string, name: string) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) {
        logger.warn("Sign up failed", {
          module: "AUTH_CONTEXT",
          error: error.message,
        });
        return { error: error.message };
      }
      return { error: null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    try {
      const session = await supabase.auth.getSession();
      const accessToken = session.data.session?.access_token;

      if (accessToken) {
        await unregisterPushToken(accessToken).catch((e) =>
          logger.warn("Push unregistration failure", {
            module: "AUTH_CONTEXT",
            error: e.message,
          }),
        );
      }

      await supabase.auth.signOut();
    } catch (error: any) {
      logger.error("Sign out error", {
        module: "AUTH_CONTEXT",
        error: error.message,
      });
    } finally {
      // Cleanup local data regardless of network result
      syncManager.cleanup();
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
        await clearAllOfflineTicketData();
        await clearAllOfflineSiteLogData();
        await clearAllCache();
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

  const resetPassword = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: "jouleops://reset-password",
    });
    if (error) {
      return { error: error.message };
    }
    return { error: null };
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    await fetchAndSetProfile(session.user, session.access_token);
  }, [fetchAndSetProfile]);

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
