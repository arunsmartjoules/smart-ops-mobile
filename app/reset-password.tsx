import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { KeyRound } from "lucide-react-native";
import { showAlert } from "@/utils/alert";
import { useAuth } from "@/contexts/AuthContext";
import {
  AuthBubble,
  AuthCta,
  AuthField,
  AuthFooter,
  AuthScreen,
  AuthSubtitle,
  AuthTitle,
  PasswordStrength,
  useAuthTokens,
} from "@/components/auth/AuthUI";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const t = useAuthTokens();
  const { changePassword } = useAuth();

  const canUpdate = newPassword.length >= 8 && newPassword === confirmPassword;

  const handleReset = async () => {
    if (newPassword.length < 8) {
      showAlert("Error", "Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await changePassword(newPassword);
    setLoading(false);

    if (error) {
      showAlert("Error", error);
    } else {
      showAlert(
        "Password updated",
        "Your password has been changed. Please sign in.",
        [{ text: "Sign in", onPress: () => router.replace("/sign-in") }],
      );
    }
  };

  return (
    <AuthScreen
      onBack={() => router.back()}
      footer={
        <AuthFooter
          prompt="Changed your mind?"
          action="Go back"
          disabled={loading}
          onPress={() => router.back()}
        />
      }
    >
      <AuthBubble bg={t.bubbleLockBg}>
        <KeyRound size={24} color={t.bubbleLockFg} strokeWidth={1.9} />
      </AuthBubble>

      <AuthTitle style={{ marginBottom: 12 }}>New password</AuthTitle>
      <View style={{ marginBottom: 32 }}>
        <AuthSubtitle>
          Choose a password with at least eight characters.
        </AuthSubtitle>
      </View>

      <View style={{ marginBottom: 26 }}>
        <AuthField
          label="New password"
          placeholder="Minimum 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!loading}
          returnKeyType="next"
        />
        <PasswordStrength password={newPassword} />
      </View>

      <AuthField
        label="Confirm password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={() => canUpdate && handleReset()}
        containerStyle={{ marginBottom: 32 }}
      />

      <AuthCta
        label={loading ? "Updating…" : "Update password"}
        busy={loading}
        disabled={!canUpdate}
        onPress={handleReset}
      />
    </AuthScreen>
  );
}
