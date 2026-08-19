/**
 * Shared building blocks for the auth screens, built 1:1 against the Claude
 * Design "JouleOps Auth.dc.html" artboards (sign in / sign up / forgot
 * password / verification code). Every screen composes these — keep the
 * geometry here so the four screens can't drift apart.
 */
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  TextStyle,
  useColorScheme,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import * as AppleAuthentication from "expo-apple-authentication";
import Svg, { Path } from "react-native-svg";
import { ArrowLeft, CircleCheck, Eye, EyeOff } from "lucide-react-native";
import {
  authRadius,
  passwordScore,
  useAuthPalette,
  type AuthPalette,
} from "./authTheme";

/* NativeWind runs every element through its css-interop wrapper (babel sets
   `jsxImportSource: "nativewind"`), and that wrapper reads `style` as a value —
   a `({ pressed }) => …` callback is collected as an inline rule and silently
   dropped, so the component renders unstyled. Track the press state ourselves
   and always hand Pressable a plain array. */
function usePressed() {
  return useState(false);
}

/* ── Screen shell ─────────────────────────────────────────────────────────
   .scr → .sbar (safe area) → optional back row → .body (centred, 34px
   gutters, scrolls) → .foot (pinned, 34px gutters).                       */

export function AuthScreen({
  children,
  footer,
  onBack,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
  onBack?: () => void;
}) {
  const t = useAuthPalette();
  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <SafeAreaView style={styles.flex} edges={["top"]}>
        {onBack ? (
          <View style={styles.backRow}>
            <Pressable
              onPress={onBack}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Go back"
              style={styles.backHit}
            >
              <ArrowLeft size={22} color={t.backIcon} strokeWidth={2} />
            </Pressable>
          </View>
        ) : null}

        <KeyboardAwareScrollView
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bottomOffset={24}
        >
          {children}
        </KeyboardAwareScrollView>

        {footer ? (
          <View
            style={[
              styles.foot,
              { paddingBottom: Math.max(insets.bottom + 2, 24) },
            ]}
          >
            {footer}
          </View>
        ) : null}
      </SafeAreaView>
    </View>
  );
}

/* ── Type ────────────────────────────────────────────────────────────────── */

export function AuthTitle({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: TextStyle;
}) {
  const t = useAuthPalette();
  return <Text style={[styles.h1, { color: t.text }, style]}>{children}</Text>;
}

export function AuthSubtitle({ children }: { children: React.ReactNode }) {
  const t = useAuthPalette();
  return <Text style={[styles.sub, { color: t.body }]}>{children}</Text>;
}

/* ── Icon bubble (forgot password / verify code) ─────────────────────────── */

export function AuthBubble({
  children,
  bg,
}: {
  children: React.ReactNode;
  bg: string;
}) {
  return <View style={[styles.bubble, { backgroundColor: bg }]}>{children}</View>;
}

/* ── Underlined field ─────────────────────────────────────────────────────
   Caption + a 1.5px rule that both tint to the accent while focused.      */

interface AuthFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  /** Show the filled check pip (used for e-mail fields once valid). */
  valid?: boolean;
  /** Render the eye toggle and mask the value. */
  secure?: boolean;
  containerStyle?: ViewStyle;
}

export function AuthField({
  label,
  valid,
  secure,
  containerStyle,
  onFocus,
  onBlur,
  editable = true,
  ...input
}: AuthFieldProps) {
  const t = useAuthPalette();
  const [focused, setFocused] = useState(false);
  const [reveal, setReveal] = useState(false);

  return (
    <View style={containerStyle}>
      <Text
        style={[styles.label, { color: focused ? t.accent : t.labelIdle }]}
      >
        {label}
      </Text>
      <View
        style={[
          styles.field,
          { borderBottomColor: focused ? t.accent : t.line },
        ]}
      >
        <TextInput
          {...input}
          editable={editable}
          secureTextEntry={secure ? !reveal : false}
          placeholderTextColor={t.placeholder}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, { color: t.text }]}
        />

        {secure ? (
          <Pressable
            onPress={() => setReveal((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={reveal ? "Hide password" : "Show password"}
          >
            {reveal ? (
              <EyeOff size={19} color={t.eye} strokeWidth={1.9} />
            ) : (
              <Eye size={19} color={t.eye} strokeWidth={1.9} />
            )}
          </Pressable>
        ) : null}

        {!secure && valid ? (
          <CircleCheck size={17} color={t.bg} fill={t.valid} strokeWidth={2.4} />
        ) : null}
      </View>
    </View>
  );
}

/* ── Password strength meter (sign up) ───────────────────────────────────── */

export function PasswordStrength({ password }: { password: string }) {
  const t = useAuthPalette();
  const score = passwordScore(password);
  const empty = password.length === 0;
  const tone = empty ? t.labelIdle : score >= 3 ? t.pwStrong : t.pwWeak;
  const caption = empty
    ? "—"
    : score <= 1
      ? "Weak"
      : score === 2
        ? "Fair"
        : score === 3
          ? "Good"
          : "Strong";

  return (
    <View style={styles.meterRow}>
      <View style={styles.meterBars}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.meterBar,
              { backgroundColor: i < score ? tone : t.pwEmpty },
            ]}
          />
        ))}
      </View>
      <Text style={[styles.meterLabel, { color: tone }]}>{caption}</Text>
    </View>
  );
}

