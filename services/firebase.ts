import { initializeApp, getApps, getApp } from "firebase/app";
// @ts-ignore
import { initializeAuth, getReactNativePersistence } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

// For Mobile, we use environment variables from Expo Constants if available, 
// or fallback to placeholders.
const firebaseConfig = {
  apiKey: 
    Constants.expoConfig?.extra?.firebaseApiKey || 
    process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 
    "YOUR_MOBILE_API_KEY",
  authDomain: 
    Constants.expoConfig?.extra?.firebaseAuthDomain || 
    process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 
    "YOUR_MOBILE_AUTH_DOMAIN",
  projectId: 
    Constants.expoConfig?.extra?.firebaseProjectId || 
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 
    "YOUR_MOBILE_PROJECT_ID",
  storageBucket: 
    Constants.expoConfig?.extra?.firebaseStorageBucket || 
    process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 
    "YOUR_MOBILE_STORAGE_BUCKET",
  messagingSenderId: 
    Constants.expoConfig?.extra?.firebaseMessagingSenderId || 
    process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || 
    "YOUR_MOBILE_MESSAGING_SENDER_ID",
  appId: 
    Constants.expoConfig?.extra?.firebaseAppId || 
    process.env.EXPO_PUBLIC_FIREBASE_APP_ID || 
    "YOUR_MOBILE_APP_ID"
};

import { getStorage } from "firebase/storage";

// Initialize Firebase
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});
const storage = getStorage(app);

export { app, auth, storage };
