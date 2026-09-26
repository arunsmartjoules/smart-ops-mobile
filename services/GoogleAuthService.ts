import { Platform } from "react-native";
import { GoogleSignin } from "@react-native-google-signin/google-signin";

const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || "";

// iOS has no google-services.json equivalent bundled here (no
// GoogleService-Info.plist), so the iOS OAuth client id must be passed
// explicitly or configure() throws "failed to determine clientID". Android
// resolves its client from package name + signing SHA-1 and needs nothing.
const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || "";

let configured = false;

function ensureConfigured() {
  if (configured) return;
  if (!GOOGLE_WEB_CLIENT_ID) {
    throw new Error(
      "Google Web client ID is missing. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID from the same Firebase/Google project.",
    );
  }
  if (Platform.OS === "ios" && !GOOGLE_IOS_CLIENT_ID) {
    throw new Error(
      "Google iOS client ID is missing. Set EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID from the same Google project.",
    );
  }

  GoogleSignin.configure({
    webClientId: GOOGLE_WEB_CLIENT_ID,
    ...(GOOGLE_IOS_CLIENT_ID ? { iosClientId: GOOGLE_IOS_CLIENT_ID } : {}),
    scopes: ["openid", "profile", "email"],
  });
  configured = true;
}

export async function getNativeGoogleIdToken(): Promise<string> {
  if (Platform.OS !== "android" && Platform.OS !== "ios") {
    throw new Error("Native Google sign-in is only supported on iOS/Android.");
  }

  ensureConfigured();
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });

  // Clear any cached account selection so the native account picker is always
  // shown. Without this, signIn() silently reuses the last-chosen Google
  // account and users can't switch between accounts available on the device.
  try {
    await GoogleSignin.signOut();
  } catch {
    // signOut throws if no user is signed in — safe to ignore.
  }

  const result: any = await GoogleSignin.signIn();
  const idToken = result?.data?.idToken || result?.idToken;

  if (!idToken) {
    throw new Error("Google sign-in did not return an ID token.");
  }

  return String(idToken);
}
