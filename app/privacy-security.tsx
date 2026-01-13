// @ts-nocheck
import React, { useState } from "react";

import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  ArrowLeft,
  Lock,
  Eye,
  EyeOff,
  Shield,
  CheckCircle,
} from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";

const API_URL = process.env.EXPO_PUBLIC_API_URL || "http://192.168.31.152:3420";

export default function PrivacySecurity() {
  const { token } = useAuth();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const handleChangePassword = async () => {
    // Validation
    if (!currentPassword || !newPassword || !confirmPassword) {
      Alert.alert("Error", "Please fill in all fields");
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert("Error", "New password must be at least 6 characters");
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert("Error", "New passwords do not match");
      return;
    }

    setIsLoading(true);
    try {
      const response = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSuccessMessage("Password changed successfully!");
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setTimeout(() => {
          setSuccessMessage("");
        }, 3000);
      } else {
        Alert.alert("Error", result.error || "Failed to change password");
      }
    } catch (error: any) {
      Alert.alert("Error", error.message || "Network error. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white items-center justify-center mr-4"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 8,
              elevation: 3,
            }}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
            Privacy & Security
          </Text>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          className="flex-1"
        >
          <ScrollView className="flex-1 px-5">
            {/* Security Icon Header */}
            <View className="items-center py-6">
              <LinearGradient
                colors={["#22c55e", "#16a34a"]}
                style={{
                  width: 80,
                  height: 80,
                  borderRadius: 40,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Shield size={36} color="white" />
              </LinearGradient>
              <Text className="text-slate-900 dark:text-slate-50 text-lg font-bold mt-4">
                Account Security
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-sm text-center mt-1">
                Keep your account secure by updating your password regularly
              </Text>
            </View>

            {/* Success Message */}
            {successMessage ? (
              <View className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4 flex-row items-center">
                <CheckCircle size={20} color="#22c55e" />
                <Text className="text-green-700 ml-3 flex-1 font-medium">
                  {successMessage}
                </Text>
              </View>
            ) : null}

            {/* Change Password Card */}
            <View
              className="bg-white dark:bg-slate-900 rounded-2xl p-5"
              style={{
                shadowColor: "#000",
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.06,
                shadowRadius: 12,
                elevation: 3,
              }}
            >
              <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4">
                Change Password
              </Text>

              {/* Current Password */}
              <View className="mb-4">
                <Text className="text-slate-500 text-sm mb-2">
                  Current Password
                </Text>
                <View className="flex-row items-center bg-slate-50 rounded-xl px-4 border border-slate-200">
                  <Lock size={18} color="#64748b" />
                  <TextInput
                    className="flex-1 py-3.5 px-3 text-slate-900 dark:text-slate-50 dark:bg-slate-800"
                    placeholder="Enter current password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showCurrentPassword}
                    value={currentPassword}
                    onChangeText={setCurrentPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowCurrentPassword(!showCurrentPassword)}
                  >
                    {showCurrentPassword ? (
                      <EyeOff size={18} color="#64748b" />
                    ) : (
                      <Eye size={18} color="#64748b" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* New Password */}
              <View className="mb-4">
                <Text className="text-slate-500 text-sm mb-2">
                  New Password
                </Text>
                <View className="flex-row items-center bg-slate-50 rounded-xl px-4 border border-slate-200">
                  <Lock size={18} color="#64748b" />
                  <TextInput
                    className="flex-1 py-3.5 px-3 text-slate-900 dark:text-slate-50 dark:bg-slate-800"
                    placeholder="Enter new password (min 6 chars)"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showNewPassword}
                    value={newPassword}
                    onChangeText={setNewPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      <EyeOff size={18} color="#64748b" />
                    ) : (
                      <Eye size={18} color="#64748b" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Confirm Password */}
              <View className="mb-6">
                <Text className="text-slate-500 text-sm mb-2">
                  Confirm New Password
                </Text>
                <View className="flex-row items-center bg-slate-50 rounded-xl px-4 border border-slate-200">
                  <Lock size={18} color="#64748b" />
                  <TextInput
                    className="flex-1 py-3.5 px-3 text-slate-900 dark:text-slate-50 dark:bg-slate-800"
                    placeholder="Confirm new password"
                    placeholderTextColor="#94a3b8"
                    secureTextEntry={!showConfirmPassword}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                  />
                  <TouchableOpacity
                    onPress={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff size={18} color="#64748b" />
                    ) : (
                      <Eye size={18} color="#64748b" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleChangePassword}
                disabled={isLoading}
                className="overflow-hidden rounded-xl"
              >
                <LinearGradient
                  colors={["#dc2626", "#b91c1c"]}
                  style={{
                    paddingVertical: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {isLoading ? (
                    <ActivityIndicator color="white" />
                  ) : (
                    <Text className="text-white font-bold text-base">
                      Update Password
                    </Text>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Security Tips */}
            <View className="mt-6 mb-4">
              <Text className="text-slate-400 dark:text-slate-500 text-xs text-center">
                Use a strong password with letters, numbers, and symbols
              </Text>
            </View>

            {/* Forgot Password Link */}
            <TouchableOpacity
              onPress={() => router.push("/forgot-password")}
              className="mb-8"
            >
              <View
                className="bg-white dark:bg-slate-900 rounded-2xl p-4 flex-row items-center justify-center"
                style={{
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.04,
                  shadowRadius: 8,
                  elevation: 2,
                }}
              >
                <Text className="text-red-600 font-medium text-sm">
                  Forgot your current password?
                </Text>
                <Text className="text-slate-500 text-sm ml-1">
                  Reset via email
                </Text>
              </View>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
