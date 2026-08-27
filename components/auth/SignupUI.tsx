/**
 * Sign-up form primitives — Claude Design "JouleOps Sign Up.dc.html".
 *
 * A thunder header carrying a completion bar, then labelled white field boxes
 * grouped under uppercase eyebrows, a sticky footer CTA, and a bottom sheet
 * for the picker fields.
 *
 * Field boxes tint their outline as you go: carbon while untouched, sky once
 * valid, flame when the value is wrong — the artboard's `line()` helper.
 */
import React from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  CircleCheck,
  Eye,
  EyeOff,
  X,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { makeThemedStyles, useDs, type DsTheme } from "@/hooks/useDs";
import { soRadius } from "@/components/home/SiteOverview";

/** Mock-only tints with no design-system token. */
const mock = (ds: DsTheme) => ({
  /** Footer rule and the empty segment of the strength meter. */
  rule: ds.isDark ? ds.carbon[900] : "#E2E1E0",
  /** Sheet header hairline. */
  sheetRule: ds.isDark ? ds.carbon[900] : "#F0EFEF",
  /** Mid-strength password — the design system's `--chart-actual`. */
  fair: "#E5A93A",
  /** Progress track on thunder. */
  track: "rgba(255,255,255,0.16)",
  tile: "rgba(255,255,255,0.10)",
  scrim: "rgba(25,19,18,0.45)",
});

/** The artboard's outline states. */
export const fieldLine = (bad: boolean, ok: boolean, ds: DsTheme) =>
  bad ? ds.flame[100] : ok ? ds.sky[100] : ds.carbon[900];

export const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/* ── Header ──────────────────────────────────────────────────────────────── */

