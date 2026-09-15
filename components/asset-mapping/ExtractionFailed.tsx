/**
 * Asset Mapping — screen 4b, "Couldn't read the text".
 *
 * Reached when the photo passed (or was forced past) the quality gate but no
 * specs could be read. By the time this shows, the backend has already saved
 * the photo tagged "failed" — the asset counts its nameplate as captured and
 * carries the Data pending flag until someone enters the specs.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Camera, CircleCheck, Keyboard, ScanText } from "lucide-react-native";
import { makeThemedStyles } from "@/hooks/useDs";
import { amPalette, tint } from "./lib";
import { Button, usePalette } from "./ui";

export default function ExtractionFailed({
  topInset,
  bottomInset,
  onRetake,
  onEnterManually,
  onSavePhotoOnly,
}: {
  topInset: number;
  bottomInset: number;
  onRetake: () => void;
  onEnterManually: () => void;
  onSavePhotoOnly: () => void;
}) {
  const styles = useStyles();
  const p = usePalette();
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topInset + 24, paddingBottom: bottomInset + 24 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: tint(p.warning, 0.14) }]}>
        <ScanText size={26} color={p.warning} strokeWidth={2} />
      </View>
      <Text style={styles.title}>Couldn&apos;t read the text</Text>
      <Text style={styles.body}>
        Your photo was saved, but AI vision couldn&apos;t extract the specs. This asset is tagged for
        the office team to re-enter from the image.
      </Text>
      <View style={[styles.strip, { borderColor: tint(p.success, 0.25) }]}>
        <CircleCheck size={17} color={p.success} strokeWidth={2.2} />
        <Text style={styles.stripText}>Nameplate photo saved · tagged &quot;extraction failed&quot;</Text>
      </View>
      <Button label="Retake Photo" icon={Camera} onPress={onRetake} style={{ marginBottom: 9 }} />
      <Button
        tone="infoOutline"
        label="Enter details manually"
        icon={Keyboard}
        onPress={onEnterManually}
        style={{ marginBottom: 14 }}
      />
      <TouchableOpacity onPress={onSavePhotoOnly} style={{ padding: 6 }} accessibilityRole="button">
        <Text style={styles.quiet}>Save photo only — office will re-enter</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    screen: { flex: 1, backgroundColor: p.screen },
    content: { paddingHorizontal: 20 },
    icon: {
      width: 52,
      height: 52,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    title: { fontSize: 19, lineHeight: 24, fontWeight: "700", color: p.text, marginBottom: 9 },
    body: { fontSize: 12.5, lineHeight: 20, fontWeight: "500", color: p.sub, marginBottom: 16 },
    strip: {
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      backgroundColor: p.card,
      borderWidth: 1,
      borderRadius: 13,
      paddingVertical: 12,
      paddingHorizontal: 13,
      marginBottom: 22,
    },
    stripText: { flex: 1, fontSize: 11.5, lineHeight: 17, fontWeight: "500", color: p.text },
    quiet: { fontSize: 12, fontWeight: "600", color: p.sub, textAlign: "center" },
  };
});
