/**
 * "Start PM" sheet — captures the mandatory before photo before a PM moves
 * to In-progress. Presentation only: the capture / confirm handlers live in
 * the list screen. Drawn as a JoSheet with the execution screen's dashed
 * photo slot so starting and executing read as one flow.
 */
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import {
  JoSheet,
  PrimaryButton,
  SecondaryButton,
  f,
  useJoTheme,
} from "@/components/jo/ui";

export function PMStartSheet({
  visible,
  title,
  assetId,
  beforeImage,
  starting,
  onCapture,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  assetId?: string | null;
  beforeImage: string;
  starting: boolean;
  onCapture: () => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const t = useJoTheme();
  return (
    <JoSheet
      visible={visible}
      onClose={onClose}
      title="Start PM"
      subtitle={[assetId, title].filter(Boolean).join(" · ")}
    >
      <Text style={[f.t(12.5, 500), { color: t.ink3, marginTop: 18, marginBottom: 8, paddingHorizontal: 4 }]}>
        Before photo<Text style={{ color: t.bad }}> *</Text>
      </Text>

      <TouchableOpacity
        onPress={onCapture}
        disabled={starting}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={beforeImage ? "Retake before photo" : "Take before photo"}
        style={{
          height: 160,
          borderRadius: 20,
          backgroundColor: t.card,
          borderWidth: 1,
          borderStyle: beforeImage ? "solid" : "dashed",
          borderColor: beforeImage ? t.accent : t.lineStrong,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {beforeImage ? (
          <Image
            source={{ uri: beforeImage }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        ) : (
          <View style={{ alignItems: "center", gap: 6 }}>
            <Bx name="bx-camera" size={22} color={t.accentInk} />
            <Text style={[f.t(12.5, 600), { color: t.ink }]}>
              Tap to capture before photo
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {beforeImage ? (
        <TouchableOpacity
          onPress={onCapture}
          disabled={starting}
          hitSlop={8}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, alignSelf: "flex-start", paddingHorizontal: 4 }}
          accessibilityRole="button"
        >
          <Bx name="bx-camera" size={15} color={t.accentInk} />
          <Text style={[f.t(12.5, 600), { color: t.accentInk }]}>Retake photo</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[f.t(11.5), { color: t.muted, marginTop: 8, paddingHorizontal: 4 }]}>
          Required — capture a before photo of the asset to start the PM.
        </Text>
      )}

      <View style={{ flexDirection: "row", gap: 8, marginTop: 20 }}>
        <SecondaryButton label="Cancel" onPress={onClose} style={{ flex: 1 }} />
        <PrimaryButton
          label="Start"
          icon="bx-play"
          onPress={onConfirm}
          busy={starting}
          disabled={!beforeImage}
          height={52}
          style={{ flex: 1 }}
        />
      </View>
    </JoSheet>
  );
}