export function SignupHeader({
  title,
  subtitle,
  progress,
  onBack,
}: {
  title: string;
  subtitle: string;
  /** 0–1; drives the flame completion bar. */
  progress: number;
  onBack?: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const insets = useSafeAreaInsets();
  const pct = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%` as const;

  return (
    <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
      <View style={styles.headerRow}>
        {onBack ? (
          <TouchableOpacity
            onPress={onBack}
            activeOpacity={0.8}
            hitSlop={8}
            style={styles.headerTile}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ArrowLeft size={20} color={ds.onChrome} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerSub}>{subtitle}</Text>
        </View>
      </View>

      <View style={styles.progressWrap}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: pct }]} />
        </View>
      </View>
    </View>
  );
}

/* ── Field parts ─────────────────────────────────────────────────────────── */

export function SectionEyebrow({
  children,
  first,
}: {
  children: React.ReactNode;
  first?: boolean;
}) {
  const styles = useStyles();
  return (
    <Text style={[styles.sectionEyebrow, !first && { marginTop: 20 }]}>
      {children}
    </Text>
  );
}

function FieldShell({
  label,
  line,
  note,
  noteTone = "muted",
  children,
  boxStyle,
}: {
  label: string;
  line: string;
  note?: string;
  noteTone?: "muted" | "ok" | "error";
  children: React.ReactNode;
  boxStyle?: ViewStyle;
}) {
  const styles = useStyles();
  const ds = useDs();
  const noteColor =
    noteTone === "error"
      ? ds.flame[100]
      : noteTone === "ok"
        ? ds.sky[100]
        : ds.carbon[600];
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={[styles.box, { borderColor: line }, boxStyle]}>
        {children}
      </View>
      {note ? (
        <Text style={[styles.note, { color: noteColor }]}>{note}</Text>
      ) : null}
    </View>
  );
}

interface SignupFieldProps extends Omit<TextInputProps, "style"> {
  label: string;
  line: string;
  note?: string;
  noteTone?: "muted" | "ok" | "error";
  /** Trailing tick / cross, per the artboard's inline validity glyphs. */
  status?: "ok" | "error" | null;
  /** Fixed prefix, e.g. the phone field's "+91". */
  prefix?: string;
}

export function SignupField({
  label,
  line,
  note,
  noteTone,
  status,
  prefix,
  ...input
}: SignupFieldProps) {
  const styles = useStyles();
  const ds = useDs();
  return (
    <FieldShell label={label} line={line} note={note} noteTone={noteTone}>
      {prefix ? <Text style={styles.prefix}>{prefix}</Text> : null}
      <TextInput
        {...input}
        placeholderTextColor={ds.carbon[700]}
        style={styles.input}
      />
      {status === "ok" ? (
        <CircleCheck size={17} color={ds.sky[100]} strokeWidth={2.1} />
      ) : status === "error" ? (
        <CircleAlert size={17} color={ds.flame[100]} strokeWidth={2.1} />
      ) : null}
    </FieldShell>
  );
}

export function SignupPasswordField({
  label,
  line,
  note,
  noteTone,
  status,
  visible,
  onToggleVisible,
  ...input
}: SignupFieldProps & { visible: boolean; onToggleVisible: () => void }) {
  const styles = useStyles();
  const ds = useDs();
  const Icon: LucideIcon = visible ? EyeOff : Eye;
  return (
    <FieldShell label={label} line={line} note={note} noteTone={noteTone}>
      <TextInput
        {...input}
        secureTextEntry={!visible}
        placeholderTextColor={ds.carbon[700]}
        style={styles.input}
      />
      {status === "ok" ? (
        <CircleCheck size={17} color={ds.sky[100]} strokeWidth={2.1} />
      ) : status === "error" ? (
        <CircleAlert size={17} color={ds.flame[100]} strokeWidth={2.1} />
      ) : null}
      <TouchableOpacity
        onPress={onToggleVisible}
        hitSlop={10}
        accessibilityRole="button"
        accessibilityLabel={visible ? "Hide password" : "Show password"}
      >
        <Icon size={19} color={ds.carbon[500]} strokeWidth={2} />
      </TouchableOpacity>
    </FieldShell>
  );
}

/** A field that opens a sheet (or a date picker) instead of taking typing. */
export function SignupPickerField({
  label,
  line,
  value,
  placeholder,
  sub,
  initials,
  leading: Leading,
  onPress,
}: {
  label: string;
  line: string;
  value?: string;
  placeholder: string;
  sub?: string;
  /** Monogram bubble, used by the reporting-manager field. */
  initials?: string;
  leading?: LucideIcon;
  onPress: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  return (
    <FieldShell
      label={label}
      line={line}
      boxStyle={initials ? { paddingVertical: 10 } : undefined}
    >
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.75}
        style={styles.pickerHit}
        accessibilityRole="button"
        accessibilityLabel={`${label}. ${value || placeholder}`}
      >
        {initials ? (
          <View style={styles.pickerMono}>
            <Text style={styles.pickerMonoText}>{initials}</Text>
          </View>
        ) : Leading ? (
          <Leading size={17} color={ds.carbon[600]} strokeWidth={2} />
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={[
              styles.pickerValue,
              { color: value ? ds.carbon[100] : ds.carbon[700] },
            ]}
            numberOfLines={1}
          >
            {value || placeholder}
          </Text>
          {sub ? (
            <Text style={styles.pickerSub} numberOfLines={1}>
              {sub}
            </Text>
          ) : null}
        </View>
        <ChevronDown size={19} color={ds.carbon[600]} strokeWidth={2} />
      </TouchableOpacity>
    </FieldShell>
  );
}

/* ── Password strength ───────────────────────────────────────────────────── */

export function strengthOf(pw: string) {
  return [
    pw.length >= 8,
    /[A-Z]/.test(pw),
    /[0-9]/.test(pw),
    /[^A-Za-z0-9]/.test(pw),
  ].filter(Boolean).length;
}

export function SignupStrength({ password }: { password: string }) {
  const styles = useStyles();
  const ds = useDs();
  const score = strengthOf(password);
  const empty = password.length === 0;
  const color =
    score <= 1 ? ds.flame[100] : score === 2 ? mock(ds).fair : ds.sky[100];
  const label = empty
    ? "Strength"
    : score <= 1
      ? "Weak"
      : score === 2
        ? "Fair"
        : score === 3
          ? "Good"
          : "Strong";

  return (
    <View style={styles.strengthRow}>
      <View style={styles.strengthBars}>
        {[0, 1, 2, 3].map((i) => (
          <View
            key={i}
            style={[
              styles.strengthBar,
              { backgroundColor: i < score ? color : mock(ds).rule },
            ]}
          />
        ))}
      </View>
      <Text
        style={[
          styles.strengthLabel,
          { color: empty ? ds.carbon[700] : color },
        ]}
      >
        {label}
      </Text>
    </View>
  );
}

/* ── Sticky footer ───────────────────────────────────────────────────────── */

export function SignupFooter({
  blocked,
  ctaLabel,
  ctaIcon: CtaIcon,
  ready,
  busy,
  onSubmit,
  prompt,
  action,
  onAction,
}: {
  blocked?: string | null;
  ctaLabel: string;
  ctaIcon: LucideIcon;
  ready: boolean;
  busy?: boolean;
  onSubmit: () => void;
  prompt?: string;
  action?: string;
  onAction?: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.footer,
        { paddingBottom: Math.max(insets.bottom + 4, 20) },
      ]}
    >
      {blocked ? (
        <View style={styles.blockedRow}>
          <CircleAlert size={14} color={ds.flame[100]} strokeWidth={2.2} />
          <Text style={styles.blockedText}>{blocked}</Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={onSubmit}
        disabled={busy}
        activeOpacity={0.85}
        style={[
          styles.cta,
          { backgroundColor: ready ? ds.flame[100] : ds.carbon[900] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={ctaLabel}
      >
        {busy ? (
          <ActivityIndicator size="small" color={ds.onChrome} />
        ) : (
          <>
            <CtaIcon
              size={18}
              color={ready ? ds.onAccent : ds.carbon[600]}
              strokeWidth={2.1}
            />
            <Text
              style={[
                styles.ctaLabel,
                { color: ready ? ds.onAccent : ds.carbon[600] },
              ]}
            >
              {ctaLabel}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {prompt && action ? (
        <View style={styles.footerLink}>
          <Text style={styles.footerPrompt}>{prompt}</Text>
          <Pressable onPress={onAction} hitSlop={8} disabled={busy}>
            <Text style={styles.footerAction}>{action}</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

/* ── Picker sheet ────────────────────────────────────────────────────────── */

export interface SheetOption {
  label: string;
  sub?: string;
  initials?: string;
}

export function SignupSheet({
  visible,
  title,
  options,
  selected,
  loading,
  emptyLabel = "Nothing to choose from",
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: SheetOption[];
  selected?: string;
  loading?: boolean;
  emptyLabel?: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Pressable style={styles.sheetScrim} onPress={onClose} />
      <View style={styles.sheetWrap} pointerEvents="box-none">
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={10}
              style={styles.sheetClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
            >
              <X size={18} color={ds.carbon[400]} strokeWidth={2.2} />
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.sheetEmpty}>
              <ActivityIndicator size="small" color={ds.thunder[100]} />
            </View>
          ) : options.length === 0 ? (
            <View style={styles.sheetEmpty}>
              <Text style={styles.sheetEmptyText}>{emptyLabel}</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.sheetList}
              showsVerticalScrollIndicator={false}
            >
              {options.map((o) => {
                const on = o.label === selected;
                return (
                  <TouchableOpacity
                    key={o.label}
                    onPress={() => onSelect(o.label)}
                    activeOpacity={0.75}
                    style={[
                      styles.sheetOption,
                      on && { backgroundColor: ds.pageBg },
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    {o.initials ? (
                      <View style={styles.sheetMono}>
                        <Text style={styles.sheetMonoText}>{o.initials}</Text>
                      </View>
                    ) : null}
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.sheetLabel} numberOfLines={1}>
                        {o.label}
                      </Text>
                      {o.sub ? (
                        <Text style={styles.sheetSub} numberOfLines={1}>
                          {o.sub}
                        </Text>
                      ) : null}
                    </View>
                    {on ? (
                      <Check size={19} color={ds.flame[100]} strokeWidth={2.4} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  header: {
    backgroundColor: ds.thunder[100],
    paddingBottom: 20,
    borderBottomLeftRadius: 26,
    borderBottomRightRadius: 26,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
  },
  headerTile: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    backgroundColor: mock(ds).tile,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -4,
  },
  headerTitle: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "700",
    letterSpacing: 0.38,
    color: ds.onChrome,
  },
  headerSub: { fontSize: 11.5, color: ds.sky[500], marginTop: 3 },
  progressWrap: { paddingHorizontal: 20, paddingTop: 16 },
  progressTrack: {
    height: 3,
    borderRadius: soRadius.pill,
    backgroundColor: mock(ds).track,
    overflow: "hidden",
  },
  progressFill: {
    height: 3,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[100],
  },

  sectionEyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[700],
    marginHorizontal: 2,
    marginBottom: 9,
  },

  field: { marginBottom: 14 },
  fieldLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 6,
  },
  box: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 46,
    backgroundColor: ds.white,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 13,
  },
  input: { flex: 1, padding: 0, fontSize: 14, color: ds.carbon[100] },
  prefix: {
    fontSize: 14,
    fontWeight: "500",
    color: ds.carbon[400],
    paddingRight: 9,
    borderRightWidth: 1,
    borderRightColor: ds.carbon[1000],
  },
  note: { fontSize: 10.5, marginTop: 6 },

  pickerHit: { flex: 1, flexDirection: "row", alignItems: "center", gap: 9 },
  pickerMono: {
    width: 26,
    height: 26,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  pickerMonoText: { fontSize: 10, fontWeight: "600", color: ds.carbon[400] },
  pickerValue: { fontSize: 14 },
  pickerSub: { fontSize: 10.5, color: ds.carbon[600], marginTop: 2 },

  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 9,
  },
  strengthBars: { flex: 1, flexDirection: "row", gap: 4 },
  strengthBar: { flex: 1, height: 3, borderRadius: soRadius.pill },
  strengthLabel: {
    fontSize: 9.5,
    fontWeight: "600",
    letterSpacing: 0.95,
    textTransform: "uppercase",
  },

  footer: {
    backgroundColor: ds.white,
    borderTopWidth: 1,
    borderTopColor: mock(ds).rule,
    paddingTop: 12,
    paddingHorizontal: 18,
  },
  blockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 9,
  },
  blockedText: {
    flexShrink: 1,
    fontSize: 11,
    fontWeight: "500",
    color: ds.flame[100],
  },
  cta: {
    borderRadius: 14,
    padding: 15,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  ctaLabel: { fontSize: 15, fontWeight: "700" },
  footerLink: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 5,
    marginTop: 11,
  },
  footerPrompt: { fontSize: 12, color: ds.carbon[500] },
  footerAction: { fontSize: 12, fontWeight: "600", color: ds.flame[100] },

  sheetScrim: { flex: 1, backgroundColor: mock(ds).scrim },
  sheetWrap: { position: "absolute", left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: ds.white,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    maxHeight: 520,
  },
  sheetHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: mock(ds).sheetRule,
  },
  sheetTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: ds.carbon[100] },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: soRadius.pill,
    backgroundColor: mock(ds).sheetRule,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetList: { paddingHorizontal: 12, paddingTop: 6, paddingBottom: 12 },
  sheetOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 13,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  sheetMono: {
    width: 32,
    height: 32,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  sheetMonoText: { fontSize: 11, fontWeight: "600", color: ds.carbon[400] },
  sheetLabel: { fontSize: 13.5, fontWeight: "500", color: ds.carbon[100] },
  sheetSub: { fontSize: 10.5, color: ds.carbon[600], marginTop: 2 },
  sheetEmpty: { paddingVertical: 34, alignItems: "center" },
  sheetEmptyText: { fontSize: 12.5, color: ds.carbon[500] },
}));
