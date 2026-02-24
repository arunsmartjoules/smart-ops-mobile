import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import logger from "@/utils/logger";
import { fetchWithTimeout } from "@/utils/apiHelper";

import { API_URL } from "../constants/api";

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Request notification permissions from user
 */
export const requestPermissions = async (): Promise<boolean> => {
  if (!Device.isDevice) {
    logger.warn("Push Notifications attempted on non-physical device", {
      module: "NOTIFICATION_SERVICE",
    });
    return false;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    logger.error("Failed to get push token: permission not granted", {
      module: "NOTIFICATION_SERVICE",
    });
    return false;
  }

  return true;
};

/**
 * Get Expo push token for this device
 */
export const getPushToken = async (): Promise<string | null> => {
  try {
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId || "your-project-id";

    const token = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    return token.data;
  } catch (error: any) {
    logger.error("Error getting push token", {
      module: "NOTIFICATION_SERVICE",
      error: error.message,
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
    const hasPermission = await requestPermissions();

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

    // Register with backend
    const response = await fetchWithTimeout(
      `${API_URL}/notifications/register-token`,
      {
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
      },
    );

    const data = await response.json();

    if (data.success) {
      // Store token locally
      await AsyncStorage.setItem("pushToken", pushToken);
      return { success: true };
    } else {
      return { success: false, error: data.error };
    }
  } catch (error: any) {
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
    const pushToken = await AsyncStorage.getItem("pushToken");

    if (!pushToken) return;

    await fetchWithTimeout(`${API_URL}/notifications/token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ pushToken }),
    });

    await AsyncStorage.removeItem("pushToken");
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
  preferences: { attendance_notifications_enabled: boolean },
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
  requestPermissions,
  registerForPushNotifications,
  unregisterPushToken,
  setupNotificationHandlers,
  getNotificationPreferences,
  updateNotificationPreferences,
};
