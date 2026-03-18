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
import { Mail, Zap, ArrowLeft } from "lucide-react-native";
import { router } from "expo-router";
import { showAlert } from "@/utils/alert";
import { useAuth } from "@/contexts/AuthContext";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const { resetPassword } = useAuth();

  const handleSend = async () => {
    if (!email) {
      showAlert("Error", "Please enter your email");
      return;
    }

    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);

    if (error) {
      showAlert("Error", error);
    } else {
      setSent(true);
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
                onPress={() => router.back()}
                disabled={loading}
                className="flex-row items-center mb-6"
              >
                <ArrowLeft size={20} color="#dc2626" />
                <Text className="text-red-600 font-semibold ml-2">
                  Back to Sign In
                </Text>
              </TouchableOpacity>

              {sent ? (
                <View className="items-center py-8">
                  <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-3">
                    Check Your Email
                  </Text>
                  <Text className="text-gray-500 dark:text-slate-400 text-center mb-8">
                    We sent a password reset link to{"\n"}
                    <Text className="font-semibold text-gray-800 dark:text-slate-200">
                      {email}
                    </Text>
                    {"\n\n"}
                    Tap the link in the email to set a new password.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.replace("/sign-in")}
                    className="bg-red-700 py-3 px-8 rounded-lg"
                  >
                    <Text className="text-white font-semibold">
                      Back to Sign In
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <>
                  <Text className="text-2xl font-bold text-gray-800 dark:text-slate-50 text-center mb-2">
                    Reset Password
                  </Text>
                  <Text className="text-gray-600 dark:text-slate-400 text-center mb-6">
                    Enter your email and we'll send you a reset link
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
                    onPress={handleSend}
                    disabled={loading}
                    className="bg-red-700 py-3 rounded-lg shadow-md active:scale-95"
                  >
                    {loading ? (
                      <ActivityIndicator color="white" />
                    ) : (
                      <Text className="text-center text-white font-semibold">
                        Send Reset Link
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
