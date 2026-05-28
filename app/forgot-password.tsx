import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff, ArrowLeft } from "lucide-react-native";
import { router } from "expo-router";
import { showAlert } from "@/utils/alert";
import { useAuth } from "@/contexts/AuthContext";
import { BrandMark } from "@/components/auth/BrandMark";

type Step = "email" | "code" | "password";

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<string | null>(null);

  const { sendPasswordResetCode, resetPasswordWithCode } = useAuth();

  const handleSendCode = async () => {
    if (!email) {
      showAlert("Error", "Please enter your email");
      return;
    }
    setLoading(true);
    const { error } = await sendPasswordResetCode(email);
    setLoading(false);
    if (error) {
      showAlert("Error", error);
    } else {
      showAlert(
        "Email sent",
        "A password reset link has been sent to your email",
        [{ text: "OK", onPress: () => router.replace("/sign-in") }],
      );
    }
  };

  const handleVerifyCode = async () => {
    if (!code || code.length < 6) {
      showAlert("Error", "Please enter the 6-digit code sent to your email");
      return;
    }
    setStep("password");
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      showAlert("Error", "Please fill in all fields");
      return;
    }
    if (newPassword.length < 8) {
      showAlert("Error", "Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await resetPasswordWithCode(email, code, newPassword);
    setLoading(false);

    if (error) {
      showAlert("Update failed", error);
    } else {
      showAlert(
        "Password updated",
        "Your password has been changed. Please sign in.",
        [{ text: "Sign In", onPress: () => router.replace("/sign-in") }],
      );
    }
  };

  const fieldBorder = (field: string) =>
    focused === field ? "border-red-600" : "border-zinc-200";

  const titles: Record<Step, { title: string; sub: string }> = {
    email: {
      title: "Reset your password",
      sub: "Enter your email and we'll send you a reset link.",
    },
    code: {
      title: "Enter verification code",
      sub: `We sent a 6-digit code to ${email}.`,
    },
    password: {
      title: "Set a new password",
      sub: "Choose a password with at least 8 characters.",
    },
  };

  return (
    <View className="flex-1 bg-zinc-50">
      <StatusBar barStyle="dark-content" />
      <View className="h-1 bg-red-600" />

      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          className="flex-1"
        >
          <ScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View className="px-6 py-10 max-w-md w-full mx-auto">
              <View className="mb-8 mt-2">
                <BrandMark subtitle="Account recovery" />
              </View>

              <Pressable
                onPress={() => {
                  if (step === "email") router.back();
                  else if (step === "code") setStep("email");
                  else setStep("code");
                }}
                disabled={loading}
                hitSlop={8}
                className="flex-row items-center self-start mb-4"
              >
                <ArrowLeft size={14} color="#52525b" />
                <Text className="text-zinc-600 font-medium ml-1.5 text-[13px]">
                  {step === "email" ? "Back to sign in" : "Back"}
                </Text>
              </Pressable>

              <Text className="text-zinc-900 text-[22px] font-bold tracking-tight">
                {titles[step].title}
              </Text>
              <Text className="text-zinc-500 text-[14px] mt-1.5 leading-[20px]">
                {titles[step].sub}
              </Text>

              <View className="h-6" />

              {step === "email" && (
                <>
                  <View className="mb-3">
                    <TextInput
                      placeholder="Email"
                      placeholderTextColor="#a1a1aa"
                      value={email}
                      onChangeText={setEmail}
                      onFocus={() => setFocused("email")}
                      onBlur={() => setFocused(null)}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      autoComplete="email"
                      editable={!loading}
                      className={`bg-white border ${fieldBorder("email")} rounded-xl px-4 py-3.5 text-[15px] text-zinc-900`}
                    />
                  </View>

                  <View className="h-3" />

                  <Pressable
                    onPress={handleSendCode}
                    disabled={loading}
                    style={({ pressed }) => ({
                      opacity: loading ? 0.85 : pressed ? 0.9 : 1,
                    })}
                    className="bg-red-600 rounded-xl py-3.5 items-center justify-center"
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text className="text-white font-semibold text-[15px]">
                        Send reset link
                      </Text>
                    )}
                  </Pressable>
                </>
              )}

              {step === "code" && (
                <>
                  <View className="mb-3">
                    <TextInput
                      placeholder="000000"
                      placeholderTextColor="#d4d4d8"
                      value={code}
                      onChangeText={(v) => setCode(v.replace(/[^0-9]/g, ""))}
                      onFocus={() => setFocused("code")}
                      onBlur={() => setFocused(null)}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!loading}
                      className={`bg-white border ${fieldBorder("code")} rounded-xl px-4 py-3.5 text-center text-[22px] font-semibold tracking-[6px] text-zinc-900`}
                    />
                  </View>

                  <View className="h-3" />

                  <Pressable
                    onPress={handleVerifyCode}
                    disabled={loading}
                    style={({ pressed }) => ({
                      opacity: loading ? 0.85 : pressed ? 0.9 : 1,
                    })}
                    className="bg-red-600 rounded-xl py-3.5 items-center justify-center"
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text className="text-white font-semibold text-[15px]">
                        Verify code
                      </Text>
                    )}
                  </Pressable>

                  <Pressable
                    onPress={handleSendCode}
                    disabled={loading}
                    hitSlop={8}
                    className="py-4 mt-2"
                  >
                    <Text className="text-center text-zinc-500 text-[13px]">
                      Didn&apos;t receive it?{" "}
                      <Text className="text-red-600 font-semibold">
                        Resend
                      </Text>
                    </Text>
                  </Pressable>
                </>
              )}

              {step === "password" && (
                <>
                  <View className="mb-3">
                    <View
                      className={`flex-row items-center bg-white border ${fieldBorder("new")} rounded-xl`}
                    >
                      <TextInput
                        placeholder="New password"
                        placeholderTextColor="#a1a1aa"
                        value={newPassword}
                        onChangeText={setNewPassword}
                        onFocus={() => setFocused("new")}
                        onBlur={() => setFocused(null)}
                        secureTextEntry={!showNew}
                        editable={!loading}
                        className="flex-1 px-4 py-3.5 text-[15px] text-zinc-900"
                      />
                      <Pressable
                        onPress={() => setShowNew((v) => !v)}
                        hitSlop={10}
                        className="px-4 py-2"
                      >
                        {showNew ? (
                          <EyeOff size={18} color="#71717a" />
                        ) : (
                          <Eye size={18} color="#71717a" />
                        )}
                      </Pressable>
                    </View>
                  </View>

                  <View className="mb-3">
                    <View
                      className={`flex-row items-center bg-white border ${fieldBorder("confirm")} rounded-xl`}
                    >
                      <TextInput
                        placeholder="Confirm new password"
                        placeholderTextColor="#a1a1aa"
                        value={confirmPassword}
                        onChangeText={setConfirmPassword}
                        onFocus={() => setFocused("confirm")}
                        onBlur={() => setFocused(null)}
                        secureTextEntry={!showConfirm}
                        editable={!loading}
                        className="flex-1 px-4 py-3.5 text-[15px] text-zinc-900"
                      />
                      <Pressable
                        onPress={() => setShowConfirm((v) => !v)}
                        hitSlop={10}
                        className="px-4 py-2"
                      >
                        {showConfirm ? (
                          <EyeOff size={18} color="#71717a" />
                        ) : (
                          <Eye size={18} color="#71717a" />
                        )}
                      </Pressable>
                    </View>
                  </View>

                  <View className="h-3" />

                  <Pressable
                    onPress={handleResetPassword}
                    disabled={loading}
                    style={({ pressed }) => ({
                      opacity: loading ? 0.85 : pressed ? 0.9 : 1,
                    })}
                    className="bg-red-600 rounded-xl py-3.5 items-center justify-center"
                  >
                    {loading ? (
                      <ActivityIndicator color="#ffffff" />
                    ) : (
                      <Text className="text-white font-semibold text-[15px]">
                        Update password
                      </Text>
                    )}
                  </Pressable>
                </>
              )}
            </View>
          </ScrollView>

          <View className="border-t border-zinc-200 py-4 items-center bg-white">
            <View className="flex-row">
              <Text className="text-zinc-500 text-[13px]">
                Remember your password?{" "}
              </Text>
              <Pressable
                onPress={() => router.replace("/sign-in")}
                disabled={loading}
                hitSlop={6}
              >
                <Text className="text-red-600 font-semibold text-[13px]">
                  Sign in
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
