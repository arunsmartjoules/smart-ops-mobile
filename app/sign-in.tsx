import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import { getNativeGoogleIdToken } from "@/services/GoogleAuthService";
import { getAppleCredential } from "@/services/AppleAuthService";
import { BrandMark } from "@/components/auth/BrandMark";
import {
  AppleButton,
  AuthCta,
  AuthDivider,
  AuthField,
  AuthFooter,
  AuthLink,
  AuthScreen,
  AuthTitle,
  GoogleButton,
} from "@/components/auth/AuthUI";
import { isEmailValid } from "@/components/auth/authTheme";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const { signIn, signInWithGoogleIdToken, signInWithApple } = useAuth();

  const busy = loading || googleLoading || appleLoading;

  const handleSignIn = async () => {
    if (!email || !password) {
      showAlert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      const errorMsg = typeof error === "string" ? error : error.message || "";
      if (
        errorMsg.includes("Invalid login credentials") ||
        errorMsg.includes("invalid_grant") ||
        errorMsg.includes("Email not confirmed")
      ) {
        showAlert(
          "Sign in failed",
          "Wrong email or password. Please try again.",
        );
      } else {
        showAlert("Sign in failed", errorMsg || "An error occurred");
      }
    } else {
      router.replace("/(tabs)/dashboard");
    }
  };

  const handleGoogleSignIn = async () => {
    setGoogleLoading(true);
    try {
      const idToken = await getNativeGoogleIdToken();
      const { error } = await signInWithGoogleIdToken(String(idToken));
      if (error) {
        const msg = typeof error === "string" ? error : error?.message || "";
        showAlert("Google sign in failed", msg || "Authentication error");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      showAlert("Google sign in failed", e?.message || "Authentication error");
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleAppleSignIn = async () => {
    setAppleLoading(true);
    try {
      const credential = await getAppleCredential();
      const { error } = await signInWithApple(credential);
      if (error) {
        const msg = typeof error === "string" ? error : error?.message || "";
        showAlert("Apple sign in failed", msg || "Authentication error");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      // User dismissing the Apple sheet is not an error.
      if (e?.code === "ERR_REQUEST_CANCELED") return;
      showAlert("Apple sign in failed", e?.message || "Authentication error");
    } finally {
      setAppleLoading(false);
    }
  };

  return (
    <AuthScreen
      footer={
        <AuthFooter
          prompt="New here?"
          action="Create an account"
          disabled={busy}
          onPress={() => router.push("/sign-up")}
        />
      }
    >
      <View style={{ marginBottom: 38 }}>
        <BrandMark />
      </View>

      <AuthTitle style={{ marginBottom: 34 }}>Sign in</AuthTitle>

      <AuthField
        label="Email"
        placeholder="you@smartjoules.in"
        value={email}
        onChangeText={setEmail}
        valid={isEmailValid(email)}
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        textContentType="emailAddress"
        editable={!busy}
        returnKeyType="next"
        containerStyle={{ marginBottom: 24 }}
      />

      <AuthField
        label="Password"
        placeholder="••••••••"
        value={password}
        onChangeText={setPassword}
        secure
        autoCapitalize="none"
        autoComplete="password"
        textContentType="password"
        editable={!busy}
        returnKeyType="go"
        onSubmitEditing={handleSignIn}
        containerStyle={{ marginBottom: 14 }}
      />

      <View style={{ alignItems: "flex-end", marginBottom: 30 }}>
        <AuthLink
          label="Forgot password?"
          disabled={busy}
          onPress={() => router.push("/forgot-password")}
        />
      </View>

      <AuthCta
        label={loading ? "Signing in…" : "Sign in"}
        busy={loading}
        disabled={googleLoading || appleLoading}
        onPress={handleSignIn}
      />

      <AuthDivider />

      <GoogleButton
        onPress={handleGoogleSignIn}
        disabled={loading || appleLoading}
        busy={googleLoading}
      />

      <AppleButton
        onPress={handleAppleSignIn}
        disabled={loading || googleLoading}
      />
    </AuthScreen>
  );
}
