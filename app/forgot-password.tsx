import React, { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { KeyRound, LockKeyholeOpen, Mail, ShieldCheck } from "lucide-react-native";
import { showAlert } from "@/utils/alert";
import { useAuth } from "@/contexts/AuthContext";
import {
  AuthBubble,
  AuthCta,
  AuthField,
  AuthFooter,
  AuthHint,
  AuthScreen,
  AuthSubtitle,
  AuthTitle,
  CodeInput,
  PasswordStrength,
  useAuthTokens,
} from "@/components/auth/AuthUI";
import { isEmailValid } from "@/components/auth/authTheme";

type Step = "email" | "code" | "password";

/** Backend reset codes are good for 10 minutes. */
const CODE_TTL_SECONDS = 600;

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(CODE_TTL_SECONDS);

  const t = useAuthTokens();
  const { sendPasswordResetCode, resetPasswordWithCode } = useAuth();

  // Count the code's life down while the code step is on screen.
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (step !== "code") return;
    tickRef.current = setInterval(
      () => setSecondsLeft((s) => (s > 0 ? s - 1 : 0)),
      1000,
    );
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [step]);

  const timerLabel =
    secondsLeft <= 0
      ? "Code expired"
      : `Expires in ${String(Math.floor(secondsLeft / 60)).padStart(2, "0")}:${String(
          secondsLeft % 60,
        ).padStart(2, "0")}`;

  const requestCode = useCallback(
    async (mode: "send" | "resend") => {
      const setBusy = mode === "send" ? setLoading : setResending;
      setBusy(true);
      const { error } = await sendPasswordResetCode(email);
      setBusy(false);
      if (error) {
        showAlert("Couldn't send code", error);
        return;
      }
      setSecondsLeft(CODE_TTL_SECONDS);
      // The backend sends a 6-digit code, not a link — go straight to entry.
      setStep("code");
    },
    [email, sendPasswordResetCode],
  );

  const handleResetPassword = async () => {
    if (newPassword.length < 8) {
      showAlert("Error", "Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      showAlert("Error", "Passwords do not match");
      return;
    }

    setLoading(true);
    const { error } = await resetPasswordWithCode(email, code, newPassword);
    setLoading(false);

    if (error) {
      showAlert("Update failed", error);
    } else {
      showAlert(
        "Password updated",
        "Your password has been changed. Please sign in.",
        [{ text: "Sign in", onPress: () => router.replace("/sign-in") }],
      );
    }
  };

  const handleBack = () => {
    if (step === "email") router.back();
    else if (step === "code") setStep("email");
    else setStep("code");
  };

  const backToSignIn = (
    <AuthFooter
      prompt="Remembered it?"
      action="Back to sign in"
      disabled={loading}
      onPress={() => router.replace("/sign-in")}
    />
  );

  /* ── 1 · Email ────────────────────────────────────────────────────────── */
  if (step === "email") {
    return (
      <AuthScreen onBack={handleBack} footer={backToSignIn}>
        <AuthBubble bg={t.bubbleLockBg}>
          <LockKeyholeOpen size={24} color={t.bubbleLockFg} strokeWidth={1.9} />
        </AuthBubble>

        <AuthTitle style={{ marginBottom: 12 }}>Forgot password</AuthTitle>
        <View style={{ marginBottom: 32 }}>
          <AuthSubtitle>
            We&apos;ll send a six-digit code to your registered email.
          </AuthSubtitle>
        </View>

        <AuthField
          label="Email"
          placeholder="you@smartjoules.in"
          value={email}
          onChangeText={setEmail}
          valid={isEmailValid(email)}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          textContentType="emailAddress"
          editable={!loading}
          returnKeyType="go"
          onSubmitEditing={() => isEmailValid(email) && requestCode("send")}
          containerStyle={{ marginBottom: 32 }}
        />

        <AuthCta
          label={loading ? "Sending…" : "Send code"}
          busy={loading}
          disabled={!isEmailValid(email)}
          onPress={() => requestCode("send")}
        />
      </AuthScreen>
    );
  }

  /* ── 2 · Code ─────────────────────────────────────────────────────────── */
  if (step === "code") {
    return (
      <AuthScreen
        onBack={handleBack}
        footer={
          <AuthFooter
            prompt="Wrong account?"
            action="Start over"
            disabled={loading}
            onPress={() => {
              setCode("");
              setStep("email");
            }}
          />
        }
      >
        <AuthBubble bg={t.bubbleMailBg}>
          <Mail size={24} color={t.bubbleMailFg} strokeWidth={1.9} />
        </AuthBubble>

        <AuthTitle style={{ marginBottom: 12 }}>Enter code</AuthTitle>
        <View style={{ marginBottom: 4 }}>
          <AuthSubtitle>Sent to</AuthSubtitle>
        </View>

        <View style={styles.sentToRow}>
          <Text numberOfLines={1} style={[styles.sentToEmail, { color: t.text }]}>
            {email}
          </Text>
          <Pressable
            onPress={() => setStep("email")}
            disabled={loading}
            hitSlop={10}
          >
            <Text style={[styles.inlineLink, { color: t.accent }]}>Change</Text>
          </Pressable>
        </View>

        <CodeInput value={code} onChange={setCode} editable={!loading} />

        <View style={styles.timerRow}>
          <Text style={[styles.timer, { color: t.hint }]}>{timerLabel}</Text>
          <Pressable
            onPress={() => requestCode("resend")}
            disabled={resending || loading}
            hitSlop={10}
          >
            <Text style={[styles.resend, { color: t.accent }]}>
              {resending ? "Sending…" : "Resend code"}
            </Text>
          </Pressable>
        </View>

        <AuthCta
          label="Verify code"
          disabled={code.length < 6}
          onPress={() => setStep("password")}
        />

        <AuthHint
          icon={<ShieldCheck size={15} color={t.hint} strokeWidth={1.9} />}
        >
          Never share this code with anyone
        </AuthHint>
      </AuthScreen>
    );
  }

  /* ── 3 · New password ─────────────────────────────────────────────────── */
  const canUpdate =
    newPassword.length >= 8 && newPassword === confirmPassword;

  return (
    <AuthScreen onBack={handleBack} footer={backToSignIn}>
      <AuthBubble bg={t.bubbleLockBg}>
        <KeyRound size={24} color={t.bubbleLockFg} strokeWidth={1.9} />
      </AuthBubble>

      <AuthTitle style={{ marginBottom: 12 }}>New password</AuthTitle>
      <View style={{ marginBottom: 32 }}>
        <AuthSubtitle>
          Choose a password with at least eight characters.
        </AuthSubtitle>
      </View>

      <View style={{ marginBottom: 26 }}>
        <AuthField
          label="New password"
          placeholder="Minimum 8 characters"
          value={newPassword}
          onChangeText={setNewPassword}
          secure
          autoCapitalize="none"
          autoComplete="new-password"
          textContentType="newPassword"
          editable={!loading}
          returnKeyType="next"
        />
        <PasswordStrength password={newPassword} />
      </View>

      <AuthField
        label="Confirm password"
        placeholder="Re-enter your password"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        secure
        autoCapitalize="none"
        autoComplete="new-password"
        textContentType="newPassword"
        editable={!loading}
        returnKeyType="go"
        onSubmitEditing={() => canUpdate && handleResetPassword()}
        containerStyle={{ marginBottom: 32 }}
      />

      <AuthCta
        label={loading ? "Updating…" : "Update password"}
        busy={loading}
        disabled={!canUpdate}
        onPress={handleResetPassword}
      />
    </AuthScreen>
  );
}

const styles = StyleSheet.create({
  sentToRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginBottom: 30,
  },
  sentToEmail: { flex: 1, fontSize: 14, fontWeight: "600" },
  inlineLink: { fontSize: 13, fontWeight: "500" },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 30,
  },
  timer: { fontSize: 12, fontWeight: "400" },
  resend: { fontSize: 13, fontWeight: "600" },
});
