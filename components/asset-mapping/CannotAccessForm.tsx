/**
 * Asset Mapping — screen 6, Cannot Access.
 *
 * Reason (required) + notes (optional) + proof photo (required). Submit stays
 * disabled, with a "Still missing" list, until both required parts are in.
 */
import React, { useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Camera, Check, ChevronDown, ChevronUp, CircleAlert, CircleCheck } from "lucide-react-native";
import { makeThemedStyles } from "@/hooks/useDs";
import type { MappedAsset } from "@/services/AssetMappingService";
import { MONO, NO_ACCESS_REASONS, amPalette, tint, typeMeta } from "./lib";
import { BackHeader, Button, Eyebrow, Notice, TypeBadge, usePalette } from "./ui";

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
  const styles = useStyles();
  const p = usePalette();
  const meta = typeMeta(asset, p.sub);
  const [reasonsOpen, setReasonsOpen] = useState(false);

  const missing: string[] = [];
  if (!draft.reason) missing.push("Select a reason");
  if (!draft.proofUri) missing.push("Capture a proof photo");
  const ok = missing.length === 0;

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: topInset }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BackHeader title="Cannot Access" onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Notice color={p.warning} icon={CircleAlert} title="Photo proof is required" style={{ marginBottom: 12 }}>
          A photo showing why the asset cannot be accessed is mandatory. This record will be reviewed by
          your supervisor.
        </Notice>

        <View style={[styles.card, styles.assetCard]}>
          <TypeBadge abbr={meta.abbr} color={meta.color} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.assetName} numberOfLines={2}>
              {asset.asset_name}
            </Text>
            <Text style={styles.assetCode}>{asset.asset_id}</Text>
          </View>
        </View>

        <Eyebrow style={styles.label}>Reason · required</Eyebrow>
        <View style={[styles.card, styles.select]}>
          <TouchableOpacity
            onPress={() => setReasonsOpen((v) => !v)}
            activeOpacity={0.8}
            style={styles.selectHead}
            accessibilityRole="button"
            accessibilityState={{ expanded: reasonsOpen }}
          >
            <Text style={[styles.selectText, !draft.reason && { color: p.muted }]}>
              {draft.reason || "Select a reason"}
            </Text>
            {reasonsOpen ? (
              <ChevronUp size={18} color={p.sub} strokeWidth={2} />
            ) : (
              <ChevronDown size={18} color={p.sub} strokeWidth={2} />
            )}
          </TouchableOpacity>
          {reasonsOpen
            ? NO_ACCESS_REASONS.map((r) => {
                const on = r === draft.reason;
                return (
                  <TouchableOpacity
                    key={r}
                    onPress={() => {
                      onChange({ ...draft, reason: r });
                      setReasonsOpen(false);
                    }}
                    style={styles.option}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.optionText, on && { color: p.accent, fontWeight: "600" }]}>{r}</Text>
                    {on ? <Check size={16} color={p.accent} strokeWidth={2.4} /> : null}
                  </TouchableOpacity>
                );
              })
            : null}
        </View>

        <Eyebrow style={styles.label}>Notes · optional</Eyebrow>
        <TextInput
          value={draft.notes}
          onChangeText={(notes) => onChange({ ...draft, notes })}
          placeholder="Anything the supervisor should know"
          placeholderTextColor={p.muted}
          multiline
          textAlignVertical="top"
          maxLength={2000}
          style={[styles.card, styles.notes]}
        />

        <Eyebrow style={styles.label}>Proof photo · required</Eyebrow>
        <TouchableOpacity
          onPress={onCaptureProof}
          activeOpacity={0.85}
          disabled={submitting}
          style={[
            styles.proof,
            draft.proofUri
              ? { borderColor: tint(p.success, 0.5), backgroundColor: tint(p.success, 0.08) }
              : { borderColor: p.borderStrong, backgroundColor: p.card },
          ]}
          accessibilityRole="button"
        >
          {draft.proofUri ? (
            <>
              <Image source={{ uri: draft.proofUri }} style={styles.proofImage} />
              <View style={styles.proofRow}>
                <CircleCheck size={18} color={p.success} strokeWidth={2.2} />
                <Text style={[styles.proofText, { color: p.success }]}>Proof photo captured</Text>
              </View>
              <Text style={styles.proofRetake}>Tap to retake</Text>
            </>
          ) : (
            <>
              <Camera size={26} color={p.sub} strokeWidth={2} />
              <Text style={[styles.proofText, { color: p.sub }]}>Tap to capture proof photo</Text>
            </>
          )}
        </TouchableOpacity>

        {!ok ? (
          <View style={[styles.card, styles.missing]}>
            <Eyebrow color={p.warning} style={{ marginBottom: 8 }}>
              Still missing
            </Eyebrow>
            {missing.map((m) => (
              <View key={m} style={styles.missingRow}>
                <View style={[styles.missingDot, { backgroundColor: p.warning }]} />
                <Text style={styles.missingText}>{m}</Text>
              </View>
            ))}
          </View>
        ) : null}

        <Button tone="warning" label="Log as Non-Accessible" onPress={onSubmit} disabled={!ok} loading={submitting} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    screen: { flex: 1, backgroundColor: p.screen },
    content: { paddingHorizontal: 20 },
    card: { backgroundColor: p.card, borderWidth: 1, borderColor: p.border, borderRadius: 13 },
    assetCard: { flexDirection: "row", alignItems: "center", gap: 11, padding: 12, marginBottom: 16 },
    assetName: { fontSize: 13, fontWeight: "600", color: p.text, marginBottom: 3 },
    assetCode: { fontFamily: MONO, fontSize: 10.5, color: p.sub, letterSpacing: 0.4 },
    label: { marginLeft: 2, marginBottom: 8 },
    select: { marginBottom: 16, overflow: "hidden" },
    selectHead: { flexDirection: "row", alignItems: "center", gap: 8, padding: 13 },
    selectText: { flex: 1, fontSize: 12.5, fontWeight: "500", color: p.text },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 12,
      paddingHorizontal: 13,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    optionText: { flex: 1, fontSize: 12.5, color: p.text },
    notes: {
      height: 84,
      padding: 13,
      paddingTop: 13,
      fontSize: 12.5,
      lineHeight: 20,
      fontWeight: "500",
      color: p.text,
      marginBottom: 16,
    },
    proof: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: 14,
      paddingVertical: 22,
      paddingHorizontal: 14,
      alignItems: "center",
      gap: 9,
      marginBottom: 14,
    },
    proofImage: { width: 120, height: 90, borderRadius: 8 },
    proofRow: { flexDirection: "row", alignItems: "center", gap: 7 },
    proofText: { fontSize: 12, fontWeight: "600" },
    proofRetake: { fontSize: 11, color: p.sub },
    missing: { paddingVertical: 12, paddingHorizontal: 13, marginBottom: 14 },
    missingRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 6 },
    missingDot: { width: 5, height: 5, borderRadius: 99 },
    missingText: { fontSize: 11.5, fontWeight: "500", color: p.sub },
  };
});
