import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
  StatusBar,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ExternalLink, RefreshCw } from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import { BrandMark } from "@/components/auth/BrandMark";

export default function VerifyEmail() {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const { signOut, resendVerificationEmail, refreshUser, isEmailVerified } =
    useAuth();
  const params = useLocalSearchParams<{ email: string; password?: string }>();
  const email = params.email;

  useEffect(() => {
    logger.info("User visited verification info screen", {
      module: "VERIFY_EMAIL",
      email,
    });
  }, [email]);

  const handleOpenEmail = async () => {
    const url = "mailto:";
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) {
      await Linking.openURL(url);
    } else {
      showAlert(
        "Notice",
        "We couldn't open your email app automatically. Please open it manually.",
      );
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    logger.activity(
      "VERIFICATION_RESEND_CLICK",
      "AUTH",
      `User ${email} clicked resend verification link`,
      { email },
    );
    try {
      const { error } = await resendVerificationEmail();
      if (error) {
        showAlert("Resend failed", error);
      } else {
        showAlert(
          "Resend successful",
          "A new verification link has been sent to your email.",
        );
      }
    } catch (e: any) {
      logger.error("Failed to resend verification email", {
        module: "VERIFY_EMAIL",
        error: e.message,
      });
      showAlert("Error", "Could not resend email. Please try again later.");
    } finally {
      setResendLoading(false);
    }
  };

  const handleContinue = async () => {
    setLoading(true);
    await refreshUser();
    setLoading(false);
    if (isEmailVerified) {
      logger.activity(
        "VERIFICATION_CHECK_SUCCESS",
        "AUTH",
        `User ${email} verified their email manually`,
        { email },
      );
      router.replace("/(tabs)/dashboard");
    } else {
      showAlert(
        "Not verified yet",
        "We couldn't confirm your email yet. Please click the link in your email and try again.",
      );
    }
  };

  const handleBackToSignIn = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/sign-in");
    } catch (err: any) {
      showAlert(
        "Can't sign out yet",
        err?.message ||
          "Some of your changes haven't synced. Check your connection and try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  };

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
            showsVerticalScrollIndicator={false}
          >
            <View className="px-6 py-10 max-w-md w-full mx-auto">
              <View className="mb-10 mt-2">
                <BrandMark subtitle="Verify your email" />
              </View>

              <Text className="text-zinc-900 text-[22px] font-bold tracking-tight text-center">
                Check your inbox
              </Text>
              <Text className="text-zinc-500 text-[14px] mt-2 leading-[20px] text-center">
                We sent a verification link to
              </Text>
              <Text className="text-zinc-900 text-[14px] font-semibold mt-1 text-center">
                {email}
              </Text>

              <View className="h-6" />

              <View className="bg-white border border-zinc-200 rounded-xl p-4">
                <Text className="text-zinc-700 text-[13.5px] leading-[20px]">
                  Open the email and tap the verification link to activate your
                  account. If you don&apos;t see it, please check your{" "}
                  <Text className="font-semibold text-zinc-900">spam</Text>{" "}
                  folder.
                </Text>
              </View>

              <View className="h-6" />

              <Pressable
                onPress={handleOpenEmail}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.9 : 1,
                })}
                className="bg-red-600 rounded-xl py-3.5 flex-row items-center justify-center"
              >
                <ExternalLink size={16} color="#ffffff" strokeWidth={2.25} />
                <Text className="text-white font-semibold text-[15px] ml-2">
                  Open email app
                </Text>
              </Pressable>

              <View className="h-3" />

              <Pressable
                onPress={handleContinue}
                disabled={loading}
                style={({ pressed }) => ({
                  opacity: loading ? 0.6 : pressed ? 0.85 : 1,
                })}
                className="bg-white border border-zinc-200 rounded-xl py-3.5 items-center justify-center"
              >
                {loading ? (
                  <ActivityIndicator color="#072B31" />
                ) : (
                  <Text className="text-zinc-900 font-semibold text-[15px]">
                    I&apos;ve verified, sign me in
                  </Text>
                )}
              </Pressable>

              <Pressable
                onPress={handleResend}
                disabled={resendLoading}
                hitSlop={8}
                className="flex-row items-center justify-center py-4 mt-2"
              >
                {resendLoading ? (
                  <ActivityIndicator size="small" color="#072B31" />
                ) : (
                  <>
                    <RefreshCw size={13} color="#71717a" />
                    <Text className="text-zinc-500 text-[13px] ml-2">
                      Didn&apos;t get it?{" "}
                      <Text className="text-red-600 font-semibold">
                        Resend link
                      </Text>
                    </Text>
                  </>
                )}
              </Pressable>
            </View>
          </ScrollView>

          <View className="border-t border-zinc-200 py-4 items-center bg-white">
            <Pressable
              onPress={handleBackToSignIn}
              disabled={isSigningOut}
              hitSlop={8}
            >
              {isSigningOut ? (
                <View className="flex-row items-center">
                  <ActivityIndicator size="small" color="#71717a" />
                  <Text className="text-zinc-500 text-[13px] ml-2">
                    Syncing your changes…
                  </Text>
                </View>
              ) : (
                <View className="flex-row">
                  <Text className="text-zinc-500 text-[13px]">
                    Wrong email?{" "}
                  </Text>
                  <Text className="text-red-600 font-semibold text-[13px]">
                    Back to sign in
                  </Text>
                </View>
              )}
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}
