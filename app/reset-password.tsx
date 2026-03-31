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
import { Lock, Zap, Eye, EyeOff } from "lucide-react-native";
import { router } from "expo-router";
import { showAlert } from "@/utils/alert";
import { useAuth } from "@/contexts/AuthContext";

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  const { changePassword } = useAuth();
  const handleReset = async () => {
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
    const { error } = await changePassword(newPassword);
    setLoading(false);

    if (error) {
      showAlert("Error", error);
    } else {
      showAlert(
        "✅ Password Updated",
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
              <Text className="text-red-200 mt-1 text-sm">Set New Password</Text>
            </View>

            <View className="p-8 mt-2">
              <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                New Password
              </Text>
              <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                Choose a strong password (min 8 characters)
              </Text>

              {/* New Password */}
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

              {/* Confirm Password */}
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
                onPress={handleReset}
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
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
