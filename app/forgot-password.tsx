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
import { Mail, Zap, ArrowLeft, Lock, Eye, EyeOff } from "lucide-react-native";
import { router } from "expo-router";
import { showAlert } from "@/utils/alert";
import { useAuth } from "@/contexts/AuthContext";

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
      setStep("code");
    }
  };

  const handleVerifyCode = () => {
    if (!code || code.length !== 6) {
      showAlert("Error", "Please enter the 6-digit code");
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
      showAlert("Error", error);
    } else {
      showAlert(
        "Password Updated",
        "Your password has been changed. Please sign in.",
        [{ text: "Sign In", onPress: () => router.replace("/sign-in") }],
      );
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

            <View className="p-8 mt-2">
              <TouchableOpacity
                onPress={() => {
                  if (step === "email") router.back();
                  else if (step === "code") setStep("email");
                  else setStep("code");
                }}
                disabled={loading}
                className="flex-row items-center mb-6"
              >
                <ArrowLeft size={20} color="#dc2626" />
                <Text className="text-red-600 font-semibold ml-2">
                  {step === "email" ? "Back to Sign In" : "Back"}
                </Text>
              </TouchableOpacity>

              {step === "email" && (
                <>
                  <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                    Reset Password
                  </Text>
                  <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                    Enter your email and we'll send you a verification code
                  </Text>

                  <View className="mb-6">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Mail size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="Your email address"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!loading}
                      className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleSendCode}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-center text-white font-semibold">
                        Send Verification Code
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {step === "code" && (
                <>
                  <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                    Enter Code
                  </Text>
                  <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                    We sent a 6-digit code to{"\n"}
                    <Text className="font-semibold text-gray-800 dark:text-slate-200">
                      {email}
                    </Text>
                  </Text>

                  <View className="mb-6">
                    <TextInput
                      placeholder="6-digit code"
                      value={code}
                      onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
                      keyboardType="number-pad"
                      maxLength={6}
                      editable={!loading}
                      className="px-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800 text-center text-2xl tracking-widest"
                    />
                  </View>

                  <TouchableOpacity
                    onPress={handleVerifyCode}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95 mb-4"
                  >
                    <Text className="text-center text-white font-semibold">
                      Continue
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSendCode}
                    disabled={loading}
                    className="py-2"
                  >
                    <Text className="text-center text-red-600 font-medium">
                      Resend code
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {step === "password" && (
                <>
                  <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                    New Password
                  </Text>
                  <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                    Choose a strong password (min 8 characters)
                  </Text>

                  <View className="mb-4">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Lock size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="New password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      secureTextEntry={!showNew}
                      editable={!loading}
                      className="pl-12 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                    <TouchableOpacity
                      onPress={() => setShowNew((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
                    >
                      {showNew ? (
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
                      placeholder="Confirm new password"
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                      secureTextEntry={!showConfirm}
                      editable={!loading}
                      className="pl-12 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                    <TouchableOpacity
                      onPress={() => setShowConfirm((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
                    >
                      {showConfirm ? (
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
                        Update Password
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
