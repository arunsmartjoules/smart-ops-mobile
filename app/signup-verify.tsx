/**
 * Signup verification — the second half of "JouleOps Sign Up.dc.html".
 *
 * Confirms the emailed code, then files the signup request for approval. The
 * request is only submitted AFTER the code checks out, so an unverified email
 * never reaches an admin's queue. Nothing here creates an account: approval
 * does, which is what keeps the app closed until an admin acts.
 */
import React, { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { CircleCheck, MailCheck, ShieldCheck } from "lucide-react-native";
import { useAuth, type SignupRequestPayload } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius } from "@/components/home/SiteOverview";
import { CodeInput } from "@/components/auth/AuthUI";
import {
  SignupFooter,
  SignupHeader,
  SectionEyebrow,
} from "@/components/auth/SignupUI";

const CODE_LENGTH = 6;
/** Matches the backend's own resend throttle expectations closely enough. */
const RESEND_SECONDS = 45;

export default function SignupVerify() {
  const styles = useStyles();
  const ds = useDs();
  const { verifySignupCode, submitSignupRequest, sendVerificationCode } =
    useAuth();
  const params = useLocalSearchParams<Record<keyof SignupRequestPayload, string>>();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const [attempted, setAttempted] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const email = String(params.email ?? "");

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const ready = code.trim().length === CODE_LENGTH;

  const handleSubmit = useCallback(async () => {
    setAttempted(true);
    if (!ready || busy) return;

    setBusy(true);
    try {
      const verified = await verifySignupCode(email, code.trim());
      if (verified.error) {
        showAlert(
          "That code didn't work",
          typeof verified.error === "string"
            ? verified.error
            : "Check the code and try again.",
        );
        return;
      }

      const payload: SignupRequestPayload = {
        name: String(params.name ?? ""),
        employee_code: String(params.employee_code ?? ""),
        email,
        designation: String(params.designation ?? ""),
        phone: String(params.phone ?? ""),
        date_of_joining: String(params.date_of_joining ?? ""),
        approving_authority: String(params.approving_authority ?? ""),
        // Carried across the router as CSV — params are strings.
        site_codes: String(params.site_codes ?? "")
          .split(",")
          .map((code) => code.trim())
          .filter(Boolean),
        password: String(params.password ?? ""),
      };

      const filed = await submitSignupRequest(payload);
      if (filed.error) {
        showAlert(
          "Couldn't submit your request",
          typeof filed.error === "string"
            ? filed.error
            : "Please try again.",
        );
        return;
      }

      logger.info("Signup request submitted, awaiting approval", {
        module: "SIGN_UP",
        email,
      });
      setSubmitted(true);
    } catch (e: any) {
      logger.error("Unexpected error submitting signup request", {
        module: "SIGN_UP",
        error: e?.message,
      });
      showAlert("Error", "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [
    ready,
    busy,
    verifySignupCode,
    email,
    code,
    params,
    submitSignupRequest,
  ]);

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    try {
      const { error } = await sendVerificationCode(email);
      if (error) {
        showAlert(
          "Resend failed",
          typeof error === "string" ? error : "Please try again.",
        );
        return;
      }
      setCooldown(RESEND_SECONDS);
      showAlert("Code sent", `A new code is on its way to ${email}.`);
    } finally {
      setResending(false);
    }
  }, [cooldown, resending, sendVerificationCode, email]);

  /* ── Submitted ─────────────────────────────────────────────────────────── */

  if (submitted) {
    return (
      <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
        <SignupHeader
          title="Request sent"
          subtitle="Awaiting admin approval"
          progress={1}
        />
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.doneCard}>
            <View style={styles.doneIcon}>
              <CircleCheck size={26} color={ds.sky[100]} strokeWidth={2} />
            </View>
            <Text style={styles.doneTitle}>Your request is with an admin</Text>
            <Text style={styles.doneBody}>
              We’ve emailed your details to the JouleOps administrators. Once
              someone approves your request, your account is created and you can
              sign in with the password you just chose.
            </Text>
            <View style={styles.doneMetaRow}>
              <ShieldCheck size={14} color={ds.carbon[600]} strokeWidth={2} />
              <Text style={styles.doneMeta}>
                You can’t sign in until your account is approved.
              </Text>
            </View>
          </View>
        </ScrollView>

        <SignupFooter
          ctaLabel="Back to sign in"
          ctaIcon={ShieldCheck}
          ready
          onSubmit={() => router.replace("/sign-in")}
        />
      </View>
    );
  }

  /* ── Code entry ────────────────────────────────────────────────────────── */

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <SignupHeader
        title="Verify your email"
        subtitle={`Code sent to ${email}`}
        progress={0.9}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionEyebrow first>Verification code</SectionEyebrow>

        <Text style={styles.lead}>
          Enter the {CODE_LENGTH}-digit code we emailed you. Your signup request
          goes to an admin once the code is confirmed.
        </Text>

        <CodeInput value={code} onChange={setCode} length={CODE_LENGTH} />

        <Text
          style={[
            styles.resend,
            cooldown > 0 && { color: ds.carbon[600] },
          ]}
          onPress={handleResend}
          suppressHighlighting
        >
          {resending
            ? "Sending…"
            : cooldown > 0
              ? `Resend code in ${cooldown}s`
              : "Resend code"}
        </Text>
      </ScrollView>

      <SignupFooter
        blocked={attempted && !ready ? `Enter all ${CODE_LENGTH} digits` : null}
        ctaLabel={busy ? "Submitting…" : "Submit for approval"}
        ctaIcon={MailCheck}
        ready={ready}
        busy={busy}
        onSubmit={handleSubmit}
      />
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  body: { paddingHorizontal: 18, paddingTop: 18, paddingBottom: 24 },
  lead: {
    fontSize: 13,
    lineHeight: 19,
    color: ds.carbon[400],
    marginBottom: 22,
    marginHorizontal: 2,
  },
  resend: {
    marginTop: 22,
    textAlign: "center",
    fontSize: 12.5,
    fontWeight: "600",
    color: ds.flame[100],
  },

  doneCard: {
    backgroundColor: ds.white,
    borderRadius: 18,
    padding: 20,
    alignItems: "center",
    gap: 10,
    shadowColor: ds.carbon[100],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  doneIcon: {
    width: 52,
    height: 52,
    borderRadius: soRadius.pill,
    backgroundColor: ds.sky[1000],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  doneTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: ds.carbon[100],
    textAlign: "center",
  },
  doneBody: {
    fontSize: 13,
    lineHeight: 20,
    color: ds.carbon[400],
    textAlign: "center",
  },
  doneMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 6,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    alignSelf: "stretch",
    justifyContent: "center",
  },
  doneMeta: { flexShrink: 1, fontSize: 11.5, color: ds.carbon[600] },
}));
