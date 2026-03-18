import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { Zap, Mail } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { supabase } from "@/services/supabase";
import { showAlert } from "@/utils/alert";

export default function VerifyEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);

  const handleVerify = async () => {
    if (!otp || otp.length < 6) {
      showAlert("Invalid Code", "Please enter the 6-digit code sent to your email.");
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otp,
      type: "signup",
    });
    setLoading(false);

    if (error) {
      showAlert("Verification Failed", error.message || "Invalid or expired code. Please try again.");
    }
    // On success, onAuthStateChange in AuthContext fires and AuthGuard
    // redirects to dashboard automatically
  };

  const handleResend = async () => {
    setLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);

    if (error) {
      showAlert("Resend Failed", error.message || "Could not resend code. Please try again.");
    } else {
      showAlert("Code Sent", "A new verification code has been sent to your email.");
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
            <View className="bg-red-700 dark:bg-red-900 p-10 items-center justify-center rounded-t-2xl h-56">
              <Zap size={40} color="#fecaca" />
              <Text className="text-white text-4xl font-extrabold mt-2">
                JouleOps
              </Text>
              <Text className="text-red-200 mt-1 text-sm">
                Energy Efficiency Management
              </Text>
            </View>

            {/* Form */}
            <View className="p-8 h-full mt-6">
              <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                Verify Your Email
              </Text>
              <Text className="text-gray-500 dark:text-slate-400 text-sm text-center mb-6">
                Enter the 6-digit code sent to{"\n"}
                <Text className="text-gray-800 dark:text-slate-200 font-medium">{email}</Text>
              </Text>

              {/* OTP Input */}
              <View className="mb-6">
                <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                  <Mail size={20} color="#dc2626" />
                </View>
                <TextInput
                  placeholder="6-digit code"
                  value={otp}
                  onChangeText={setOtp}
                  keyboardType="number-pad"
                  maxLength={6}
                  editable={!loading}
                  className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800 text-center text-lg tracking-widest"
                />
              </View>

              {/* Verify Button */}
              <TouchableOpacity
                onPress={handleVerify}
                disabled={loading}
                className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-center text-white font-semibold">
                    Verify Email
                  </Text>
                )}
              </TouchableOpacity>

              {/* Resend */}
              <TouchableOpacity
                onPress={handleResend}
                disabled={loading}
                className="items-center mt-5"
              >
                <Text className="text-gray-600 dark:text-slate-400 text-sm">
                  Didn't receive a code?{" "}
                  <Text className="text-red-600 font-semibold">Resend</Text>
                </Text>
              </TouchableOpacity>

              {/* Back to Sign In */}
              <View className="items-center mt-3">
                <TouchableOpacity
                  onPress={() => router.replace("/sign-in")}
                  disabled={loading}
                >
                  <Text className="text-gray-500 dark:text-slate-400 text-sm">
                    Back to{" "}
                    <Text className="text-red-600 font-semibold">Sign In</Text>
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
