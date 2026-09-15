/** Asset Mapping — the "Switch site" bottom sheet (thunder selection, like the ticket status chips). */
import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Building2, Check } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius } from "@/components/tickets/TicketDetailUI";

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
  const ds = useDs();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Switch site</Text>
          <ScrollView contentContainerStyle={{ gap: 8 }} showsVerticalScrollIndicator={false}>
            {sites.map((s) => {
              const on = s.site_code === selectedCode;
              return (
                <TouchableOpacity
                  key={s.site_code}
                  onPress={() => onSelect(s)}
                  activeOpacity={0.8}
                  style={[
                    styles.option,
                    on
                      ? { backgroundColor: ds.controlOn, borderColor: ds.controlOn }
                      : { backgroundColor: ds.white, borderColor: ds.carbon[900] },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Building2 size={16} color={on ? ds.onControl : ds.carbon[400]} strokeWidth={2} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.name, { color: on ? ds.onControl : ds.carbon[100] }]} numberOfLines={1}>
                      {s.site_name || s.site_code}
                    </Text>
                    <Text style={[styles.code, { color: on ? ds.onControl : ds.carbon[500] }]}>{s.site_code}</Text>
                  </View>
                  {on ? <Check size={16} color={ds.onControl} strokeWidth={2.6} /> : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" },
  sheet: {
    maxHeight: "70%",
    backgroundColor: ds.pageBg,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: ds.cardBorder,
    paddingTop: 10,
    paddingHorizontal: 20,
  },
  handle: {
    width: 38,
    height: 4,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[800],
    alignSelf: "center",
    marginBottom: 14,
  },
  title: { fontSize: 15, fontWeight: "700", color: ds.carbon[100], marginBottom: 12 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: soRadius.sm,
    paddingVertical: 11,
    paddingHorizontal: 12,
  },
  name: { fontSize: 13, fontWeight: "600" },
  code: { fontSize: 10.5, marginTop: 1 },
}));
