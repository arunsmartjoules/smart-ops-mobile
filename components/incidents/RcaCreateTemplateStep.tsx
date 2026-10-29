/**
 * "Create RCA" step 2: pick a past RCA to model the new one on, or start with
 * the standard sections. Loading, empty and error states are all real: today a
 * site may have no RCA files yet.
 */
import React, { useMemo, useState } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { RcaTemplate } from "@/services/RcaCreateService";
import { InlineError, Notice } from "./RcaImportParts";
import { TEMPLATE_SEARCH_THRESHOLD, filterTemplates } from "./rcaCreateLib";
import { formatDay } from "./rcaImportLib";

export type TemplateList =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; items: RcaTemplate[] };

const tap = () => Haptics.selectionAsync().catch(() => {});

function dateOf(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : formatDay(d);
}

export default function RcaCreateTemplateStep({
  list,
  offline,
  hasAnswers,
  onPick,
  onStandard,
  onRetry,
}: {
  list: TemplateList;
  offline: boolean;
  /** Earlier answers exist — picking a different RCA starts them over. */
  hasAnswers: boolean;
  onPick: (template: RcaTemplate) => void;
  onStandard: () => void;
  onRetry: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [query, setQuery] = useState("");

  const items = useMemo(() => (list.status === "ready" ? list.items : []), [list]);
  const shown = useMemo(() => filterTemplates(items, query), [items, query]);
  const searchable = items.length > TEMPLATE_SEARCH_THRESHOLD;

  const standardButton = (primary: boolean) => (
    <TouchableOpacity
      onPress={() => {
        tap();
        onStandard();
      }}
      disabled={offline}
      activeOpacity={0.85}
      style={[s.standardBtn, primary && s.standardBtnPrimary, offline && { opacity: 0.5 }]}
      accessibilityRole="button"
      accessibilityLabel="Start without a template"
    >
      <Bx name="bx-file-blank" size={18} color={primary ? t.onAccent : t.ink2} />
      <Text style={[s.standardText, primary && { color: t.onAccent }]}>Start without a template</Text>
    </TouchableOpacity>
  );

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.title} accessibilityRole="header">
        Pick a past RCA to follow
      </Text>
      <Text style={s.help}>
        We&apos;ll use its sections as your questions. Or start with the standard ones.
      </Text>

      {hasAnswers ? (
        <Notice icon="bx-error-circle" tone="warn" style={{ marginTop: 12 }}>
          Choosing a different RCA starts your answers over.
        </Notice>
      ) : null}
      {offline ? (
        <Notice icon="bx-wifi-off" tone="warn" style={{ marginTop: 12 }}>
          You&apos;re offline. Creating an RCA needs an internet connection.
        </Notice>
      ) : null}

      {list.status === "loading" ? (
        <View style={s.center} accessibilityLiveRegion="polite">
          <ActivityIndicator color={t.accentInk} />
          <Text style={s.centerText}>Finding past RCAs…</Text>
        </View>
      ) : null}

      {list.status === "error" ? (
        <View style={s.center}>
          <View style={[s.bigIcon, { backgroundColor: t.warnTint }]}>
            <Bx name="bx-error-circle" size={30} color={t.warn} />
          </View>
          <Text style={s.centerTitle}>Couldn&apos;t load past RCAs</Text>
          <InlineError text={list.message} style={{ marginTop: 8 }} />
          <TouchableOpacity
            onPress={onRetry}
            activeOpacity={0.85}
            style={[s.standardBtn, { marginTop: 16 }]}
            accessibilityRole="button"
            accessibilityLabel="Try again"
          >
            <Bx name="bx-refresh" size={18} color={t.ink2} />
            <Text style={s.standardText}>Try again</Text>
          </TouchableOpacity>
          <View style={{ height: 10 }} />
          {standardButton(false)}
        </View>
      ) : null}

      {list.status === "ready" && items.length === 0 ? (
        <View style={s.center}>
          <View style={[s.bigIcon, { backgroundColor: t.accentTint }]}>
            <Bx name="bx-file-blank" size={30} color={t.accentInk} />
          </View>
          <Text style={s.centerTitle}>No RCA files yet</Text>
          <Text style={s.centerText}>
            Once an incident has an RCA file attached it will show up here. For now you can start
            with the standard sections.
          </Text>
          <View style={{ height: 18, alignSelf: "stretch" }} />
          {standardButton(true)}
        </View>
      ) : null}

      {list.status === "ready" && items.length > 0 ? (
        <>
          {searchable ? (
            <View style={s.searchWrap}>
              <Bx name="bx-search" size={17} color={t.muted} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by file, incident or site"
                placeholderTextColor={t.faint}
                style={s.searchInput}
                accessibilityLabel="Search past RCAs"
                autoCorrect={false}
                returnKeyType="search"
              />
              {query ? (
                <TouchableOpacity
                  onPress={() => setQuery("")}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel="Clear search"
                >
                  <Bx name="bx-x" size={17} color={t.muted} />
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}

          <Text style={s.listLabel}>
            {items.length} past {items.length === 1 ? "RCA" : "RCAs"}
          </Text>

          {shown.length === 0 ? (
            <Text style={s.centerText}>No RCA matches “{query.trim()}”.</Text>
          ) : (
            shown.map((tpl) => {
              const meta = [tpl.incident_id, tpl.site_name || tpl.site_code, dateOf(tpl.created_at)]
                .filter(Boolean)
                .join(" · ");
              return (
                <TouchableOpacity
                  key={`${tpl.incident_id}:${tpl.file_url}`}
                  onPress={() => {
                    tap();
                    onPick(tpl);
                  }}
                  disabled={offline}
                  activeOpacity={0.85}
                  style={[s.row, offline && { opacity: 0.5 }]}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${tpl.file_name} as the template. ${meta}${
                    tpl.fault_symptom ? `. ${tpl.fault_symptom}` : ""
                  }`}
                >
                  <View style={s.rowIcon}>
                    <Bx name="bxs-file-pdf" size={20} color={t.accentInk} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={s.rowTitle} numberOfLines={2}>
                      {tpl.file_name}
                    </Text>
                    <Text style={s.rowMeta} numberOfLines={1}>
                      {meta}
                    </Text>
                    {tpl.fault_symptom ? (
                      <Text style={s.rowSub} numberOfLines={2}>
                        {tpl.fault_symptom}
                      </Text>
                    ) : null}
                  </View>
                  <View style={s.useChip}>
                    <Text style={s.useChipText}>Use</Text>
                  </View>
                </TouchableOpacity>
              );
            })
          )}

          <View style={{ marginTop: 14 }}>{standardButton(false)}</View>
        </>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28 },
  title: { ...f.d(24, -0.02, 1.18), color: t.ink, paddingHorizontal: 4 },
  help: { ...f.t(14), lineHeight: 20, color: t.muted, marginTop: 8, paddingHorizontal: 4 },

  center: { alignItems: "center", paddingTop: 36, paddingHorizontal: 12 },
  centerTitle: { ...f.t(17, 600), color: t.ink, textAlign: "center" },
  centerText: { ...f.t(13.5), lineHeight: 20, color: t.muted, textAlign: "center", marginTop: 8 },
  bigIcon: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 14 },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 46,
    marginTop: 16,
    paddingHorizontal: 14,
    borderRadius: 23,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.07)" : t.lineMid,
  },
  searchInput: { flex: 1, ...f.t(14), color: t.ink, paddingVertical: 0 },
  listLabel: { ...f.t(12, 600, 0.04), textTransform: "uppercase", color: t.muted, marginTop: 18, marginBottom: 8, paddingHorizontal: 4 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 72,
    padding: 14,
    marginBottom: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.cardBorder,
    backgroundColor: t.card,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: t.accentTint, alignItems: "center", justifyContent: "center" },
  rowTitle: { ...f.t(14.5, 600), color: t.ink },
  rowMeta: { ...f.t(12), color: t.muted, marginTop: 2 },
  rowSub: { ...f.t(12.5), lineHeight: 17, color: t.ink2, marginTop: 4 },
  useChip: { height: 30, paddingHorizontal: 14, borderRadius: 15, backgroundColor: t.accent, alignItems: "center", justifyContent: "center" },
  useChipText: { ...f.t(12.5, 700), color: t.onAccent },

  standardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    alignSelf: "stretch",
    minHeight: 50,
    paddingHorizontal: 16,
    borderRadius: 25,
    backgroundColor: t.input,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.12)" : t.lineMid,
  },
  standardBtnPrimary: { backgroundColor: t.accent, borderColor: t.accent },
  standardText: { ...f.t(14, 600), color: t.ink },
}));
