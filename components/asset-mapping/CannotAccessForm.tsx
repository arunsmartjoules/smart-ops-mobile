/**
 * Asset Mapping — log an asset as not accessible, in the artboard's form
 * language: reason as wrap chips, a notes field, the dashed proof-photo slot,
 * and the gradient CTA bar. What's still missing shows above the button once
 * the operator has tried to submit.
 */
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { Chip, PrimaryButton, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { MappedAsset } from "@/services/AssetMappingService";
import { ActionPill, BottomBar, DetailTop, Notice, PhotoSlot, SectionCard, bottomBarSpace } from "./ui";
import { NO_ACCESS_REASONS } from "./lib";

export interface CannotAccessDraft {
  reason: string;
  notes: string;
  proofUri: string | null;
}

interface Props {
  topInset: number;
  bottomInset: number;
  asset: MappedAsset;
  draft: CannotAccessDraft;
  submitting: boolean;
  onChange: (draft: CannotAccessDraft) => void;
  onCaptureProof: () => void;
  onBack: () => void;
  onSubmit: () => void;
}

export default function CannotAccessForm({
  topInset,
  bottomInset,
  asset,
  draft,
  submitting,
  onChange,
  onCaptureProof,
  onBack,
  onSubmit,
}: Props) {
  const s = useStyles();
  const t = useJoTheme();
  // Hints go red only once the operator has tried to submit.
  const [attempted, setAttempted] = useState(false);
  const [focused, setFocused] = useState(false);

  const blocker = !draft.reason ? "Select a reason" : !draft.proofUri ? "Capture a proof photo" : null;

  return (
    <KeyboardAvoidingView style={s.screen} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <DetailTop topInset={topInset} title="Cannot access" subtitle={asset.asset_name} onBack={onBack} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.body, { paddingBottom: bottomBarSpace(bottomInset, attempted && blocker ? 26 : 0) }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Notice
          tone="info"
          icon="bx-info-circle"
          text="A proof photo is required. Your supervisor will review this record."
        />

        <SectionCard title="Reason" meta="Required" metaTone={attempted && !draft.reason ? "bad" : undefined}>
          <View style={s.chips}>
            {NO_ACCESS_REASONS.map((r) => (
              <Chip
                key={r}
                label={r}
                height={36}
                selected={draft.reason === r}
                onPress={() => onChange({ ...draft, reason: r })}
              />
            ))}
          </View>
        </SectionCard>

        <SectionCard title="Notes" meta="Optional">
          <TextInput
            value={draft.notes}
            onChangeText={(notes) => onChange({ ...draft, notes })}
            placeholder="Anything the supervisor should know"
            placeholderTextColor={t.faint}
            multiline
            textAlignVertical="top"
            maxLength={2000}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={[s.notes, { borderColor: focused ? t.accent : "transparent" }]}
            accessibilityLabel="Notes"
          />
        </SectionCard>

        <SectionCard
          title="Proof photo"
          meta="Required"
          metaTone={attempted && !draft.proofUri ? "bad" : undefined}
        >
          {draft.proofUri ? (
            <>
              <Image source={{ uri: draft.proofUri }} style={s.proof} accessibilityLabel="Proof photo" />
              <View style={{ flexDirection: "row", marginTop: 10 }}>
                <ActionPill icon="bx-camera" label="Retake proof photo" onPress={onCaptureProof} />
              </View>
            </>
          ) : (
            <View style={{ flexDirection: "row" }}>
              <PhotoSlot icon="bx-camera" label="Capture proof photo" primary onPress={onCaptureProof} />
            </View>
          )}
        </SectionCard>
      </ScrollView>

      <BottomBar bottomInset={bottomInset}>
        {attempted && blocker ? (
          <Text style={s.blocker} accessibilityLiveRegion="polite">
            {blocker}
          </Text>
        ) : null}
        <PrimaryButton
          label="Log as no access"
          icon="bx-block"
          busy={submitting}
          // Stays pressable while incomplete so a tap can name what's missing.
          style={{ opacity: blocker ? 0.55 : 1 }}
          onPress={() => {
            setAttempted(true);
            if (!blocker) onSubmit();
          }}
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  notes: {
    ...f.t(14),
    minHeight: 96,
    borderRadius: 18,
    backgroundColor: t.raised,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 12,
    lineHeight: 20,
    color: t.ink,
  },
  proof: { width: "100%", aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: t.raised },
  blocker: { ...f.t(12.5, 600), color: t.bad, textAlign: "center", marginBottom: 10 },
}));
