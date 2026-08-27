/**
 * Sign up — Claude Design "JouleOps Sign Up.dc.html".
 *
 * This screen does NOT create an account. It collects the same nine details
 * the web signup form does, emails a verification code, and hands the payload
 * to /signup-verify, which files a `signup_requests` row once the code checks
 * out. An admin or super-admin approving that request is what creates the
 * user, so the app stays closed until then.
 */
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, View } from "react-native";
import DateTimePicker, {
  DateTimePickerAndroid,
} from "@react-native-community/datetimepicker";
import { router } from "expo-router";
import { format } from "date-fns";
import { CalendarDays, MailCheck, Map as MapIcon } from "lucide-react-native";
import { useAuth, type ApprovingAuthority } from "@/contexts/AuthContext";
import { showAlert } from "@/utils/alert";
import logger from "@/utils/logger";
import { useDs } from "@/hooks/useDs";
import {
  SectionEyebrow,
  SignupField,
  SignupFooter,
  SignupHeader,
  SignupPasswordField,
  SignupPickerField,
  SignupSheet,
  SignupStrength,
  fieldLine,
  initialsOf,
  strengthOf,
  type SheetOption,
} from "@/components/auth/SignupUI";

const MIN_PASSWORD_LENGTH = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** Same shape the backend's create handler accepts. */
const PHONE_RE = /^[0-9+()\s-]{6,20}$/;

type SheetKind = "manager" | null;

