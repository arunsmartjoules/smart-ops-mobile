import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const isSecureStoreAvailable = Platform.OS !== "web";

/**
 * Secure storage wrapper that uses:
 * - SecureStore (iOS Keychain / Android Keystore) on native
 * - AsyncStorage fallback on web (with warning)
 */
export const SecureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    if (isSecureStoreAvailable) {
      await SecureStore.setItemAsync(key, value);
    } else {
      console.warn("SecureStore not available, using AsyncStorage");
      await AsyncStorage.setItem(`secure_${key}`, value);
    }
  },

  async getItem(key: string): Promise<string | null> {
    if (isSecureStoreAvailable) {
      return await SecureStore.getItemAsync(key);
    } else {
      return await AsyncStorage.getItem(`secure_${key}`);
    }
  },

  async deleteItem(key: string): Promise<void> {
    if (isSecureStoreAvailable) {
      await SecureStore.deleteItemAsync(key);
    } else {
      await AsyncStorage.removeItem(`secure_${key}`);
    }
  },

  async clearAll(): Promise<void> {
    const keys = ["auth_token", "refresh_token"];
    await Promise.all(keys.map((key) => this.deleteItem(key)));
  },
};

// Storage keys
export const SECURE_KEYS = {
  AUTH_TOKEN: "auth_token",
  REFRESH_TOKEN: "refresh_token",
} as const;
