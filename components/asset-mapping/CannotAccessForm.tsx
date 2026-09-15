/**
 * Asset Mapping — log an asset as not accessible, in the ticket-update form
 * layout: reason as status chips, notes field, proof photo, and the sticky
 * submit bar that names what's still missing.
 */
import React, { useState } from "react";
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import { Camera, CircleAlert } from "lucide-react-native";
import { makeThemedStyles } from "@/hooks/useDs";
import {
  AttachButton,
  CardHead,
  DetailCard,
  DetailHeader,
  Field,
  StatusChip,
  StatusHint,
  SubmitBar,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
import type { MappedAsset } from "@/services/AssetMappingService";
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
  const styles = useStyles();
  // Hints go red only once the operator has tried to submit.
  const [attempted, setAttempted] = useState(false);

  const blocker = !draft.reason
    ? "Select a reason"
    : !draft.proofUri
      ? "Capture a proof photo"
      : null;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <DetailHeader topInset={topInset} title="Cannot access" subtitle={asset.asset_name} onBack={onBack} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <DetailCard>
          <StatusHint icon={CircleAlert}>
            A proof photo is required. Your supervisor will review this record.
          </StatusHint>
          <CardHead
            label="Reason"
            hint="Required"
            hintTone={attempted && !draft.reason ? "error" : "muted"}
          />
          <View style={styles.chips}>
            {NO_ACCESS_REASONS.map((r) => (
              <StatusChip
                key={r}
                label={r}
                active={draft.reason === r}
                onPress={() => onChange({ ...draft, reason: r })}
              />
            ))}
          </View>
        </DetailCard>

        <DetailCard>
          <CardHead label="Notes" hint="Optional" />
          <Field
            value={draft.notes}
            onChangeText={(notes) => onChange({ ...draft, notes })}
            placeholder="Anything the supervisor should know"
            multiline
            textAlignVertical="top"
            maxLength={2000}
            minHeight={84}
          />
        </DetailCard>

        <DetailCard>
          <CardHead
            label="Proof photo"
            hint="Required"
            hintTone={attempted && !draft.proofUri ? "error" : "muted"}
          />
          {draft.proofUri ? (
            <Image source={{ uri: draft.proofUri }} style={styles.proof} />
          ) : null}
          <View style={{ flexDirection: "row" }}>
            <AttachButton
              icon={Camera}
              label={draft.proofUri ? "Retake proof photo" : "Capture proof photo"}
              active={!!draft.proofUri}
              onPress={onCaptureProof}
            />
          </View>
        </DetailCard>
      </ScrollView>

      <SubmitBar
        label="Log as no access"
        blocked={attempted ? blocker : null}
        ready={!blocker}
        busy={submitting}
        bottomInset={bottomInset}
        onPress={() => {
          setAttempted(true);
          if (!blocker) onSubmit();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  proof: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: soRadius.sm,
    backgroundColor: ds.carbon[1000],
    marginBottom: 10,
  },
}));
