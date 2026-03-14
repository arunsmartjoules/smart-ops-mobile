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
import { Mail, Lock, User, Zap, Eye, EyeOff, KeyRound, ArrowLeft } from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import { API_BASE_URL } from "@/constants/api";

export default function SignUp() {
  const [step, setStep] = useState<"details" | "otp">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSendOtp = async () => {
    if (!name || !email || !password) {
      showAlert("Error", "Please fill in all fields");
      return;
    }

    if (!email.toLowerCase().endsWith("@smartjoules.in")) {
      showAlert(
        "Invalid Email Domain",
        "Please use a SmartJoules email address (@smartjoules.in) to sign up.",
      );
      return;
    }

    if (password.length < 6) {
      showAlert("Error", "Password must be at least 6 characters long");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/auth/send-verification`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();

      if (result.success) {
        showAlert("OTP Sent", "A verification code has been sent to your email");
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

  const handleVerifyAndSignUp = async () => {
    if (!otp || otp.length !== 6) {
      showAlert("Error", "Please enter the 6-digit OTP");
      return;
    }

    setLoading(true);
    try {
      // 1. Verify OTP
      const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/verify-signup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code: otp }),
      });

      const verifyResult = await verifyResponse.json();

      if (!verifyResult.success) {
        setLoading(false);
        showAlert("Error", verifyResult.error || "Invalid OTP");
        return;
      }

      // 2. Actually Sign Up
      const { error } = await signUp(email, password, name);
      
      if (error) {
        logger.error("Sign up failure", { error });
        const errorMsg = typeof error === "string" ? error : error.message || "Could not create account";
        showAlert("Sign Up Failed", errorMsg);
      } else {
        showAlert(
          "✅ Account Created Successfully!",
          "Your account is ready. Welcome to JouleOps!",
          [{ text: "Continue", onPress: () => router.replace("/(tabs)/dashboard") }],
        );
      }
    } catch (error: any) {
      showAlert("Error", error.message || "Network error during signup");
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
          {/* Card */}
          <View className="w-full h-full bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden">
            {/* Header */}
            <View className="bg-red-700 dark:bg-red-900 items-center justify-center rounded-t-2xl h-56">
              <Zap size={40} color="#fecaca" />
              <Text className="text-white text-4xl font-extrabold">
                JouleOps
              </Text>
              <Text className="text-red-200 mt-1 text-sm">
                Create Your Account
              </Text>
            </View>

            {/* Form */}
            <View className="p-8 h-full mt-2">
              {step === "otp" && (
                <TouchableOpacity
                  onPress={() => setStep("details")}
                  disabled={loading}
                  className="flex-row items-center mb-6"
                >
                  <ArrowLeft size={20} color="#dc2626" />
                  <Text className="text-red-600 font-semibold ml-2">Back to Details</Text>
                </TouchableOpacity>
              )}

              <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-6">
                {step === "details" ? "Register Now" : "Verify Email"}
              </Text>

              {step === "details" && (
                <>
                  {/* Full Name */}
                  <View className="mb-5">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <User size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="Full Name"
                      value={name}
                      onChangeText={setName}
                      editable={!loading}
                      className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                  </View>

                  {/* Email */}
                  <View className="mb-5">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Mail size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="Email Address (@smartjoules.in)"
                      value={email}
                      onChangeText={setEmail}
                      keyboardType="email-address"
                      autoCapitalize="none"
                      editable={!loading}
                      className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                  </View>

                  {/* Password */}
                  <View className="mb-3">
                    <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                      <Lock size={20} color="#dc2626" />
                    </View>
                    <TextInput
                      placeholder="Password (min. 6 characters)"
                      value={password}
                      onChangeText={setPassword}
                      secureTextEntry={!showPassword}
                      editable={!loading}
                      className="pl-12 pr-12 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                    />
                    <TouchableOpacity
                      onPress={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10"
                      disabled={loading}
                    >
                      {showPassword ? (
                        <EyeOff size={20} color="#94a3b8" />
                      ) : (
                        <Eye size={20} color="#94a3b8" />
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Send OTP Button */}
                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95 mt-4"
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-center text-white font-semibold">
                        Verify Email
                      </Text>
                    )}
                  </TouchableOpacity>
                </>
              )}

              {step === "otp" && (
                <>
                  <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                    Enter the 6-digit code sent to {email}
                  </Text>
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
                    onPress={handleVerifyAndSignUp}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-center text-white font-semibold">
                        Create Account
                      </Text>
                    )}
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    onPress={handleSendOtp}
                    disabled={loading}
                    className="mt-6"
                  >
                    <Text className="text-center text-red-600 font-medium">
                      Resend OTP
                    </Text>
                  </TouchableOpacity>
                </>
              )}

              {/* Already have an account? */}
              {step === "details" && (
                <View className="items-center mt-5">
                  <Text className="text-gray-600 dark:text-slate-400 text-sm">
                    Already registered?{" "}
                    <TouchableOpacity
                      onPress={() => router.push("/sign-in")}
                      disabled={loading}
                    >
                      <Text className="text-red-600 font-semibold">Sign In</Text>
                    </TouchableOpacity>
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
