/**
 * Asset Mapping — confirm nameplate data, in the detail-screen layout.
 *
 * No rigid form: the AI read comes back as one "• Label: value" line per
 * spec in a single editable block, so different asset types keep different
 * specs and fixing a misread is just typing. The live count and the save rule
 * use the same line parser as the backend.
 */
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Camera, ChevronDown, ChevronUp, CircleAlert, Sparkles } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import {
  AttachButton,
  CardHead,
  DetailCard,
  DetailHeader,
  StatusHint,
  SubmitBar,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
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
  const styles = useStyles();
  const ds = useDs();
  const [showRaw, setShowRaw] = useState(false);
  const count = useMemo(() => parsePoints(text).length, [text]);
  const tag = manual ? "" : tagOf(text);

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <DetailHeader
        topInset={topInset}
        title={manual ? "Enter nameplate data" : "Confirm nameplate data"}
        subtitle={assetName}
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <DetailCard>
          <CardHead
            label={manual ? "Manual entry" : "Read by AI"}
            hint={`${count} ${count === 1 ? "point" : "points"}`}
          />
          <StatusHint icon={Sparkles}>
            {manual
              ? "Fill in the values from the plate. Keep the \"Label: value\" format."
              : "Check each line against the plate and fix anything misread."}
          </StatusHint>
          {tag ? (
            <View style={styles.tagRow}>
              <CircleAlert size={14} color={ds.flame[100]} strokeWidth={2.2} />
              <Text style={styles.tagText}>
                Plate tag <Text style={styles.tagValue}>{tag}</Text> — confirm this is the unit
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
            placeholderTextColor={ds.carbon[700]}
            style={styles.editor}
            accessibilityLabel="Nameplate data, one Label: value per line"
          />
          <Text style={styles.helper}>
            Each Label: value line is saved as its own field, so different asset types keep different
            specs.
          </Text>
          <View style={styles.retakeRow}>
            <AttachButton icon={Camera} label="Retake photo" onPress={onRetake} />
          </View>
        </DetailCard>

        {rawText ? (
          <DetailCard style={{ padding: 0, overflow: "hidden" }}>
            <TouchableOpacity
              onPress={() => setShowRaw((v) => !v)}
              activeOpacity={0.8}
              style={styles.rawHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRaw }}
            >
              <Text style={styles.eyebrow}>Raw scanned text</Text>
              {showRaw ? (
                <ChevronUp size={17} color={ds.carbon[500]} strokeWidth={2} />
              ) : (
                <ChevronDown size={17} color={ds.carbon[500]} strokeWidth={2} />
              )}
            </TouchableOpacity>
            {showRaw ? (
              <Text style={styles.rawBody} selectable>
                {rawText}
              </Text>
            ) : null}
          </DetailCard>
        ) : null}
      </ScrollView>

      <SubmitBar
        label={count > 0 ? `Confirm & save (${count})` : "Add at least one line"}
        ready={count > 0}
        busy={saving}
        bottomInset={bottomInset}
        onPress={() => {
          if (count > 0) onSave();
        }}
      />
    </KeyboardAvoidingView>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  tagRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
    backgroundColor: ds.flame[1000],
    borderRadius: soRadius.sm,
    padding: 10,
    marginBottom: 12,
  },
  tagText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: ds.carbon[100] },
  tagValue: { fontWeight: "700", color: ds.flame[100] },
  editor: {
    minHeight: 240,
    backgroundColor: ds.pageBg,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    borderRadius: soRadius.sm,
    padding: 12,
    paddingTop: 12,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12.5,
    lineHeight: 22,
    color: ds.carbon[100],
  },
  helper: { fontSize: 10.5, lineHeight: 15, color: ds.carbon[400], marginTop: 8 },
  retakeRow: { flexDirection: "row", marginTop: 12 },
  rawHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
  },
  rawBody: {
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    padding: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 11,
    lineHeight: 18,
    color: ds.carbon[400],
  },
}));
