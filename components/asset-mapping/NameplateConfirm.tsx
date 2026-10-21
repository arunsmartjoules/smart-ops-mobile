/**
 * Asset Mapping — confirm / enter nameplate data, in the artboard's detail
 * language.
 *
 * No rigid form: the AI read comes back as one "• Label: value" line per
 * spec in a single editable block, so different asset types keep different
 * specs and fixing a misread is just typing. The live count and the save rule
 * use the same line parser as the backend.
 */
import React, { useMemo, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Card, PrimaryButton, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { ActionPill, BottomBar, DetailTop, HintRow, SectionCard, bottomBarSpace } from "./ui";
import { parsePoints, tagOf } from "./lib";

interface Props {
  topInset: number;
  bottomInset: number;
  assetName: string;
  manual: boolean;
  text: string;
  rawText: string;
  saving: boolean;
  onChangeText: (t: string) => void;
  onBack: () => void;
  onRetake: () => void;
  onSave: () => void;
}

export default function NameplateConfirm({
  topInset,
  bottomInset,
  assetName,
  manual,
  text,
  rawText,
  saving,
  onChangeText,
  onBack,
  onRetake,
  onSave,
}: Props) {
  const s = useStyles();
  const t = useJoTheme();
  const [showRaw, setShowRaw] = useState(false);
  const [focused, setFocused] = useState(false);
  const count = useMemo(() => parsePoints(text).length, [text]);
  const tag = manual ? "" : tagOf(text);

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <DetailTop
        topInset={topInset}
        title={manual ? "Enter nameplate data" : "Confirm nameplate data"}
        subtitle={assetName}
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { paddingBottom: bottomBarSpace(bottomInset) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SectionCard
          title={manual ? "Manual entry" : "Read by AI"}
          meta={`${count} ${count === 1 ? "point" : "points"}`}
          style={{ marginTop: 0 }}
        >
          <HintRow icon={manual ? "bxs-keyboard" : "bxs-magic-wand"}>
            {manual
              ? 'Fill in the values from the plate. Keep the "Label: value" format.'
              : "Check each line against the plate and fix anything misread."}
          </HintRow>
          {tag ? (
            <View style={[s.tagRow, { backgroundColor: t.badTint }]}>
              <Bx name="bx-error-circle" size={16} color={t.bad} />
              <Text style={s.tagText}>
                Plate tag <Text style={[s.tagValue, { color: t.bad }]}>{tag}</Text> — confirm this is the unit
                you&apos;re standing at before saving.
              </Text>
            </View>
          ) : null}

          <TextInput
            value={text}
            onChangeText={onChangeText}
            multiline
            editable={!saving}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            textAlignVertical="top"
            placeholderTextColor={t.faint}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[s.editor, { borderColor: focused ? t.accent : "transparent" }]}
            accessibilityLabel="Nameplate data, one Label: value per line"
          />
          <Text style={s.helper}>
            Each Label: value line is saved as its own field, so different asset types keep different specs.
          </Text>
          <View style={{ flexDirection: "row", marginTop: 12 }}>
            <ActionPill icon="bx-camera" label="Retake photo" onPress={onRetake} />
          </View>
        </SectionCard>

        {rawText ? (
          <Card style={{ marginTop: 10, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => setShowRaw((v) => !v)}
              activeOpacity={0.8}
              style={s.rawHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRaw }}
            >
              <Text style={[f.t(15, 600), { color: t.ink }]}>Raw scanned text</Text>
              <Bx name={showRaw ? "bx-chevron-up" : "bx-chevron-down"} size={20} color={t.muted} />
            </TouchableOpacity>
            {showRaw ? (
              <Text style={s.rawBody} selectable>
                {rawText}
              </Text>
            ) : null}
          </Card>
        ) : null}
      </ScrollView>

      <BottomBar bottomInset={bottomInset}>
        <PrimaryButton
          label={count > 0 ? `Confirm & save (${count})` : "Add at least one line"}
          icon={count > 0 ? "bx-check" : undefined}
          busy={saving}
          style={{ opacity: count > 0 ? 1 : 0.55 }}
          onPress={() => {
            if (count > 0) onSave();
          }}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  tagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderRadius: 16,
    padding: 12,
    marginTop: 12,
  },
  tagText: { ...f.t(12), lineHeight: 17, color: t.ink, flex: 1 },
  tagValue: { ...f.t(12, 700) },
  editor: {
    ...f.m(12.5),
    minHeight: 240,
    marginTop: 12,
    borderRadius: 18,
    backgroundColor: t.raised,
    borderWidth: 1.5,
    padding: 14,
    paddingTop: 14,
    lineHeight: 22,
    color: t.ink,
  },
  helper: { ...f.t(11.5), lineHeight: 16, color: t.muted, marginTop: 8 },
  rawHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
  },
  rawBody: {
    ...f.m(11.5),
    lineHeight: 18,
    color: t.ink3,
    borderTopWidth: 1,
    borderTopColor: t.line,
    padding: 16,
  },
}));
