import { Platform } from "react-native";
import * as AppleAuthentication from "expo-apple-authentication";

export interface AppleCredential {
  /** Apple identity token (JWT) — verified server-side against Apple's keys. */
  identityToken: string;
  /**
   * Full name and email are returned by Apple ONLY on the first authorization
   * for this app; both are null on every subsequent sign-in. Capture them here
   * and forward to the backend so the account gets a name on creation.
   */
  fullName?: string | null;
  email?: string | null;
}

/** Sign in with Apple is an iOS-only native flow. */
export async function isAppleSignInAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAppleCredential(): Promise<AppleCredential> {
  if (Platform.OS !== "ios") {
    throw new Error("Sign in with Apple is only available on iOS.");
  }

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
  });

  if (!credential.identityToken) {
    throw new Error("Apple sign-in did not return an identity token.");
  }

  const fullName = credential.fullName
    ? [credential.fullName.givenName, credential.fullName.familyName]
        .filter(Boolean)
        .join(" ")
        .trim() || null
    : null;

  return {
    identityToken: credential.identityToken,
    fullName,
    email: credential.email ?? null,
  };
}
