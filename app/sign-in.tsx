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
import { Mail, Lock, Zap, Eye, EyeOff } from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signIn } = useAuth();

  const handleSignIn = async () => {
    if (!email || !password) {
      showAlert("Error", "Please fill in all fields");
      return;
    }

    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);

    if (error) {
      // Check for specific error types
      const errorMsg = typeof error === "string" ? error : error.message || "";

      if (
        errorMsg.includes("Invalid login credentials") ||
        errorMsg.includes("invalid_grant") ||
        errorMsg.includes("Email not confirmed")
      ) {
        showAlert(
          "❌ Sign In Failed",
          "Wrong email or password. Please check your credentials and try again.",
        );
      } else if (errorMsg.includes("Email not confirmed")) {
        showAlert(
          "⚠️ Email Not Confirmed",
          "Please check your email and click the confirmation link before signing in.",
        );
      } else {
        showAlert("Sign In Failed", errorMsg || "An error occurred");
      }
    } else {
      router.replace("/(tabs)/dashboard");
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
              <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-6">
                Welcome Back
              </Text>

              {/* Email */}
              <View className="mb-5">
                <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                  <Mail size={20} color="#dc2626" />
                </View>
                <TextInput
                  placeholder="Email Address"
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
                  placeholder="Password"
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

              {/* Forgot Password */}
              <TouchableOpacity
                className="items-end mb-4"
                disabled={loading}
                onPress={() => router.push("/forgot-password")}
              >
                <Text className="text-sm text-red-600">Forgot Password?</Text>
              </TouchableOpacity>

              {/* Sign In */}
              <TouchableOpacity
                onPress={handleSignIn}
                disabled={loading}
                className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
              >
                {loading ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text className="text-center text-white font-semibold">
                    Secure Sign In
                  </Text>
                )}
              </TouchableOpacity>

              {/* Sign Up */}
              <View className="items-center mt-5">
                <Text className="text-gray-600 dark:text-slate-400 text-sm">
                  Don't have an account?{" "}
                  <TouchableOpacity
                    onPress={() => router.push("/sign-up")}
                    disabled={loading}
                  >
                    <Text className="text-red-600 font-semibold">
                      Sign Up Now
                    </Text>
                  </TouchableOpacity>
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
