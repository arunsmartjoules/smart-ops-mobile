/**
 * Asset Mapping — screen 5, Confirm Nameplate Data.
 *
 * No rigid form: the AI read comes back as one "• Label: value" line per
 * spec in a single editable text block, so different asset types keep
 * different specs and fixing a misread is just typing. The live count and
 * the save rule use the same line parser as the backend.
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
import {
  ChevronDown,
  ChevronUp,
  CircleAlert,
  Image as ImageIcon,
  WandSparkles,
} from "lucide-react-native";
import { makeThemedStyles } from "@/hooks/useDs";
import { MONO, amPalette, parsePoints, tagOf, tint } from "./lib";
import { BackHeader, Button, Notice, usePalette } from "./ui";

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
  const p = usePalette();
  const [showRaw, setShowRaw] = useState(false);
  const count = useMemo(() => parsePoints(text).length, [text]);
  const tag = manual ? "" : tagOf(text);

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: topInset }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <BackHeader title="Confirm Nameplate Data" subtitle={assetName} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 20 }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, styles.strip]}>
          <ImageIcon size={17} color={p.success} strokeWidth={2.2} />
          <Text style={styles.stripText}>
            {manual ? "Nameplate photo saved" : "Nameplate photo captured"}
          </Text>
          <TouchableOpacity onPress={onRetake} hitSlop={10} disabled={saving} accessibilityRole="button">
            <Text style={[styles.link, { color: p.info }]}>Retake</Text>
          </TouchableOpacity>
        </View>

        <Notice color={p.ai} icon={WandSparkles} style={{ marginBottom: 10 }}>
          <Text style={[styles.aiTitle, { color: p.ai }]}>
            {manual ? "Manual entry — fill in from the plate" : `AI Vision extracted ${count} points`}
          </Text>
          <Text style={styles.aiSub}>Edit any line below. Keep the &quot;Label: value&quot; format.</Text>
        </Notice>

        {tag ? (
          <Notice color={p.warning} icon={CircleAlert} style={{ marginBottom: 12 }}>
            <Text style={styles.tagText}>
              Plate tag <Text style={{ color: p.warning, fontWeight: "700" }}>{tag}</Text> — confirm
              this is the unit you&apos;re standing at before saving.
            </Text>
          </Notice>
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
          style={styles.editor}
          accessibilityLabel="Nameplate data, one Label: value per line"
        />
        <Text style={styles.helper}>
          The backend splits each Label: value line into its own field, so different asset types can
          keep different specs.
        </Text>

        {rawText ? (
          <View style={[styles.card, styles.raw]}>
            <TouchableOpacity
              onPress={() => setShowRaw((v) => !v)}
              activeOpacity={0.8}
              style={styles.rawHead}
              accessibilityRole="button"
              accessibilityState={{ expanded: showRaw }}
            >
              <Text style={styles.rawTitle}>Raw scanned text (kept for record)</Text>
              {showRaw ? (
                <ChevronUp size={18} color={p.sub} strokeWidth={2} />
              ) : (
                <ChevronDown size={18} color={p.sub} strokeWidth={2} />
              )}
            </TouchableOpacity>
            {showRaw ? (
              <Text style={styles.rawBody} selectable>
                {rawText}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button tone="secondary" label="Retake" onPress={onRetake} disabled={saving} style={{ flex: 1 }} />
          <Button
            label={`Confirm & Save (${count})`}
            onPress={onSave}
            disabled={count === 0}
            loading={saving}
            style={{ flex: 1.4 }}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    screen: { flex: 1, backgroundColor: p.screen },
    content: { paddingHorizontal: 20 },
    card: {
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 13,
    },
    strip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingVertical: 11,
      paddingHorizontal: 13,
      marginBottom: 10,
    },
    stripText: { flex: 1, fontSize: 11.5, fontWeight: "500", color: p.text },
    link: { fontSize: 11.5, fontWeight: "600" },
    aiTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
    aiSub: { fontSize: 11.5, lineHeight: 17, fontWeight: "500", color: p.sub },
    tagText: { fontSize: 11.5, lineHeight: 18, fontWeight: "500", color: p.text },
    editor: {
      minHeight: 260,
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: tint(ds.isDark ? "#FFFFFF" : "#072B31", 0.13),
      borderRadius: 14,
      padding: 14,
      paddingTop: 14,
      fontFamily: MONO,
      fontSize: 12.5,
      lineHeight: 23,
      color: p.text,
      marginBottom: 9,
    },
    helper: { fontSize: 11, lineHeight: 17, color: p.sub, marginBottom: 14 },
    raw: { overflow: "hidden", marginBottom: 16 },
    rawHead: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 13 },
    rawTitle: { flex: 1, fontSize: 11.5, fontWeight: "600", color: p.sub },
    rawBody: {
      borderTopWidth: 1,
      borderTopColor: p.border,
      paddingVertical: 12,
      paddingHorizontal: 13,
      fontFamily: MONO,
      fontSize: 11,
      lineHeight: 19,
      color: p.sub,
    },
    actions: { flexDirection: "row", gap: 9 },
  };
});
