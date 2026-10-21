/**
 * The "Raise" button's first step: fill the incident in by hand, or upload
 * the RCA report and let the server draft it. Artboard bottom sheet.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import * as Haptics from "expo-haptics";
import { Bx, type BxName } from "@/components/jo/Bx";
import { JoSheet, f, useJoTheme } from "@/components/jo/ui";

export type RaiseChoice = "manual" | "rca";

export default function RaiseIncidentChooser({
  visible,
  offline,
  onPick,
  onClose,
}: {
  visible: boolean;
  /** The RCA option needs the network; the manual form works offline. */
  offline: boolean;
  onPick: (choice: RaiseChoice) => void;
  onClose: () => void;
}) {
  const pick = (c: RaiseChoice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPick(c);
  };

  return (
    <JoSheet visible={visible} onClose={onClose} title="Raise an incident" subtitle="How would you like to start?">
      <View style={{ marginTop: 16, gap: 8 }}>
        <ChoiceCard
          icon="bx-pencil"
          title="Fill in manually"
          body="Enter the incident details yourself"
          onPress={() => pick("manual")}
        />
        <ChoiceCard
          icon="bx-upload"
          accent
          title="Upload RCA report"
          body="We'll read the report and fill in the details for you"
          isNew
          note={offline ? "Needs an internet connection" : undefined}
          onPress={() => pick("rca")}
        />
      </View>
    </JoSheet>
  );
}

function ChoiceCard({
  icon,
  title,
  body,
  accent,
  isNew,
  note,
  onPress,
}: {
  icon: BxName;
  title: string;
  body: string;
  accent?: boolean;
  isNew?: boolean;
  note?: string;
  onPress: () => void;
}) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}${note ? `. ${note}` : ""}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        minHeight: 84,
        padding: 16,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: accent ? t.accent : t.lineMid,
        backgroundColor: accent ? t.accentTint : t.sheetField,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 22,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: accent ? t.accent : t.raised,
        }}
      >
        <Bx name={icon} size={21} color={accent ? t.onAccent : t.ink2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <Text style={[f.t(15, 600), { color: t.ink }]}>{title}</Text>
          {isNew ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 3,
                height: 20,
                paddingHorizontal: 7,
                borderRadius: 10,
                backgroundColor: t.accent,
              }}
            >
              <Bx name="bxs-magic-wand" size={11} color={t.onAccent} />
              <Text style={[f.t(10, 700), { color: t.onAccent }]}>NEW · AI</Text>
            </View>
          ) : null}
        </View>
        <Text style={[f.t(12.5), { color: t.muted, marginTop: 3, lineHeight: 17 }]}>{body}</Text>
        {note ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
            <Bx name="bx-wifi-off" size={13} color={t.warn} />
            <Text style={[f.t(11.5, 500), { color: t.warn }]}>{note}</Text>
          </View>
        ) : null}
      </View>
      <Bx name="bx-chevron-right" size={20} color={t.faint} />
    </TouchableOpacity>
  );
}
