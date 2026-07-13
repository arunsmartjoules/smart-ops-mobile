import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  ActivityIndicator,
  Platform,
  KeyboardAvoidingView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import {
  ArrowLeft,
  ChevronDown,
  Check,
  Ticket,
  Wrench,
  ClipboardList,
  PenLine,
  ShieldCheck,
  Eye,
  Lock,
} from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useSiteResolver } from "@/hooks/useSiteResolver";
import { useTheme } from "@/contexts/ThemeContext";
import { AttendanceService } from "@/services/AttendanceService";
import {
  ShiftSummaryService,
  type ShiftSummary,
} from "@/services/ShiftSummaryService";
import { ShiftSignoffService } from "@/services/ShiftSignoffService";
import SignaturePad from "@/components/SignaturePad";
import Skeleton from "@/components/Skeleton";
import appLogger from "@/utils/logger";

type SectionKey = "tickets" | "pm" | "siteLogs";

const LOG_DOT: Record<string, string> = {
  "Temp RH": "#e05555",
  "Chiller Logs": "#4caf82",
  Water: "#5b9cf6",
  "Chemical Dosing": "#a78bfa",
};

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: "done" | "progress" | "open";
}) {
  const cls =
    tone === "done"
      ? "bg-green-100 dark:bg-green-900/30"
      : tone === "progress"
        ? "bg-amber-100 dark:bg-amber-900/30"
        : "bg-slate-100 dark:bg-slate-800";
  const txt =
    tone === "done"
      ? "text-green-700 dark:text-green-400"
      : tone === "progress"
        ? "text-amber-700 dark:text-amber-400"
        : "text-slate-600 dark:text-slate-300";
  return (
    <View className={`px-2 py-0.5 rounded-md ${cls}`}>
      <Text className={`text-[10px] font-bold ${txt}`}>{label}</Text>
    </View>
  );
}

function ticketTone(status: string): "done" | "progress" | "open" {
  if (status === "Resolved") return "done";
  if (status === "Inprogress") return "progress";
  return "open";
}
function pmTone(status: string): "done" | "progress" | "open" {
  const s = status.toLowerCase();
  if (s === "completed") return "done";
  if (s.includes("progress")) return "progress";
  return "open";
}

