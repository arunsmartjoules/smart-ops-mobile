import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import NetInfo from "@react-native-community/netinfo";
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import { fetchWithTimeout } from "@/utils/apiHelper";
import cacheManager from "./CacheManager";

import { API_URL } from "../constants/api";
import { authEvents } from "@/utils/authEvents";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

const PUSH_TOKEN_STORAGE_KEY = "pushToken";
const LAST_EXPO_PUSH_TOKEN_KEY = "last_expo_push_token";
const LAST_PUSH_STATUS_KEY = "last_push_registration_status";
const LAST_PUSH_TIME_KEY = "last_push_registration_time";
const LAST_PUSH_ERROR_KEY = "last_push_registration_error";

type PushRegistrationStatus =
  | "permission_denied"
  | "offline"
  | "token_fetch_failed"
  | "backend_pending"
  | "success"
  | "failed"
  | "error";

interface NotificationPermissionStatus {
  canAskAgain: boolean;
  granted: boolean;
  isPhysicalDevice: boolean;
  status: Notifications.PermissionStatus | "unavailable";
}

interface NotificationRegistrationPayload {
  userId: string;
  authToken: string;
  deviceId: string;
  platform: string;
  pushToken: string;
}

const setRegistrationDiagnostics = async (
  status: PushRegistrationStatus,
  error?: string | null,
) => {
  const writes: [string, string][] = [
    [LAST_PUSH_STATUS_KEY, status],
    [LAST_PUSH_TIME_KEY, new Date().toISOString()],
  ];

  if (typeof error === "string" && error.length > 0) {
    writes.push([LAST_PUSH_ERROR_KEY, error]);
  }

  await AsyncStorage.multiSet(writes);

  if (!error) {
    await AsyncStorage.removeItem(LAST_PUSH_ERROR_KEY);
  }
};

const isTransientRegistrationError = (
  statusCode?: number,
  errorMessage?: string,
): boolean => {
  if (statusCode === undefined || statusCode === 0) return true;
  if (statusCode >= 500) return true;

  const normalized = String(errorMessage || "").toLowerCase();
  return (
    normalized.includes("network request failed") ||
    normalized.includes("network unavailable") ||
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("abort")
  );
};

const queueNotificationRegistration = async (
  payload: NotificationRegistrationPayload,
  error?: string,
) => {
  const pending = await cacheManager.getPendingQueueItemsByType(
    "notification_token_registration",
  );

  const duplicate = pending.some(
    (item) =>
      item.payload?.pushToken === payload.pushToken &&
      item.payload?.deviceId === payload.deviceId &&
      item.payload?.userId === payload.userId,
  );

  if (!duplicate) {
    await cacheManager.enqueue({
      entity_type: "notification_token_registration",
      operation: "create",
      payload,
    });
  }

  await setRegistrationDiagnostics("backend_pending", error || null);
};

const clearQueuedNotificationRegistrations = async (
  payload: NotificationRegistrationPayload,
) => {
  const pending = await cacheManager.getPendingQueueItemsByType(
    "notification_token_registration",
  );

  await Promise.all(
    pending
      .filter(
        (item) =>
          item.payload?.pushToken === payload.pushToken &&
          item.payload?.deviceId === payload.deviceId &&
          item.payload?.userId === payload.userId,
      )
      .map((item) => cacheManager.dequeue(item.id)),
  );
};

