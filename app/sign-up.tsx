import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import { getNativeGoogleIdToken } from "@/services/GoogleAuthService";
import {
  AuthCta,
  AuthDivider,
  AuthField,
  AuthFooter,
  AuthScreen,
  AuthTitle,
  GoogleButton,
  PasswordStrength,
} from "@/components/auth/AuthUI";
import { isEmailValid } from "@/components/auth/authTheme";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const { signUp, signInWithGoogleIdToken } = useAuth();

  const busy = loading || googleLoading;
  // Same gate the mock applies to the "Create account" CTA.
  const canSubmit =
    name.trim().length > 0 && isEmailValid(email) && password.length >= 8;

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      showAlert("Missing fields", "Please fill in all details.");
      return;
    }
    if (password.length < 8) {
      showAlert("Weak password", "Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      logger.info("User clicked Create Account", { module: "SIGN_UP", email });
      const { error } = await signUp(email, password, name);
      if (error) {
        showAlert(
          "Sign up failed",
          typeof error === "string"
            ? error
            : error.message || "An error occurred during sign up.",
        );
      } else {
        router.push({ pathname: "/verify-email", params: { email, password } });
      }
    } catch (e: any) {
      logger.error("Unexpected error during sign up", {
        module: "SIGN_UP",
        error: e.message,
      });
      showAlert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setGoogleLoading(true);
    try {
      const idToken = await getNativeGoogleIdToken();
      const { error } = await signInWithGoogleIdToken(String(idToken));
      if (error) {
        const msg = typeof error === "string" ? error : error?.message || "";
        showAlert("Google sign up failed", msg || "Authentication error");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      showAlert("Google sign up failed", e?.message || "Authentication error");
    } finally {
      setGoogleLoading(false);
    }
  };

  return (
    <AuthScreen
      onBack={() => router.back()}
      footer={
        <AuthFooter
          prompt="Already have an account?"
          action="Sign in"
          disabled={busy}
          onPress={() => router.push("/sign-in")}
        />
      }
    >
      <AuthTitle style={{ marginBottom: 30 }}>Create account</AuthTitle>

      <AuthField
        label="Full name"
        placeholder="Your full name"
        value={name}
        onChangeText={setName}
        autoCapitalize="words"
        autoComplete="name"
        textContentType="name"
        editable={!busy}
        returnKeyType="next"
        containerStyle={{ marginBottom: 22 }}
      />

      <AuthField
        label="Work email"
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
        containerStyle={{ marginBottom: 22 }}
      />

      <View style={{ marginBottom: 26 }}>
        <AuthField
          label="Password"
          placeholder="Minimum 8 characters"
          value={password}
          onChangeText={setPassword}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!busy}
          returnKeyType="go"
          onSubmitEditing={() => canSubmit && handleSignUp()}
        />
        <PasswordStrength password={password} />
      </View>

      <AuthCta
        label={loading ? "Creating account…" : "Create account"}
        busy={loading}
        disabled={!canSubmit || googleLoading}
        onPress={handleSignUp}
      />

      <AuthDivider />

      <GoogleButton
        onPress={handleGoogleSignUp}
        disabled={loading}
        busy={googleLoading}
      />
    </AuthScreen>
  );
}
