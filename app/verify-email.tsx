import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StatusBar,
} from "react-native";
import {
  Zap,
  Mail,
  ExternalLink,
  RefreshCw,
  ArrowLeft,
} from "lucide-react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";

export default function VerifyEmail() {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  const {
    signIn,
    signOut,
    resendVerificationEmail,
    refreshUser,
    isEmailVerified,
  } = useAuth();
  const params = useLocalSearchParams<{ email: string; password?: string }>();
  const email = params.email;

  useEffect(() => {
    logger.info("User visited verification info screen", {
      module: "VERIFY_EMAIL",
      email,
    });
  }, [email]);

  const handleOpenEmail = async () => {
    logger.info("User clicked 'Open Email App'", { module: "VERIFY_EMAIL" });
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
    logger.info("User requested verification email resend", {
      module: "VERIFY_EMAIL",
      email,
    });
    logger.activity(
      "VERIFICATION_RESEND_CLICK",
      "AUTH",
      `User ${email} clicked resend verification link`,
      { email },
    );

    try {
      const { error } = await resendVerificationEmail();
      if (error) {
        showAlert("Resend Failed", error);
      } else {
        showAlert(
          "Resend Successful",
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
    logger.info("User checking verification status", {
      module: "VERIFY_EMAIL",
    });
    setLoading(true);
    await refreshUser();
    setLoading(false);

    // If AuthGuard doesn't automatically redirect us (it should), we can force check here too
    if (isEmailVerified) {
      logger.activity(
        "VERIFICATION_CHECK_SUCCESS",
        "AUTH",
        `User ${email} verified their email manually`,
        { email },
      );
      logger.info("User is verified, navigating to dashboard", {
        module: "VERIFY_EMAIL",
      });
      router.replace("/(tabs)/dashboard");
    } else {
      logger.activity(
        "VERIFICATION_CHECK_FAILURE",
        "AUTH",
        `User ${email} tried to skip verification but is still unverified`,
        { email },
      );
      logger.info("User not verified yet", { module: "VERIFY_EMAIL" });
      showAlert(
        "Not Verified",
        "We couldn't confirm your email yet. Please click the link in your email and try again.",
      );
    }
  };

  const handleBackToSignIn = async () => {
    logger.info("User requested back to sign in from verification screen", { module: "VERIFY_EMAIL" });
    await signOut();
    router.replace("/sign-in");
  };

  return (
    <SafeAreaView className="flex-1 bg-gray-50 dark:bg-slate-950">
      <StatusBar barStyle="dark-content" />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-1 px-8 pt-12 pb-8">
          {/* Header */}
          <View className="items-center mb-10">
            <View className="bg-red-100 p-5 rounded-full mb-6">
              <Mail size={48} color="#dc2626" />
            </View>
            <Text className="text-3xl font-bold text-gray-900 dark:text-white text-center mb-2">
              Verify your email
            </Text>
            <Text className="text-gray-500 dark:text-slate-400 text-base text-center px-4">
              We've sent a verification link to:{"\n"}
              <Text className="text-gray-800 dark:text-slate-200 font-bold">
                {email}
              </Text>
            </Text>
          </View>

          {/* Instructions */}
          <View className="bg-blue-50 dark:bg-slate-900/50 p-4 rounded-xl border border-blue-100 dark:border-slate-800 mb-10 flex-row items-center">
            <Zap size={20} color="#1d4ed8" className="mr-3" />
            <Text className="text-blue-800 dark:text-blue-200 text-sm leading-5 flex-1 ml-3">
              Click the link in the email to activate your account. If you don't
              see it, check your <Text className="font-bold">Spam</Text> folder.
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="space-y-4">
            <TouchableOpacity
              onPress={handleContinue}
              className="bg-white dark:bg-slate-800 border-2 border-red-700 py-3 rounded-lg flex-row items-center justify-center active:scale-95 mt-4"
            >
              <Text className="text-center text-red-700 dark:text-red-400 font-semibold">
                I've Verified, Sign In
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleResend}
              disabled={resendLoading}
              className="flex-row items-center justify-center py-4"
            >
              {resendLoading ? (
                <ActivityIndicator size="small" color="#dc2626" />
              ) : (
                <>
                  <RefreshCw size={14} color="#64748b" />
                  <Text className="text-gray-500 dark:text-slate-400 text-sm ml-2">
                    Didn't get the email?{" "}
                    <Text className="text-red-600 font-semibold">
                      Resend Link
                    </Text>
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Back to Sign In */}
          <View className="items-center mt-auto pb-8">
            <TouchableOpacity
              onPress={handleBackToSignIn}
              className="flex-row items-center justify-center p-4 active:opacity-60"
            >
              <ArrowLeft size={16} color="#94a3b8" />
              <Text className="text-gray-500 dark:text-slate-400 text-sm ml-1">
                Back to{" "}
                <Text className="text-red-600 font-semibold">Sign In</Text>
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