export default function SignUp() {
  const ds = useDs();
  const { fetchApprovingAuthorities, sendVerificationCode } = useAuth();

  const [name, setName] = useState("");
  const [employeeCode, setEmployeeCode] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [designation, setDesignation] = useState("");
  const [dateOfJoining, setDateOfJoining] = useState("");
  const [manager, setManager] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const [showPass, setShowPass] = useState(false);
  const [sheet, setSheet] = useState<SheetKind>(null);
  const [iosDateOpen, setIosDateOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const [authorities, setAuthorities] = useState<ApprovingAuthority[]>([]);
  const [authoritiesLoading, setAuthoritiesLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const rows = await fetchApprovingAuthorities();
      if (!alive) return;
      setAuthorities(rows);
      setAuthoritiesLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [fetchApprovingAuthorities]);

  const managerOptions = useMemo<SheetOption[]>(
    () =>
      authorities.map((a) => ({
        label: a.name,
        sub: a.designation ?? undefined,
        initials: initialsOf(a.name),
      })),
    [authorities],
  );
  const managerSub = useMemo(
    () => authorities.find((a) => a.name === manager)?.designation ?? undefined,
    [authorities, manager],
  );

  /* ── Validity ──────────────────────────────────────────────────────────── */

  const trimmedEmail = email.trim();
  const nameOk = name.trim().length >= 2;
  const codeOk = employeeCode.trim().length > 0;
  const emailOk = EMAIL_RE.test(trimmedEmail);
  const phoneOk = PHONE_RE.test(phone.trim());
  const designationOk = designation.trim().length > 0;
  const dateOk = !!dateOfJoining;
  const managerOk = !!manager;
  const passOk = password.length >= MIN_PASSWORD_LENGTH && strengthOf(password) >= 2;
  const matched = confirm.length > 0 && confirm === password;
  const mismatch = confirm.length > 0 && confirm !== password;

  const checks = [
    nameOk,
    codeOk,
    emailOk,
    phoneOk,
    designationOk,
    dateOk,
    managerOk,
    passOk,
    matched,
  ];
  const done = checks.filter(Boolean).length;
  const ready = checks.every(Boolean);

  const blocked = !attempted || ready
    ? null
    : !nameOk
      ? "Enter your full name"
      : !codeOk
        ? "Employee code is required"
        : !emailOk
          ? "Enter a valid work email"
          : !phoneOk
            ? "Enter a valid phone number"
            : !designationOk
              ? "Enter your designation"
              : !dateOk
                ? "Pick your date of joining"
                : !managerOk
                  ? "Choose your approving authority"
                  : !passOk
                    ? `Password needs ${MIN_PASSWORD_LENGTH}+ characters`
                    : "Passwords don't match";

  /* ── Date of joining ───────────────────────────────────────────────────── */

  const applyDate = useCallback((d?: Date) => {
    if (!d) return;
    setDateOfJoining(format(d, "yyyy-MM-dd"));
  }, []);

  const openDatePicker = useCallback(() => {
    const current = dateOfJoining ? new Date(dateOfJoining) : new Date();
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: Number.isNaN(current.getTime()) ? new Date() : current,
        mode: "date",
        maximumDate: new Date(),
        onChange: (event, d) => {
          if (event.type === "set") applyDate(d);
        },
      });
    } else {
      setIosDateOpen(true);
    }
  }, [dateOfJoining, applyDate]);

  /* ── Submit ────────────────────────────────────────────────────────────── */

  const handleSubmit = async () => {
    setAttempted(true);
    if (!ready || busy) return;

    setBusy(true);
    try {
      logger.info("Signup request: sending verification code", {
        module: "SIGN_UP",
        email: trimmedEmail,
      });
      const { error } = await sendVerificationCode(trimmedEmail);
      if (error) {
        showAlert(
          "Couldn't send the code",
          typeof error === "string" ? error : "Please try again.",
        );
        return;
      }

      // The payload rides to the verify step; the request is only filed once
      // the code checks out, so an unverified email never reaches an admin.
      router.push({
        pathname: "/signup-verify",
        params: {
          name: name.trim(),
          employee_code: employeeCode.trim(),
          email: trimmedEmail,
          designation: designation.trim(),
          phone: phone.trim(),
          date_of_joining: dateOfJoining,
          approving_authority: manager,
          password,
        },
      });
    } catch (e: any) {
      logger.error("Unexpected error starting signup", {
        module: "SIGN_UP",
        error: e?.message,
      });
      showAlert("Error", "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <SignupHeader
        title="Create account"
        subtitle={`${done} of ${checks.length} details complete`}
        progress={done / checks.length}
        onBack={() => router.back()}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 18, paddingTop: 18 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionEyebrow first>You</SectionEyebrow>

        <SignupField
          label="Full name"
          placeholder="Your full name"
          value={name}
          onChangeText={setName}
          line={fieldLine(false, nameOk, ds)}
          autoCapitalize="words"
          autoComplete="name"
          editable={!busy}
        />

        <SignupField
          label="Employee code"
          placeholder="SJ-1042"
          value={employeeCode}
          onChangeText={(v) => setEmployeeCode(v.toUpperCase())}
          line={fieldLine(false, codeOk, ds)}
          note="Must match the code on your ID card"
          autoCapitalize="characters"
          autoCorrect={false}
          editable={!busy}
        />

        <SignupField
          label="Work email"
          placeholder="you@smartjoules.in"
          value={email}
          onChangeText={setEmail}
          line={fieldLine(false, emailOk, ds)}
          status={emailOk ? "ok" : null}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          autoCorrect={false}
          editable={!busy}
        />

        <SignupField
          label="Phone number"
          placeholder="98765 43210"
          value={phone}
          onChangeText={setPhone}
          line={fieldLine(false, phoneOk, ds)}
          prefix="+91"
          keyboardType="phone-pad"
          editable={!busy}
        />

        <SectionEyebrow>Work</SectionEyebrow>

        <SignupField
          label="Designation"
          placeholder="Site Technician"
          value={designation}
          onChangeText={setDesignation}
          line={fieldLine(false, designationOk, ds)}
          autoCapitalize="words"
          editable={!busy}
        />

        <SignupPickerField
          label="Date of joining"
          placeholder="Select a date"
          value={
            dateOfJoining
              ? format(new Date(dateOfJoining), "d MMM yyyy")
              : undefined
          }
          line={fieldLine(false, dateOk, ds)}
          leading={CalendarDays}
          onPress={openDatePicker}
        />

        <SignupPickerField
          label="Approving authority"
          placeholder="Select from directory"
          value={manager || undefined}
          sub={managerSub}
          initials={manager ? initialsOf(manager) : undefined}
          line={fieldLine(false, managerOk, ds)}
          leading={MapIcon}
          onPress={() => setSheet("manager")}
        />

        <SectionEyebrow>Security</SectionEyebrow>

        <View style={{ marginBottom: 14 }}>
          <SignupPasswordField
            label="Password"
            placeholder={`Minimum ${MIN_PASSWORD_LENGTH} characters`}
            value={password}
            onChangeText={setPassword}
            line={fieldLine(false, passOk, ds)}
            visible={showPass}
            onToggleVisible={() => setShowPass((v) => !v)}
            autoCapitalize="none"
            autoComplete="new-password"
            editable={!busy}
          />
          <SignupStrength password={password} />
        </View>

        <SignupPasswordField
          label="Confirm password"
          placeholder="Re-enter password"
          value={confirm}
          onChangeText={setConfirm}
          line={fieldLine(mismatch, matched, ds)}
          status={confirm.length === 0 ? null : matched ? "ok" : "error"}
          note={mismatch ? "Passwords don't match" : undefined}
          noteTone="error"
          visible={showPass}
          onToggleVisible={() => setShowPass((v) => !v)}
          autoCapitalize="none"
          editable={!busy}
        />

        <View style={{ height: 12 }} />
      </ScrollView>

      <SignupFooter
        blocked={blocked}
        ctaLabel={busy ? "Sending code…" : "Send verification code"}
        ctaIcon={MailCheck}
        ready={ready}
        busy={busy}
        onSubmit={handleSubmit}
        prompt="Already have an account?"
        action="Sign in"
        onAction={() => router.replace("/sign-in")}
      />

      <SignupSheet
        visible={sheet === "manager"}
        title="Approving authority"
        options={managerOptions}
        selected={manager}
        loading={authoritiesLoading}
        emptyLabel="No approving authority is available right now"
        onSelect={(v) => {
          setManager(v);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
      />

      {iosDateOpen ? (
        <DateTimePicker
          value={dateOfJoining ? new Date(dateOfJoining) : new Date()}
          mode="date"
          display="spinner"
          maximumDate={new Date()}
          onChange={(event, d) => {
            setIosDateOpen(false);
            if (event.type === "set") applyDate(d);
          }}
        />
      ) : null}
    </View>
  );
}
