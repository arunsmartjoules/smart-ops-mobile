import React, {
  useState,
  useEffect,
  useCallback,
  useMemo,
  memo,
  useRef,
} from "react";
import { TouchableOpacity, Text, View, ActivityIndicator } from "react-native";
import { RefreshCw, Check, AlertCircle } from "lucide-react-native";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { formatDistanceToNow } from "date-fns";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "./../utils/logger";

interface SyncButtonProps {
  onSync: () => Promise<void>;
  pendingCount?: number;
}

const SyncButton = memo(({ onSync, pendingCount = 0 }: SyncButtonProps) => {
  const { isConnected } = useNetworkStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<"idle" | "success" | "error">(
    "idle",
  );
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Refs for timeout cleanup to prevent memory leaks
  const successTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const errorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    loadLastSyncTime();
  }, []);

  const loadLastSyncTime = useCallback(async () => {
    try {
      const timestamp = await AsyncStorage.getItem("last_sync_time");
      if (timestamp) {
        setLastSyncTime(new Date(parseInt(timestamp)));
      }
    } catch (error: any) {
      logger.error("Failed to load last sync time", { error: error.message });
    }
  }, []);

  const handleSync = useCallback(async () => {
    if (!isConnected || isSyncing) return;

    setIsSyncing(true);
    setSyncStatus("idle");

    try {
      await onSync();
      const now = new Date();
      setLastSyncTime(now);
      await AsyncStorage.setItem("last_sync_time", now.getTime().toString());
      setSyncStatus("success");

      // Reset status after 2 seconds (with cleanup)
      if (successTimeoutRef.current) clearTimeout(successTimeoutRef.current);
      successTimeoutRef.current = setTimeout(() => setSyncStatus("idle"), 2000);
    } catch (error: any) {
      logger.error("Sync button operation failed", {
        error: error.message,
        pendingCount,
      });
      setSyncStatus("error");

      // Reset status after 3 seconds (with cleanup)
      if (errorTimeoutRef.current) clearTimeout(errorTimeoutRef.current);
      errorTimeoutRef.current = setTimeout(() => setSyncStatus("idle"), 3000);
    } finally {
      setIsSyncing(false);
    }
  }, [isConnected, isSyncing, onSync, pendingCount]);

  const syncIcon = useMemo(() => {
    if (isSyncing) {
      return <ActivityIndicator size="small" color="white" />;
    }
    if (syncStatus === "success") {
      return <Check size={18} color="white" />;
    }
    if (syncStatus === "error") {
      return <AlertCircle size={18} color="white" />;
    }
    return <RefreshCw size={18} color="white" />;
  }, [isSyncing, syncStatus]);

  const buttonColor = useMemo(() => {
    if (syncStatus === "success") return "bg-green-600";
    if (syncStatus === "error") return "bg-red-600";
    if (!isConnected) return "bg-gray-400";
    return "bg-red-600";
  }, [syncStatus, isConnected]);

  return (
    <View>
      <TouchableOpacity
        onPress={handleSync}
        disabled={!isConnected || isSyncing}
        className={`${buttonColor} px-3 py-2 rounded-lg flex-row items-center active:opacity-80`}
        style={{
          opacity: !isConnected ? 0.5 : 1,
        }}
      >
        {syncIcon}
        <Text className="text-white font-semibold text-sm ml-2">
          {isSyncing ? "Syncing..." : "Sync"}
        </Text>
        {pendingCount > 0 && (
          <View className="bg-white rounded-full w-5 h-5 items-center justify-center ml-2">
            <Text className="text-red-600 font-bold text-xs">
              {pendingCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {lastSyncTime && (
        <Text className="text-xs text-gray-500 mt-1 text-center">
          Last synced {formatDistanceToNow(lastSyncTime, { addSuffix: true })}
        </Text>
      )}
    </View>
  );
});

export default SyncButton;