/* ── Primary CTA ──────────────────────────────────────────────────────────
   Disabled uses the muted fill from the mock rather than an opacity fade.  */

export function AuthCta({
  label,
  onPress,
  disabled,
  busy,
  /** Overrides the fill — used for the "Verified" success state. */
  bg,
  style,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  bg?: string;
  style?: ViewStyle;
}) {
  const t = useAuthPalette();
  const off = !!disabled;
  const [pressed, setPressed] = usePressed();

  return (
    <Pressable
      onPress={onPress}
      disabled={off || busy}
      accessibilityRole="button"
      accessibilityState={{ disabled: off || busy }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.cta,
        {
          backgroundColor: off
            ? t.ctaOffBg
            : bg
              ? bg
              : busy || pressed
                ? t.ctaBgPressed
                : t.ctaBg,
        },
        style,
      ]}
    >
      <Text style={[styles.ctaLabel, { color: off ? t.ctaOffFg : "#FFFFFF" }]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Ghost variant — same geometry, outlined instead of filled. */
export function AuthSecondaryCta({
  label,
  onPress,
  disabled,
  busy,
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  icon?: React.ReactNode;
}) {
  const t = useAuthPalette();
  const [pressed, setPressed] = usePressed();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={[
        styles.social,
        {
          backgroundColor: t.googleBg,
          borderColor: t.googleBorder,
          opacity: disabled ? 0.55 : pressed ? 0.85 : 1,
        },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={t.googleFg} />
      ) : (
        <>
          {icon}
          <Text style={[styles.socialLabel, { color: t.googleFg }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/* ── "or" divider ─────────────────────────────────────────────────────────── */

export function AuthDivider() {
  const t = useAuthPalette();
  return (
    <View style={styles.divider}>
      <View style={[styles.dividerLine, { backgroundColor: t.dividerLine }]} />
      <Text style={[styles.dividerLabel, { color: t.dividerLabel }]}>or</Text>
      <View style={[styles.dividerLine, { backgroundColor: t.dividerLine }]} />
    </View>
  );
}

/* ── Google ──────────────────────────────────────────────────────────────── */

function GoogleGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 48 48">
      <Path
        fill="#4285F4"
        d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84a10.13 10.13 0 0 1-4.4 6.65v5.52h7.1c4.16-3.83 6.58-9.47 6.58-16.18z"
      />
      <Path
        fill="#34A853"
        d="M24 46c5.94 0 10.92-1.97 14.56-5.32l-7.1-5.52c-1.97 1.32-4.49 2.1-7.46 2.1-5.74 0-10.6-3.87-12.33-9.08H4.34v5.73C7.96 41.07 15.4 46 24 46z"
      />
      <Path
        fill="#FBBC05"
        d="M11.67 28.18A13.5 13.5 0 0 1 10.96 24c0-1.45.25-2.86.71-4.18v-5.73H4.34A21.94 21.94 0 0 0 2 24c0 3.55.85 6.91 2.34 9.91l7.33-5.73z"
      />
      <Path
        fill="#EA4335"
        d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.3-6.3C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.09l7.33 5.73C13.4 14.62 18.26 10.75 24 10.75z"
      />
    </Svg>
  );
}

export function GoogleButton({
  onPress,
  disabled,
  busy,
  label = "Continue with Google",
}: {
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  label?: string;
}) {
  return (
    <AuthSecondaryCta
      label={label}
      onPress={onPress}
      disabled={disabled}
      busy={busy}
      icon={<GoogleGlyph />}
    />
  );
}

/* ── Apple ─────────────────────────────────────────────────────────────────
   Native "Sign in with Apple" button — Apple's HIG requires their own
   component/styling, so we render AppleAuthenticationButton directly. iOS-only
   (returns null elsewhere); white on dark, black on light.                   */

export function AppleButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  const scheme = useColorScheme();

  if (Platform.OS !== "ios") return null;

  return (
    <View
      style={[styles.appleWrap, { opacity: disabled ? 0.55 : 1 }]}
      pointerEvents={disabled ? "none" : "auto"}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={
          scheme === "dark"
            ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE
            : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
        }
        cornerRadius={authRadius.cta}
        style={styles.appleBtn}
        onPress={onPress}
      />
    </View>
  );
}

/* ── 6-digit code ─────────────────────────────────────────────────────────
   Cells are painted; a transparent input sits on top and owns the caret.   */

export function CodeInput({
  value,
  onChange,
  editable = true,
  length = 6,
}: {
  value: string;
  onChange: (next: string) => void;
  editable?: boolean;
  length?: number;
}) {
  const t = useAuthPalette();
  const ref = useRef<TextInput>(null);

  return (
    <Pressable
      onPress={() => ref.current?.focus()}
      style={styles.codeWrap}
      accessibilityRole="button"
      accessibilityLabel="Enter verification code"
    >
      <View style={styles.codeRow}>
        {Array.from({ length }, (_, i) => (
          <View
            key={i}
            style={[
              styles.cell,
              {
                backgroundColor: value[i] ? t.cellOn : "transparent",
                borderColor: i === value.length ? t.accent : t.line,
              },
            ]}
          >
            <Text style={[styles.cellText, { color: t.text }]}>
              {value[i] ?? ""}
            </Text>
          </View>
        ))}
      </View>

      <TextInput
        ref={ref}
        value={value}
        editable={editable}
        onChangeText={(v) => onChange(v.replace(/\D/g, "").slice(0, length))}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={length}
        caretHidden
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        style={styles.codeInput}
        accessibilityLabel="Verification code"
      />
    </Pressable>
  );
}

/* ── Small parts ─────────────────────────────────────────────────────────── */

export function AuthLink({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useAuthPalette();
  return (
    <Pressable onPress={onPress} disabled={disabled} hitSlop={10}>
      <Text style={[styles.link, { color: t.accent }]}>{label}</Text>
    </Pressable>
  );
}

export function AuthFooter({
  prompt,
  action,
  onPress,
  disabled,
}: {
  prompt: string;
  action: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const t = useAuthPalette();
  return (
    <>
      <Text style={[styles.footText, { color: t.footText }]}>{prompt}</Text>
      <Pressable onPress={onPress} disabled={disabled} hitSlop={10}>
        <Text style={[styles.footLink, { color: t.footLink }]}>{action}</Text>
      </Pressable>
    </>
  );
}

/** Centred security note under the code CTA. */
export function AuthHint({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const t = useAuthPalette();
  return (
    <View style={styles.hintRow}>
      {icon}
      <Text style={[styles.hintText, { color: t.hint }]}>{children}</Text>
    </View>
  );
}

export function useAuthTokens(): AuthPalette {
  return useAuthPalette();
}

const styles = StyleSheet.create({
  flex: { flex: 1 },

  backRow: { paddingHorizontal: 34, paddingTop: 6 },
  backHit: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -5,
  },

  body: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 34,
    paddingVertical: 20,
  },

  foot: {
    paddingHorizontal: 34,
    paddingTop: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 5,
  },
  footText: { fontSize: 13, fontWeight: "400" },
  footLink: { fontSize: 13, fontWeight: "600" },

  h1: { fontSize: 32, lineHeight: 36, fontWeight: "700", letterSpacing: 0.64 },
  sub: { fontSize: 13.5, lineHeight: 21, fontWeight: "400" },

  bubble: {
    width: 46,
    height: 46,
    borderRadius: authRadius.mark,
    alignItems: "center",
    justifyContent: "center",
    alignSelf: "flex-start",
    marginBottom: 26,
  },

  label: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    marginBottom: 7,
  },
  field: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderBottomWidth: 1.5,
  },
  input: {
    flex: 1,
    padding: 0,
    fontSize: 15.5,
    fontWeight: "400",
    letterSpacing: 0.15,
  },

  meterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 12,
  },
  meterBars: { flex: 1, flexDirection: "row", gap: 4 },
  meterBar: { flex: 1, height: 3, borderRadius: 99 },
  meterLabel: {
    fontSize: 9.5,
    fontWeight: "600",
    letterSpacing: 0.95,
    textTransform: "uppercase",
  },

  cta: {
    paddingVertical: 16,
    borderRadius: authRadius.cta,
    alignItems: "center",
    justifyContent: "center",
  },
  ctaLabel: { fontSize: 17, fontWeight: "600", letterSpacing: 0.17 },

  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginVertical: 24,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerLabel: {
    fontSize: 10,
    fontWeight: "500",
    letterSpacing: 1.6,
    textTransform: "uppercase",
  },

  social: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 15,
    borderRadius: authRadius.cta,
    borderWidth: 1,
  },
  socialLabel: { fontSize: 14.5, fontWeight: "500" },

  appleWrap: { marginTop: 12 },
  appleBtn: { height: 50, width: "100%" },

  codeWrap: { marginBottom: 20 },
  codeRow: { flexDirection: "row", gap: 8 },
  cell: {
    flex: 1,
    height: 60,
    borderRadius: authRadius.cell,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  cellText: { fontSize: 22, fontWeight: "600" },
  codeInput: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0,
    padding: 0,
    color: "transparent",
  },

  link: { fontSize: 13, fontWeight: "500" },

  hintRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
  },
  hintText: { fontSize: 11.5, fontWeight: "400" },
});