export default function ShiftSignoffScreen() {
  const params = useLocalSearchParams<{
    attendanceId?: string;
    siteCode?: string;
  }>();
  const attendanceId = String(params.attendanceId || "");
  const paramSiteCode = String(params.siteCode || "");

  const { user } = useAuth();
  const userId = user?.user_id || user?.id || "";
  const { markPunchedOut, refresh: refreshGate } = useAttendanceGate();
  const { isDark } = useTheme();

  // Section icon accents (brighter in dark mode for contrast on the dark chip bg).
  const ticketIcon = isDark ? "#60a5fa" : "#2563eb";
  const pmIcon = isDark ? "#4ade80" : "#16a34a";
  const logIcon = isDark ? "#c4b5fd" : "#8b5cf6";

  // The active site drives PM + site-log scoping. Prefer the site resolver's
  // selected site (what the tickets/PM/site-log tabs use) — the attendance
  // record's site_code is frequently null (WFH/off-site punch-in). Fall back to
  // the passed param while the resolver is still loading.
  const { selectedSite } = useSiteResolver(userId);
  const siteCode = selectedSite?.site_code || paramSiteCode;

  const [summary, setSummary] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState<Record<SectionKey, boolean>>({
    tickets: true,
    pm: false,
    siteLogs: false,
  });
  const [acks, setAcks] = useState<Record<SectionKey, boolean>>({
    tickets: false,
    pm: false,
    siteLogs: false,
  });
  const [notes, setNotes] = useState("");
  const [declaration, setDeclaration] = useState(false);
  const [signatureUri, setSignatureUri] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const signoffSubmittedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        // Tickets resolve by assignee (no site needed); PM + site-logs use
        // siteCode, which may still be empty until the resolver settles — the
        // effect re-runs when siteCode changes and re-fills those sections.
        const s = await ShiftSummaryService.buildTodaySummary({
          user,
          siteCode,
        });
        if (alive) setSummary(s);
      } catch (e: any) {
        appLogger.warn("ShiftSignoff: summary build failed", {
          module: "SHIFT_SIGNOFF_SCREEN",
          error: e?.message,
        });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [user, siteCode]);

  const toggle = useCallback((k: SectionKey) => {
    setOpen((prev) => ({ ...prev, [k]: !prev[k] }));
  }, []);
  const markReviewed = useCallback((k: SectionKey) => {
    setAcks((prev) => ({ ...prev, [k]: true }));
    Haptics.selectionAsync().catch(() => {});
  }, []);

  const allReviewed = acks.tickets && acks.pm && acks.siteLogs;
  const canSubmit = allReviewed && declaration && !!signatureUri && !submitting;

  const onSubmit = useCallback(async () => {
    if (!canSubmit || !summary || !attendanceId) return;
    setSubmitting(true);
    try {
      // Best-effort GPS fix (don't block End Day on it).
      let lat: number | undefined;
      let lng: number | undefined;
      try {
        const accuracy =
          Platform.OS === "android"
            ? Location.Accuracy.High
            : Location.Accuracy.BestForNavigation;
        const loc = await Location.getCurrentPositionAsync({ accuracy });
        lat = loc.coords.latitude;
        lng = loc.coords.longitude;
      } catch {
        /* proceed without coords — checkout accepts them as optional */
      }

      // 1. Persist the sign-off (once; skip on a checkout retry).
      if (!signoffSubmittedRef.current) {
        const r = await ShiftSignoffService.submit({
          attendanceId,
          userId,
          siteCode,
          date: summary.date,
          summary,
          notes: notes.trim(),
          signatureUri: signatureUri!,
          sectionsAck: acks,
        });
        if (!r.success) {
          throw new Error(r.error || "Failed to save sign-off");
        }
        signoffSubmittedRef.current = true;
      }

      // 2. Check out (notes double as the early-checkout reason for <7h shifts).
      const remarks = notes.trim() || "Shift sign-off completed";
      const res = await AttendanceService.checkOut(
        attendanceId,
        lat,
        lng,
        undefined,
        remarks,
      );

      if (res.success) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Success,
        ).catch(() => {});
        markPunchedOut();
        refreshGate();
        if (res.queued) {
          Alert.alert(
            "Signed off",
            "Your shift sign-off is saved and will sync when you're back online.",
          );
        }
        router.replace("/(tabs)/dashboard");
      } else if (res.isEarlyCheckout) {
        Alert.alert(
          "Add a note",
          "You worked less than 7 hours. Please add a short note describing your shift before ending the day.",
        );
      } else {
        Alert.alert("Couldn't end day", res.error || "Please try again.");
      }
    } catch (e: any) {
      Alert.alert("Error", e?.message || "Something went wrong. Please retry.");
    } finally {
      setSubmitting(false);
    }
  }, [
    canSubmit,
    summary,
    attendanceId,
    userId,
    siteCode,
    notes,
    signatureUri,
    acks,
    markPunchedOut,
    refreshGate,
  ]);

  const pills = useMemo(() => {
    if (!summary) return null;
    return (
      <View className="flex-row flex-wrap gap-2 mt-3">
        <View className="bg-green-100 dark:bg-green-900/30 px-2.5 py-1 rounded-full">
          <Text className="text-green-700 dark:text-green-300 text-[11px] font-semibold">
            {summary.tickets.completed} tickets done
          </Text>
        </View>
        {summary.tickets.inProgress > 0 && (
          <View className="bg-amber-100 dark:bg-amber-900/30 px-2.5 py-1 rounded-full">
            <Text className="text-amber-700 dark:text-amber-300 text-[11px] font-semibold">
              {summary.tickets.inProgress} in progress
            </Text>
          </View>
        )}
        <View className="bg-blue-100 dark:bg-blue-900/30 px-2.5 py-1 rounded-full">
          <Text className="text-blue-700 dark:text-blue-300 text-[11px] font-semibold">
            {summary.pm.done} PM done
          </Text>
        </View>
      </View>
    );
  }, [summary]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-800 items-center justify-center mr-3"
            style={{ shadowOpacity: 0.1, shadowRadius: 5, elevation: 2 }}
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View className="flex-1">
            <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
              Shift sign-off
            </Text>
            <Text className="text-slate-400 dark:text-slate-500 text-xs">
              Review your day before ending the shift
            </Text>
          </View>
        </View>

        <KeyboardAvoidingView
          className="flex-1"
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            className="flex-1 px-5"
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Shift banner */}
            <View className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-4 border border-slate-100 dark:border-slate-800">
              <Text className="text-blue-600 dark:text-blue-400 text-[11px] font-semibold uppercase tracking-wide">
                {siteCode || "Site"}
              </Text>
              <Text className="text-slate-900 dark:text-slate-50 text-base font-bold mt-0.5">
                {user?.name || user?.full_name || "Operator"}
              </Text>
              <Text className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                {summary?.date || ""}
              </Text>
              {pills}
            </View>

            <Text className="text-slate-500 dark:text-slate-400 text-xs mb-3 leading-5">
              Review each section below and confirm it. You must review all
              sections, accept the declaration, and sign before you can end your
              day.
            </Text>

            {loading ? (
              <View className="gap-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} height={56} borderRadius={12} />
                ))}
              </View>
            ) : (
              <>
                {/* TICKETS */}
                <Section
                  icon={<Ticket size={16} color={ticketIcon} />}
                  iconBg="bg-blue-100 dark:bg-blue-900/30"
                  title="Tickets"
                  counts={
                    <>
                      <CountChip
                        text={`${summary?.tickets.completed ?? 0} done`}
                        tone="done"
                      />
                      <CountChip
                        text={`${summary?.tickets.inProgress ?? 0} in progress`}
                        tone="progress"
                      />
                    </>
                  }
                  isOpen={open.tickets}
                  onToggle={() => toggle("tickets")}
                  reviewed={acks.tickets}
                  onReview={() => markReviewed("tickets")}
                  reviewLabel="Tickets reviewed"
                >
                  {(summary?.tickets.items ?? []).length === 0 ? (
                    <EmptyRow text="No tickets assigned to you today." />
                  ) : (
                    (summary?.tickets.items ?? []).slice(0, 12).map((t) => (
                      <View
                        key={t.id}
                        className="flex-row items-start py-2 border-b border-slate-100 dark:border-slate-800"
                      >
                        <Text className="text-slate-400 dark:text-slate-500 text-[11px] w-14">
                          #{t.ticket_number}
                        </Text>
                        <View className="flex-1 pr-2">
                          <Text
                            className="text-slate-700 dark:text-slate-200 text-xs"
                            numberOfLines={2}
                          >
                            {t.title}
                          </Text>
                        </View>
                        <StatusBadge label={t.status} tone={ticketTone(t.status)} />
                      </View>
                    ))
                  )}
                </Section>

                {/* PM */}
                <Section
                  icon={<Wrench size={16} color={pmIcon} />}
                  iconBg="bg-green-100 dark:bg-green-900/30"
                  title="Preventive maintenance"
                  counts={
                    <>
                      <CountChip
                        text={`${summary?.pm.done ?? 0} done`}
                        tone="done"
                      />
                      <CountChip
                        text={`${summary?.pm.inProgress ?? 0} in progress`}
                        tone="progress"
                      />
                    </>
                  }
                  isOpen={open.pm}
                  onToggle={() => toggle("pm")}
                  reviewed={acks.pm}
                  onReview={() => markReviewed("pm")}
                  reviewLabel="PM reviewed"
                >
                  {(summary?.pm.items ?? []).length === 0 ? (
                    <EmptyRow text="No PM tasks assigned to you today." />
                  ) : (
                    (summary?.pm.items ?? []).slice(0, 12).map((p, idx) => (
                      <View
                        key={`${p.title}-${idx}`}
                        className="flex-row items-start py-2 border-b border-slate-100 dark:border-slate-800"
                      >
                        <View className="flex-1 pr-2">
                          <Text
                            className="text-slate-700 dark:text-slate-200 text-xs"
                            numberOfLines={2}
                          >
                            {p.title}
                          </Text>
                          <Text className="text-slate-400 dark:text-slate-500 text-[11px] mt-0.5">
                            {p.asset}
                            {p.progress ? ` · ${p.progress}` : ""}
                          </Text>
                        </View>
                        <StatusBadge label={p.status} tone={pmTone(p.status)} />
                      </View>
                    ))
                  )}
                </Section>

                {/* SITE LOGS */}
                <Section
                  icon={<ClipboardList size={16} color={logIcon} />}
                  iconBg="bg-purple-100 dark:bg-purple-900/30"
                  title="Site logs"
                  counts={
                    <CountChip
                      text={`${(summary?.siteLogs ?? []).reduce((n, c) => n + c.completed, 0)}/${(summary?.siteLogs ?? []).reduce((n, c) => n + c.total, 0)} logs done`}
                      tone="neutral"
                    />
                  }
                  isOpen={open.siteLogs}
                  onToggle={() => toggle("siteLogs")}
                  reviewed={acks.siteLogs}
                  onReview={() => markReviewed("siteLogs")}
                  reviewLabel="Logs reviewed"
                >
                  {(summary?.siteLogs ?? []).map((c) => (
                    <View
                      key={c.category}
                      className="flex-row items-center py-2 gap-2"
                    >
                      <View
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: LOG_DOT[c.category] || "#94a3b8",
                        }}
                      />
                      <Text className="text-slate-700 dark:text-slate-200 text-xs flex-1">
                        {c.category}
                      </Text>
                      <View className="w-20 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <View
                          style={{
                            width: `${c.percent}%`,
                            height: "100%",
                            backgroundColor: c.percent >= 100 ? "#22c55e" : "#5b9cf6",
                          }}
                        />
                      </View>
                      <Text
                        className="text-[11px] font-semibold w-9 text-right"
                        style={{
                          color:
                            c.percent >= 100
                              ? isDark
                                ? "#4ade80"
                                : "#16a34a"
                              : isDark
                                ? "#60a5fa"
                                : "#2563eb",
                        }}
                      >
                        {c.percent}%
                      </Text>
                      <Text className="text-slate-400 dark:text-slate-500 text-[11px] w-12 text-right">
                        {c.completed}/{c.total}
                      </Text>
                    </View>
                  ))}
                </Section>

                {/* NOTES */}
                <View className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 mb-3">
                  <Text className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wide mb-2">
                    Notes & work done this shift
                  </Text>
                  <TextInput
                    className="text-slate-800 dark:text-slate-100 text-sm"
                    placeholder="Optional — anything the next operator should know…"
                    placeholderTextColor="#94a3b8"
                    multiline
                    value={notes}
                    onChangeText={setNotes}
                    style={{ minHeight: 70, textAlignVertical: "top" }}
                    maxLength={2000}
                  />
                </View>

                {/* SIGNATURE */}
                <View className="mb-3">
                  <Text className="text-slate-500 dark:text-slate-400 text-[11px] font-semibold uppercase tracking-wide mb-2">
                    Signature
                  </Text>
                  <SignaturePad
                    description={
                      signatureUri ? "Signature captured — tap to redo" : "Tap to sign"
                    }
                    okText="Save signature"
                    onOK={(uri) => setSignatureUri(uri)}
                    onClear={() => setSignatureUri(null)}
                    trigger={(openPad) => (
                      <TouchableOpacity
                        onPress={openPad}
                        className={`flex-row items-center justify-between p-4 rounded-2xl border ${
                          signatureUri
                            ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800"
                            : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700"
                        }`}
                      >
                        <View className="flex-row items-center gap-2">
                          <PenLine
                            size={16}
                            color={signatureUri ? "#16a34a" : "#64748b"}
                          />
                          <Text
                            className={`text-sm font-semibold ${
                              signatureUri
                                ? "text-green-700 dark:text-green-400"
                                : "text-slate-600 dark:text-slate-300"
                            }`}
                          >
                            {signatureUri ? "Signature captured" : "Tap to sign"}
                          </Text>
                        </View>
                        {signatureUri && <Check size={18} color="#16a34a" />}
                      </TouchableOpacity>
                    )}
                  />
                </View>

                {/* DECLARATION */}
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setDeclaration((v) => !v)}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 mb-3 flex-row items-start gap-3"
                >
                  <View
                    className={`w-5 h-5 rounded-md items-center justify-center mt-0.5 ${
                      declaration
                        ? "bg-blue-600 border-blue-600"
                        : "border-2 border-slate-300 dark:border-slate-600"
                    }`}
                  >
                    {declaration && <Check size={13} color="#ffffff" />}
                  </View>
                  <Text className="flex-1 text-slate-600 dark:text-slate-300 text-xs leading-5">
                    I confirm that the information above accurately reflects the
                    work completed during my shift, and any pending items have
                    been communicated to the incoming operator.
                  </Text>
                </TouchableOpacity>

                {/* SUBMIT */}
                {!canSubmit && !submitting && (
                  <View className="flex-row items-center justify-center gap-1.5 mb-2">
                    <Lock size={12} color="#94a3b8" />
                    <Text className="text-slate-400 dark:text-slate-500 text-[11px]">
                      {!allReviewed
                        ? "Review all 3 sections to continue"
                        : !signatureUri
                          ? "Add your signature to continue"
                          : !declaration
                            ? "Accept the declaration to continue"
                            : ""}
                    </Text>
                  </View>
                )}
                <TouchableOpacity
                  disabled={!canSubmit}
                  onPress={onSubmit}
                  className={`rounded-2xl py-4 items-center flex-row justify-center gap-2 ${
                    canSubmit ? "bg-blue-600" : "bg-slate-200 dark:bg-slate-800"
                  }`}
                >
                  {submitting ? (
                    <ActivityIndicator color={canSubmit ? "#fff" : "#94a3b8"} />
                  ) : (
                    <>
                      <ShieldCheck
                        size={18}
                        color={canSubmit ? "#ffffff" : "#94a3b8"}
                      />
                      <Text
                        className={`font-bold ${
                          canSubmit
                            ? "text-white"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        Submit & End Day
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

// ── Inline building blocks ──────────────────────────────────────────────────

function Section({
  icon,
  iconBg,
  title,
  counts,
  isOpen,
  onToggle,
  reviewed,
  onReview,
  reviewLabel,
  children,
}: {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  counts: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  reviewed: boolean;
  onReview: () => void;
  reviewLabel: string;
  children: React.ReactNode;
}) {
  return (
    <View className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 mb-3 overflow-hidden">
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.7}
        className="flex-row items-center gap-3 p-3"
      >
        <View className={`w-8 h-8 rounded-lg items-center justify-center ${iconBg}`}>
          {icon}
        </View>
        <View className="flex-1">
          <Text className="text-slate-900 dark:text-slate-50 text-sm font-semibold">
            {title}
          </Text>
          <View className="flex-row flex-wrap gap-1.5 mt-1">{counts}</View>
        </View>
        {reviewed && (
          <View className="w-5 h-5 rounded-full bg-green-100 dark:bg-green-900/40 items-center justify-center mr-1">
            <Check size={12} color="#16a34a" />
          </View>
        )}
        <View style={{ transform: [{ rotate: isOpen ? "180deg" : "0deg" }] }}>
          <ChevronDown size={16} color="#94a3b8" />
        </View>
      </TouchableOpacity>

      {isOpen && (
        <View className="px-3 pb-3 border-t border-slate-100 dark:border-slate-800 pt-2">
          {children}
          <TouchableOpacity
            onPress={onReview}
            disabled={reviewed}
            className={`mt-3 py-2.5 rounded-xl flex-row items-center justify-center gap-1.5 border ${
              reviewed
                ? "bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-800"
                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
            }`}
          >
            {reviewed ? (
              <Check size={14} color="#16a34a" />
            ) : (
              <Eye size={14} color="#64748b" />
            )}
            <Text
              className={`text-xs font-semibold ${
                reviewed
                  ? "text-green-700 dark:text-green-400"
                  : "text-slate-600 dark:text-slate-300"
              }`}
            >
              {reviewed ? `${reviewLabel} ✓` : `Tap to confirm — ${reviewLabel}`}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function CountChip({
  text,
  tone,
}: {
  text: string;
  tone: "done" | "progress" | "neutral";
}) {
  const cls =
    tone === "done"
      ? "bg-green-100 dark:bg-green-900/30"
      : tone === "progress"
        ? "bg-amber-100 dark:bg-amber-900/30"
        : "bg-slate-100 dark:bg-slate-800";
  const txt =
    tone === "done"
      ? "text-green-700 dark:text-green-300"
      : tone === "progress"
        ? "text-amber-700 dark:text-amber-300"
        : "text-slate-600 dark:text-slate-300";
  return (
    <View className={`px-2 py-0.5 rounded-full ${cls}`}>
      <Text className={`text-[10px] font-bold ${txt}`}>{text}</Text>
    </View>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <Text className="text-slate-400 dark:text-slate-500 text-xs py-3 text-center">
      {text}
    </Text>
  );
}