const postPushTokenRegistration = async ({
  userId,
  authToken,
  deviceId,
  platform,
  pushToken,
}: NotificationRegistrationPayload): Promise<{
  success: boolean;
  error?: string;
  statusCode?: number;
}> => {
  const response = await fetchWithTimeout(`${API_URL}/notifications/register-token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      pushToken,
      deviceId,
      platform,
    }),
  });

  if (response.status === 401) {
    authEvents.emitUnauthorized();
    return { success: false, error: "No token provided", statusCode: 401 };
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (response.ok && data?.success) {
    await AsyncStorage.setItem(PUSH_TOKEN_STORAGE_KEY, pushToken);
    await clearQueuedNotificationRegistrations({
      userId,
      authToken,
      deviceId,
      platform,
      pushToken,
    });
    await setRegistrationDiagnostics("success");

    logger.info("PushNotifications: Backend registration successful", {
      module: "NOTIFICATION_SERVICE",
      userId,
    });
    return { success: true };
  }

  const errorMessage =
    data?.error ||
    `Push registration failed with status ${response.status}`;

  return { success: false, error: errorMessage, statusCode: response.status };
};

/**
 * Configure Android notification channels (mandatory for Android 8.0+)
 */
export const setupAndroidChannels = async () => {
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "Default",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#FF231F7C",
    });
  }
};

/**
 * Read notification permission status without prompting the user.
 */
export const getNotificationPermissionStatus =
  async (): Promise<NotificationPermissionStatus> => {
    if (!Device.isDevice) {
      return {
        canAskAgain: false,
        granted: false,
        isPhysicalDevice: false,
        status: "unavailable",
      };
    }

    const permission = await Notifications.getPermissionsAsync();
    return {
      canAskAgain: permission.canAskAgain,
      granted: permission.status === "granted",
      isPhysicalDevice: true,
      status: permission.status,
    };
  };

/**
 * Request notification permissions from user.
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    logger.warn("Push Notifications attempted on non-physical device", {
      module: "NOTIFICATION_SERVICE",
    });
    await setRegistrationDiagnostics(
      "failed",
      "Push notifications require a physical device",
    );
    return false;
  }

  const permission = await getNotificationPermissionStatus();
  let finalStatus = permission.status;

  if (permission.status !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    logger.error("Failed to get push token: permission not granted", {
      module: "NOTIFICATION_SERVICE",
    });
    await setRegistrationDiagnostics(
      "permission_denied",
      "Notification permissions not granted",
    );
    return false;
  }

  // Ensure Android channels are configured
  await setupAndroidChannels();

  return true;
};

export const requestPermissions = requestNotificationPermissions;

/**
 * Get Expo push token for this device
 */
export const getPushToken = async (): Promise<string | null> => {
  try {
    const netState = await NetInfo.fetch();
    const isOnline =
      netState.isConnected === true && netState.isInternetReachable !== false;

    if (!isOnline) {
      await setRegistrationDiagnostics(
        "offline",
        "Device is offline, push token fetch deferred",
      );
      return null;
    }

    // Robust Project ID detection for standalone builds
    const easProjectId = Constants.expoConfig?.extra?.eas?.projectId;
    const legacyProjectId = Constants.projectId;
    const fallbackProjectId = "d1868472-0103-49d5-978e-ece327af4c3e";

    const projectId = easProjectId || legacyProjectId || fallbackProjectId;

    logger.info("PushNotifications: Token Generation Attempt", {
      module: "NOTIFICATION_SERVICE",
      projectId,
      hasEasProjectId: !!easProjectId,
      hasLegacyProjectId: !!legacyProjectId,
      isUsingFallback: !easProjectId && !legacyProjectId,
      isDevice: Device.isDevice,
      deviceName: Device.deviceName,
      expoVersion: Constants.expoVersion,
      platform: Platform.OS,
    });

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    if (token.data) {
      logger.info("PushNotifications: SUCCESS", {
        module: "NOTIFICATION_SERVICE",
        token: token.data,
      });
      // Cache the token for diagnostic display
      await AsyncStorage.setItem(LAST_EXPO_PUSH_TOKEN_KEY, token.data);
    }

    return token.data;
  } catch (error: any) {
    await setRegistrationDiagnostics(
      "token_fetch_failed",
      error.message || "Failed to fetch Expo push token",
    );
    logger.error("Error getting push token", {
      module: "NOTIFICATION_SERVICE",
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
};

/**
 * Register push token with backend
 */
export const registerForPushNotifications = async (
  userId: string,
  authToken: string,
): Promise<{ success: boolean; error?: string }> => {
  try {
    const hasPermission = await requestNotificationPermissions();

    if (!hasPermission) {
      return {
        success: false,
        error: "Notification permissions not granted",
      };
    }

    const pushToken = await getPushToken();

    if (!pushToken) {
      return {
        success: false,
        error: "Failed to get push token",
      };
    }

    // Get device ID
    const deviceId = await getDeviceId();
    const platform = Platform.OS;
    const registrationPayload = {
      userId,
      authToken,
      deviceId,
      platform,
      pushToken,
    };

    try {
      const result = await postPushTokenRegistration(registrationPayload);

      if (result.success) {
        return result;
      }

      if (isTransientRegistrationError(result.statusCode, result.error)) {
        await queueNotificationRegistration(registrationPayload, result.error);
        return {
          success: false,
          error: result.error || "Push registration queued for retry",
        };
      }

      await setRegistrationDiagnostics("failed", result.error || "Unknown error");
      return result;
    } catch (error: any) {
      if (isTransientRegistrationError(undefined, error.message)) {
        await queueNotificationRegistration(registrationPayload, error.message);
        return {
          success: false,
          error: error.message || "Push registration queued for retry",
        };
      }

      throw error;
    }
  } catch (error: any) {
    await setRegistrationDiagnostics("error", error.message);
    logger.error("Error registering for push notifications", {
      module: "NOTIFICATION_SERVICE",
      error: error.message,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Unregister push token (on logout)
 */
export const unregisterPushToken = async (authToken: string): Promise<void> => {
  try {
    const pushToken = await AsyncStorage.getItem(PUSH_TOKEN_STORAGE_KEY);

    if (!pushToken) return;

    await fetchWithTimeout(`${API_URL}/notifications/token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ pushToken }),
    });

    await AsyncStorage.removeItem(PUSH_TOKEN_STORAGE_KEY);
  } catch (error: any) {
    logger.error("Error unregistering push token", {
      module: "NOTIFICATION_SERVICE",
      error: error.message,
    });
  }
};

