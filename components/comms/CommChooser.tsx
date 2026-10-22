/**
 * First step of "Log": the manual form, or the AI intake that drafts the
 * entry from notes or a document — web components/comm-create-chooser.tsx.
 */
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx, type BxName } from "@/components/jo/Bx";
import { JoSheet, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";

export type CommCreateMode = "manual" | "ai";

const OPTIONS: { mode: CommCreateMode; icon: BxName; title: string; description: string; isNew?: boolean }[] = [
  {
    mode: "manual",
    icon: "bx-edit-alt",
    title: "Fill in manually",
    description: "Enter the communication details yourself",
  },
  {
    mode: "ai",
    icon: "bxs-magic-wand",
    title: "Describe it",
    description: "Type or dictate it, or attach the email / minutes — we'll fill in the entry for you",
    isNew: true,
  },
];

const useStyles = makeJoStyles((t) => ({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.lineMid,
    backgroundColor: t.card,
  },
  well: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
}));

export function CommChooser({
  visible,
  onClose,
  onPick,
}: {
  visible: boolean;
  onClose: () => void;
  onPick: (mode: CommCreateMode) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  return (
    <JoSheet visible={visible} onClose={onClose} title="Log a communication" subtitle="How would you like to add it?">
      <View style={{ gap: 10, marginTop: 16 }}>
        {OPTIONS.map((o) => (
          <TouchableOpacity
            key={o.mode}
            onPress={() => onPick(o.mode)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={`${o.title}. ${o.description}`}
            style={s.card}
          >
            <View style={[s.well, { backgroundColor: o.mode === "ai" ? t.accentTint : t.raised }]}>
              <Bx name={o.icon} size={21} color={o.mode === "ai" ? t.accentInk : t.ink2} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 }}>
                <Text style={[f.t(14.5, 600), { color: t.ink }]}>{o.title}</Text>
                {o.isNew ? (
                  <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: t.accentTint }}>
                    <Text style={[f.t(10.5, 600), { color: t.accentInk, textTransform: "uppercase" }]}>New · AI</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[f.t(12.5), { color: t.muted, marginTop: 3, lineHeight: 17 }]}>{o.description}</Text>
            </View>
            <Bx name="bx-chevron-right" size={18} color={t.faint} />
          </TouchableOpacity>
        ))}
      </View>
    </JoSheet>
  );
}
