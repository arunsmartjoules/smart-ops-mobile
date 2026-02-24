import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator,
} from "react-native";
import {
  Mail,
  Zap,
  ArrowLeft,
  Lock,
  KeyRound,
  Eye,
  EyeOff,
} from "lucide-react-native";
import { router } from "expo-router";
import { showAlert } from "@/utils/alert";

import { API_BASE_URL } from "../constants/api";

const API_URL = API_BASE_URL;

export default function ForgotPassword() {
  const [step, setStep] = useState<"email" | "otp" | "password">("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async () => {
    if (!email) {
      showAlert("Error", "Please enter your email");
      return;
    }

    if (!email.toLowerCase().endsWith("@smartjoules.in")) {
      showAlert(
        "Invalid Email",
        "Please use your SmartJoules email (@smartjoules.in)",
      );
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (result.success) {
        showAlert(
          "OTP Sent",
          "A verification code has been sent to your email",
        );
        setStep("otp");
      } else {
        showAlert("Error", result.error || "Failed to send OTP");
      }
    } catch (error: any) {
      showAlert("Error", error.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = () => {
    if (!otp || otp.length !== 6) {
      showAlert("Error", "Please enter the 6-digit OTP");
      return;
    }
    setStep("password");
  };

  const handleResetPassword = async () => {
    if (!newPassword || !confirmPassword) {
      showAlert("Error", "Please fill in all fields");
      return;
    }

    if (newPassword !== confirmPassword) {
      showAlert("Error", "Passwords do not match");
      return;
    }

    if (newPassword.length < 6) {
      showAlert("Error", "Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_URL}/api/auth/reset-password-with-code`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, code: otp, newPassword }),
        },
      );

      const result = await response.json();

      if (result.success) {
        showAlert(
          "✅ Password Reset!",
          "Your password has been updated. You can now sign in.",
          [{ text: "Sign In", onPress: () => router.replace("/sign-in") }],
        );
      } else {
        showAlert("Error", result.error || "Failed to reset password");
      }
    } catch (error: any) {
      showAlert("Error", error.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1 bg-gray-100 dark:bg-slate-950"
    >
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View className="flex-1 items-center justify-center">
          <View className="w-full h-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <View className="bg-red-700 dark:bg-red-900 p-10 items-center justify-center rounded-t-2xl h-56">
              <Zap size={40} color="#fecaca" />
              <Text className="text-white text-4xl font-extrabold mt-2">
                JouleOps
              </Text>
              <Text className="text-red-200 mt-1 text-sm">
                Password Recovery
              </Text>
            </View>

            {/* Form */}
            <View className="p-8 h-full mt-2">
              {/* Back Button */}
              <TouchableOpacity
                onPress={() =>
                  step === "email"
                    ? router.back()
                    : setStep(step === "password" ? "otp" : "email")
                }
                disabled={loading}
                className="flex-row items-center mb-6"
              >
                <ArrowLeft size={20} color="#dc2626" />
                <Text className="text-red-600 font-semibold ml-2">
                  {step === "email" ? "Back to Sign In" : "Back"}
                </Text>
              </TouchableOpacity>

              <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                {step === "email" && "Reset Password"}
                {step === "otp" && "Verify OTP"}
                {step === "password" && "New Password"}
              </Text>
              <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                {step === "email" &&
                  "Enter your email to receive a verification code"}
                {step === "otp" && "Enter the 6-digit code sent to your email"}
                {step === "password" && "Create your new password"}
              </Text>

              {/* Step 1: Email */}
              {step === "email" && (
                <>
                  <View className="mb-6">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Mail size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="Email (@smartjoules.in)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!loading}
                      className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-center text-white font-semibold">
                        Send OTP
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {/* Step 2: OTP */}
              {step === "otp" && (
                <>
                  <View className="mb-6">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <KeyRound size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="6-digit OTP"
                      value={otp}
                      onChangeText={setOtp}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!loading}
                      className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800 text-center text-lg tracking-widest"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleVerifyOtp}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
                  >
                    <Text className="text-center text-white font-semibold">
                      Verify OTP
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={loading}
                    className="mt-4"
                  >
                    <Text className="text-center text-red-600 font-medium">
                      Resend OTP
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Step 3: New Password */}
              {step === "password" && (
                <>
                  <View className="mb-4">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Lock size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="New Password (min 6 chars)"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNewPassword}
                      editable={!loading}
                      className="pl-12 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNewPassword(!showNewPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
                      disabled={loading}
                    >
                      {showNewPassword ? (
                        <EyeOff size={20} color="#94a3b8" />
                      ) : (
                        <Eye size={20} color="#94a3b8" />
                      )}
                    </TouchableOpacity>
                  </View>

                  <View className="mb-6">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Lock size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="Confirm New Password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirmPassword}
                      editable={!loading}
                      className="pl-12 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                    <TouchableOpacity
                      onPress={() =>
                        setShowConfirmPassword(!showConfirmPassword)
                      }
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
                      disabled={loading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff size={20} color="#94a3b8" />
                      ) : (
                        <Eye size={20} color="#94a3b8" />
                      )}
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    onPress={handleResetPassword}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-center text-white font-semibold">
                        Reset Password
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
