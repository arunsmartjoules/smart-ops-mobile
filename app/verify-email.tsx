import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { ExternalLink, Mail, ShieldCheck } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import {
  AuthBubble,
  AuthCta,
  AuthFooter,
  AuthHint,
  AuthScreen,
  AuthSecondaryCta,
  AuthSubtitle,
  AuthTitle,
  useAuthTokens,
} from "@/components/auth/AuthUI";

export default function VerifyEmail() {
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const t = useAuthTokens();
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
    <AuthScreen
      footer={
        <AuthFooter
          prompt={isSigningOut ? "Syncing your changes…" : "Wrong account?"}
          action={isSigningOut ? "Please wait" : "Start over"}
          disabled={isSigningOut}
          onPress={handleBackToSignIn}
        />
      }
    >
      <AuthBubble bg={t.bubbleMailBg}>
        <Mail size={24} color={t.bubbleMailFg} strokeWidth={1.9} />
      </AuthBubble>

      <AuthTitle style={{ marginBottom: 12 }}>Check your inbox</AuthTitle>
      <View style={{ marginBottom: 4 }}>
        <AuthSubtitle>
          Open the verification link we sent to activate your account. Check
          your spam folder if it hasn&apos;t arrived.
        </AuthSubtitle>
      </View>

      <View style={styles.sentToRow}>
        <Text numberOfLines={1} style={[styles.sentToEmail, { color: t.text }]}>
          {email}
        </Text>
      </View>

      <AuthCta label="Open email app" onPress={handleOpenEmail} />

      <View style={{ height: 9 }} />

      <AuthSecondaryCta
        label="I've verified, sign me in"
        onPress={handleContinue}
        busy={loading}
        icon={<ExternalLink size={17} color={t.googleFg} strokeWidth={1.9} />}
      />

      <View style={styles.resendRow}>
        <Text style={[styles.resendPrompt, { color: t.hint }]}>
          Didn&apos;t get it?
        </Text>
        <Pressable onPress={handleResend} disabled={resendLoading} hitSlop={10}>
          <Text style={[styles.resendLink, { color: t.accent }]}>
            {resendLoading ? "Sending…" : "Resend link"}
          </Text>
        </Pressable>
      </View>

      <AuthHint icon={<ShieldCheck size={15} color={t.hint} strokeWidth={1.9} />}>
        Never share this link with anyone
      </AuthHint>
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  sentToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 14,
    marginBottom: 30,
  },
  sentToEmail: { flex: 1, fontSize: 14, fontWeight: "600" },
  resendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    marginTop: 22,
  },
  resendPrompt: { fontSize: 12, fontWeight: "400" },
  resendLink: { fontSize: 13, fontWeight: "600" },
});