/**
 * Get device ID (unique identifier for this device)
 */
const getDeviceId = async (): Promise<string> => {
  let deviceId = await AsyncStorage.getItem("deviceId");

  if (!deviceId) {
    // Generate a simple device ID using timestamp and random
    deviceId = `${Device.modelName || "unknown"}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    await AsyncStorage.setItem("deviceId", deviceId);
  }

  return deviceId;
};

/**
 * Setup notification listeners
 * Call this in your app's root component
 */
export const setupNotificationHandlers = (
  onNotificationReceived?: (notification: Notifications.Notification) => void,
  onNotificationTapped?: (response: Notifications.NotificationResponse) => void,
) => {
  // Handle notification received while app is in foreground
  const receivedSubscription = Notifications.addNotificationReceivedListener(
    (notification) => {
      logger.debug("Notification received:", notification);
      onNotificationReceived?.(notification);
    },
  );

  // Handle notification tapped
  const responseSubscription =
    Notifications.addNotificationResponseReceivedListener((response) => {
      logger.debug("Notification tapped:", response);
      onNotificationTapped?.(response);
    });

  return () => {
    receivedSubscription.remove();
    responseSubscription.remove();
  };
};

/**
 * Get user notification preferences
 */
export const getNotificationPreferences = async (authToken: string) => {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/notifications/preferences`,
      {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      },
    );

    if (response.status === 401) {
      return { success: false, error: "No token provided" };
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    logger.error("Error getting notification preferences", {
      module: "NOTIFICATION_SERVICE",
      error: error.message,
    });
    return { success: false, error: error.message };
  }
};

/**
 * Update user notification preferences
 */
export const updateNotificationPreferences = async (
  authToken: string,
  preferences: {
    attendance_notifications_enabled?: boolean;
    ticket_notifications_enabled?: boolean;
  },
) => {
  try {
    const response = await fetchWithTimeout(
      `${API_URL}/notifications/preferences`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify(preferences),
      },
    );

    if (response.status === 401) {
      return { success: false, error: "No token provided" };
    }

    const data = await response.json();
    return data;
  } catch (error: any) {
    logger.error("Error updating notification preferences", {
      module: "NOTIFICATION_SERVICE",
      error: error.message,
    });
    return { success: false, error: error.message };
  }
};

export default {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  requestPermissions,
  registerForPushNotifications,
  unregisterPushToken,
  setupNotificationHandlers,
  getNotificationPreferences,
  updateNotificationPreferences,
};
