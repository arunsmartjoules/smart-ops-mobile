import React, { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { ShieldAlert, RefreshCw, LogOut, WifiOff } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useSiteResolver } from "@/hooks/useSiteResolver";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";

interface SiteAccessGateProps {
  children: React.ReactNode;
}

/**
 * Blocks access to site-scoped data screens until the SiteResolver has produced
 * a resolution result and the user has at least one authorized site.
 *
 *  - Loading            → centered spinner
 *  - Zero sites         → full-screen "No Site Access" alert with refresh + sign-out
 *  - One or more sites  → renders children
 *
 * Site authorization is sourced from the backend `site_user` table. When online,
 * SiteResolver fetches it from the API and refreshes the local cache; when
 * offline, it uses the cached value. Either way, this gate enforces the rule.
 */
export function SiteAccessGate({ children }: SiteAccessGateProps) {
  const { user, signOut } = useAuth();
  const { isConnected } = useNetworkStatus();
  const userId = user?.user_id || user?.id;
  const { sites, loading, refresh, initialized, state } = useSiteResolver(userId);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  // Don't gate while auth is still establishing the user id.
  if (!userId) return <>{children}</>;

  // Resolution still in flight.
  if (!initialized && loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white dark:bg-slate-900">
        <ActivityIndicator size="large" color="#dc2626" />
        <Text className="mt-4 text-slate-600 dark:text-slate-300 text-sm">
          Loading your sites…
        </Text>
      </View>
    );
  }

  if (sites.length === 0) {
    const isOffline = isConnected === false;
    const apiUnavailable = state?.staleReason === "api_unavailable";

    return (
      <ScrollView
        className="flex-1 bg-white dark:bg-slate-900"
        contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
      >
        <View className="px-6 py-10 items-center">
          <View className="w-20 h-20 rounded-full bg-red-100 dark:bg-red-900/30 items-center justify-center mb-6">
            <ShieldAlert size={40} color="#dc2626" />
          </View>

          <Text className="text-xl font-bold text-slate-900 dark:text-white text-center">
            No Site Access
          </Text>

          <Text className="mt-3 text-base text-slate-600 dark:text-slate-300 text-center leading-6">
            No site has been assigned to you. Please contact your administrator
            to get access.
          </Text>

          {(isOffline || apiUnavailable) && (
            <View className="mt-6 flex-row items-center bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3">
              <WifiOff size={18} color="#b45309" />
              <Text className="ml-2 text-sm text-amber-800 dark:text-amber-200 flex-1">
                {isOffline
                  ? "You're offline. We'll re-check access when you reconnect."
                  : "Couldn't reach the server. Showing cached access."}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleRefresh}
            disabled={refreshing || isConnected === false}
            className={`mt-8 w-full rounded-xl py-4 flex-row items-center justify-center ${
              refreshing || isConnected === false
                ? "bg-slate-300 dark:bg-slate-700"
                : "bg-red-600"
            }`}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <RefreshCw size={18} color="white" />
            )}
            <Text className="ml-2 text-white font-semibold text-base">
              {refreshing ? "Checking…" : "Check Again"}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => signOut()}
            className="mt-3 w-full rounded-xl py-4 flex-row items-center justify-center border border-slate-300 dark:border-slate-700"
          >
            <LogOut size={18} color="#475569" />
            <Text className="ml-2 text-slate-700 dark:text-slate-200 font-semibold text-base">
              Sign Out
            </Text>
          </Pressable>

          {user?.email && (
            <Text className="mt-6 text-xs text-slate-500 dark:text-slate-400 text-center">
              Signed in as {user.email}
            </Text>
          )}
        </View>
      </ScrollView>
    );
  }

  return <>{children}</>;
}

export default SiteAccessGate;
