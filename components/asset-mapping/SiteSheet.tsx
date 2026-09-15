/** Asset Mapping — the "Switch site" bottom sheet. */
import React from "react";
import { Modal, Pressable, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, Check } from "lucide-react-native";
import { makeThemedStyles } from "@/hooks/useDs";
import { amPalette, tint } from "./lib";
import { Eyebrow, usePalette } from "./ui";

export interface SiteOption {
  site_code: string;
  site_name: string;
}

export default function SiteSheet({
  visible,
  sites,
  selectedCode,
  onSelect,
  onClose,
}: {
  visible: boolean;
  sites: SiteOption[];
  selectedCode: string;
  onSelect: (site: SiteOption) => void;
  onClose: () => void;
}) {
  const styles = useStyles();
  const p = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.handle} />
          <Eyebrow style={{ marginBottom: 12 }}>Switch site</Eyebrow>
          <ScrollView contentContainerStyle={{ gap: 7 }}>
            {sites.map((s) => {
              const on = s.site_code === selectedCode;
              const fg = on ? p.text : p.sub;
              return (
                <TouchableOpacity
                  key={s.site_code}
                  onPress={() => onSelect(s)}
                  activeOpacity={0.8}
                  style={[
                    styles.option,
                    on
                      ? { backgroundColor: tint(p.accent, 0.12), borderColor: tint(p.accent, 0.45) }
                      : { backgroundColor: p.raised, borderColor: p.border },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Building2 size={17} color={fg} strokeWidth={2} />
                  <Text style={[styles.optionText, { color: fg }]} numberOfLines={1}>
                    {s.site_name || s.site_code}
                  </Text>
                  {on ? <Check size={17} color={fg} strokeWidth={2.4} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    backdrop: { flex: 1, backgroundColor: "rgba(4,8,16,0.7)", justifyContent: "flex-end" },
    sheet: {
      maxHeight: "70%",
      backgroundColor: p.card,
      borderTopWidth: 1,
      borderTopColor: p.border,
      borderTopLeftRadius: 22,
      borderTopRightRadius: 22,
      paddingTop: 18,
      paddingHorizontal: 20,
    },
    handle: {
      width: 38,
      height: 4,
      borderRadius: 99,
      backgroundColor: p.muted,
      alignSelf: "center",
      marginBottom: 16,
    },
    option: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      borderWidth: 1,
      borderRadius: 13,
      padding: 13,
    },
    optionText: { flex: 1, fontSize: 13, fontWeight: "600" },
  };
});
