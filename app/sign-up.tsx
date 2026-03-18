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
import { Mail, Lock, User, Zap, Eye, EyeOff } from "lucide-react-native";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";

const ALLOWED_DOMAIN = "@smartjoules.in";

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const { signUp } = useAuth();

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      showAlert("Missing Fields", "Please fill in all details.");
      return;
    }

    if (!email.toLowerCase().endsWith(ALLOWED_DOMAIN)) {
      showAlert(
        "Invalid Email",
        `Please use a SmartJoules email address (${ALLOWED_DOMAIN}) to sign up.`
      );
      return;
    }

    if (password.length < 8) {
      showAlert("Weak Password", "Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await signUp(email, password, name);
      if (error) {
        showAlert("Sign Up Failed", typeof error === "string" ? error : error.message || "An error occurred during sign up.");
      } else {
        router.push({ pathname: "/verify-email", params: { email } });
      }
    } catch (e) {
      showAlert("Error", "Something went wrong. Please try again.");
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
                Create Account
              </Text>

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
                  placeholder={`Email (${ALLOWED_DOMAIN})`}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  editable={!loading}
                  className="pl-12 pr-4 py-3 border border-gray-300 dark:border-slate-700 rounded-lg text-gray-800 dark:text-slate-50 dark:bg-slate-800"
                />
              </View>

              {/* Password */}
              <View className="mb-6">
                <View className="absolute left-3 top-1/2 -translate-y-1/2 z-10">
                  <Lock size={20} color="#dc2626" />
                </View>
                <TextInput
                  placeholder="Password (8+ chars)"
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

              {/* Sign Up Button */}
              <TouchableOpacity
                onPress={handleSignUp}
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

              {/* Sign In */}
              <View className="items-center mt-5">
                <Text className="text-gray-600 dark:text-slate-400 text-sm">
                  Already have an account?{" "}
                  <TouchableOpacity
                    onPress={() => router.push("/sign-in")}
                    disabled={loading}
                  >
                    <Text className="text-red-600 font-semibold">
                      Sign In
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
