import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Eye, EyeOff } from "lucide-react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import { getNativeGoogleIdToken } from "@/services/GoogleAuthService";
import { BrandMark } from "@/components/auth/BrandMark";

type Field = "name" | "email" | "password" | null;

export default function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<Field>(null);
  const { signUp, signInWithGoogleIdToken } = useAuth();

  const handleSignUp = async () => {
    if (!name || !email || !password) {
      showAlert("Missing fields", "Please fill in all details.");
      return;
    }
    if (password.length < 8) {
      showAlert("Weak password", "Password must be at least 8 characters long.");
      return;
    }

    setLoading(true);
    try {
      logger.info("User clicked Create Account", { module: "SIGN_UP", email });
      const { error } = await signUp(email, password, name);
      if (error) {
        showAlert(
          "Sign up failed",
          typeof error === "string"
            ? error
            : error.message || "An error occurred during sign up.",
        );
      } else {
        router.push({ pathname: "/verify-email", params: { email, password } });
      }
    } catch (e: any) {
      logger.error("Unexpected error during sign up", {
        module: "SIGN_UP",
        error: e.message,
      });
      showAlert("Error", "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    try {
      const idToken = await getNativeGoogleIdToken();
      const { error } = await signInWithGoogleIdToken(String(idToken));
      if (error) {
        const msg = typeof error === "string" ? error : error?.message || "";
        showAlert("Google sign up failed", msg || "Authentication error");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      showAlert("Google sign up failed", e?.message || "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const fieldBorder = (field: Exclude<Field, null>) =>
    focused === field ? "border-red-600" : "border-zinc-200";

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
              <View className="mb-10 mt-2">
                <BrandMark subtitle="Create your account" />
              </View>

              {/* Name */}
              <View className="mb-3">
                <TextInput
                  placeholder="Full name"
                  placeholderTextColor="#a1a1aa"
                  value={name}
                  onChangeText={setName}
                  onFocus={() => setFocused("name")}
                  onBlur={() => setFocused(null)}
                  editable={!loading}
                  autoCapitalize="words"
                  className={`bg-white border ${fieldBorder("name")} rounded-xl px-4 py-3.5 text-[15px] text-zinc-900`}
                />
              </View>

              {/* Email */}
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

              {/* Password */}
              <View className="mb-2">
                <View
                  className={`flex-row items-center bg-white border ${fieldBorder("password")} rounded-xl`}
                >
                  <TextInput
                    placeholder="Password (min 8 characters)"
                    placeholderTextColor="#a1a1aa"
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    secureTextEntry={!showPassword}
                    editable={!loading}
                    className="flex-1 px-4 py-3.5 text-[15px] text-zinc-900"
                  />
                  <Pressable
                    onPress={() => setShowPassword(!showPassword)}
                    hitSlop={10}
                    disabled={loading}
                    className="px-4 py-2"
                  >
                    {showPassword ? (
                      <EyeOff size={18} color="#71717a" />
                    ) : (
                      <Eye size={18} color="#71717a" />
                    )}
                  </Pressable>
                </View>
              </View>

              <View className="h-6" />

              {/* Sign up button */}
              <Pressable
                onPress={handleSignUp}
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
                    Sign up
                  </Text>
                )}
              </Pressable>

              {/* Divider */}
              <View className="flex-row items-center my-6">
                <View className="flex-1 h-px bg-zinc-200" />
                <Text className="mx-3 text-[12px] text-zinc-400 font-medium">
                  OR
                </Text>
                <View className="flex-1 h-px bg-zinc-200" />
              </View>

              {/* Google */}
              <Pressable
                onPress={handleGoogleSignUp}
                disabled={loading}
                style={({ pressed }) => ({
                  opacity: loading ? 0.5 : pressed ? 0.85 : 1,
                })}
                className="flex-row items-center justify-center bg-white border border-zinc-200 rounded-xl py-3.5"
              >
                <FontAwesome5 name="google" size={15} color="#ea4335" />
                <Text className="ml-2.5 text-zinc-900 font-medium text-[14.5px]">
                  Continue with Google
                </Text>
              </Pressable>

              {/* Tiny terms note */}
              <Text className="text-center text-zinc-400 text-[11px] mt-6 leading-[16px]">
                By signing up, you agree to our Terms and{"\n"}acknowledge our
                Privacy Policy.
              </Text>
            </View>
          </ScrollView>

          {/* Footer */}
          <View className="border-t border-zinc-200 py-4 items-center bg-white">
            <View className="flex-row">
              <Text className="text-zinc-500 text-[13px]">
                Have an account?{" "}
              </Text>
              <Pressable
                onPress={() => router.push("/sign-in")}
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
