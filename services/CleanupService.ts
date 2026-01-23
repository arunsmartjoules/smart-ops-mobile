import AsyncStorage from "@react-native-async-storage/async-storage";
import { SecureStorage } from "@/utils/secureStorage";
import { clearAllOfflineTicketData } from "@/utils/offlineTicketStorage";
import { clearAllOfflineSiteLogData } from "@/utils/syncSiteLogStorage";
import { clearAllCache } from "@/utils/offlineDataCache";
import logger from "@/utils/logger";

// Note: If we had WatermelonDB setup, we would import database here
// import { database } from '@/database';

/**
 * Complete cleanup on logout
 */
export async function performLogoutCleanup(): Promise<void> {
  try {
    logger.info("Starting logout cleanup", { module: "CLEANUP_SERVICE" });

    // 1. Clear secure tokens
    await SecureStorage.clearAll();

    // 2. Clear user data from AsyncStorage
    // We explicitly remove known keys to be safe
    const keysToRemove = [
      "auth_user",
      "@sync_status",
      "@ticket_sync_status",
      "@offline_attendance",
      "@offline_ticket_updates",
      "@cache_metadata",
      "last_sync_time",
      "push_token",
    ];
    await AsyncStorage.multiRemove(keysToRemove);

    // 3. Clear offline data caches
    await clearAllOfflineTicketData();
    await clearAllOfflineSiteLogData();
    await clearAllCache();

    // 4. Clear WatermelonDB data (if applicable in future)
    // await clearWatermelonDB();

    // 5. Clear any remaining cache keys (pattern-based)
    // This is aggressive but ensures no leaked user data
    const allKeys = await AsyncStorage.getAllKeys();
    const cacheKeys = allKeys.filter(
      (key) => key.startsWith("@cache_") || key.startsWith("@offline_"),
    );
    if (cacheKeys.length > 0) {
      await AsyncStorage.multiRemove(cacheKeys);
    }

    logger.info("Logout cleanup complete", { module: "CLEANUP_SERVICE" });
  } catch (error: any) {
    logger.error("Logout cleanup failed", {
      module: "CLEANUP_SERVICE",
      error: error.message,
    });
    // We don't throw here to ensure logout flow continues
  }
}

/**
 * Partial cleanup for switching accounts (if needed in future)
 */
export async function performAccountSwitchCleanup(): Promise<void> {
  await SecureStorage.clearAll();
  await AsyncStorage.removeItem("auth_user");
  await clearAllOfflineTicketData();
  await clearAllOfflineSiteLogData();
}
