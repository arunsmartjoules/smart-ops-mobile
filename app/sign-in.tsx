import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Eye, EyeOff } from "lucide-react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { router } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import { getNativeGoogleIdToken } from "@/services/GoogleAuthService";
import { BrandMark } from "@/components/auth/BrandMark";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState<"email" | "password" | null>(null);
  const { signIn, signInWithGoogleIdToken } = useAuth();

  const handleSignIn = async () => {
    if (!email || !password) {
      showAlert("Error", "Please fill in all fields");
      return;
    }
    setLoading(true);
    const { error } = await signIn(email, password);
    setLoading(false);
    if (error) {
      const errorMsg = typeof error === "string" ? error : error.message || "";
      if (
        errorMsg.includes("Invalid login credentials") ||
        errorMsg.includes("invalid_grant") ||
        errorMsg.includes("Email not confirmed")
      ) {
        showAlert(
          "Sign in failed",
          "Wrong email or password. Please try again.",
        );
      } else {
        showAlert("Sign in failed", errorMsg || "An error occurred");
      }
    } else {
      router.replace("/(tabs)/dashboard");
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    try {
      const idToken = await getNativeGoogleIdToken();
      const { error } = await signInWithGoogleIdToken(String(idToken));
      if (error) {
        const msg = typeof error === "string" ? error : error?.message || "";
        showAlert("Google sign in failed", msg || "Authentication error");
        return;
      }
      router.replace("/(tabs)/dashboard");
    } catch (e: any) {
      showAlert("Google sign in failed", e?.message || "Authentication error");
    } finally {
      setLoading(false);
    }
  };

  const fieldBorder = (field: "email" | "password") =>
    focused === field ? "border-red-600" : "border-zinc-200";

  return (
    <View className="flex-1 bg-zinc-50">
      <StatusBar barStyle="dark-content" />
      {/* Red top accent stripe — matches admin web */}
      <View className="h-1 bg-red-600" />

      <SafeAreaView className="flex-1" edges={["top", "bottom"]}>
          <KeyboardAwareScrollView
            contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bottomOffset={20}
          >
            <View className="px-6 py-10 max-w-md w-full mx-auto">
              {/* Brand */}
              <View className="mb-10 mt-2">
                <BrandMark subtitle="Sign in to your account" />
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
                    placeholder="Password"
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

              {/* Forgot password */}
              <View className="items-end mb-6 mt-1">
                <Pressable
                  disabled={loading}
                  onPress={() => router.push("/forgot-password")}
                  hitSlop={6}
                >
                  <Text className="text-[13px] text-red-600 font-medium">
                    Forgot password?
                  </Text>
                </Pressable>
              </View>

              {/* Sign in button */}
              <Pressable
                onPress={handleSignIn}
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
                    Sign in
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
                onPress={handleGoogleSignIn}
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
            </View>

          {/* Footer — like Instagram */}
          <View className="border-t border-zinc-200 py-4 items-center bg-white">
            <View className="flex-row">
              <Text className="text-zinc-500 text-[13px]">
                Don&apos;t have an account?{" "}
              </Text>
              <Pressable
                onPress={() => router.push("/sign-up")}
                disabled={loading}
                hitSlop={6}
              >
                <Text className="text-red-600 font-semibold text-[13px]">
                  Sign up
                </Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAwareScrollView>
      </SafeAreaView>
    </View>
  );
}
