/**
 * The "Raise" FAB's first step: fill the incident in by hand, or upload the
 * RCA report and let the server draft it. Bottom sheet in the same style as
 * AttachmentField's source sheet.
 */
import React from "react";
import { Modal, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { ChevronRight, FileUp, PencilLine, Sparkles, WifiOff } from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import PressableScale from "@/components/PressableScale";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { soRadius, soShadow } from "@/components/tickets/TicketDetailUI";

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
  const styles = useStyles();
  const insets = useSafeAreaInsets();

  const pick = (c: RaiseChoice) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPick(c);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable onPress={onClose} style={styles.backdrop} accessibilityLabel="Close">
        <Pressable
          onPress={() => {}}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <View style={styles.grabber} />
          <Text style={styles.title} accessibilityRole="header">
            Raise an incident
          </Text>
          <Text style={styles.subtitle}>How would you like to start?</Text>

          <ChoiceCard
            icon={PencilLine}
            title="Fill in manually"
            body="Enter the incident details yourself"
            onPress={() => pick("manual")}
          />
          <ChoiceCard
            icon={FileUp}
            accent
            title="Upload RCA report"
            body="We'll read the report and fill in the details for you"
            isNew
            note={offline ? "Needs an internet connection" : undefined}
            onPress={() => pick("rca")}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ChoiceCard({
  icon: Icon,
  title,
  body,
  accent,
  isNew,
  note,
  onPress,
}: {
  icon: LucideIcon;
  title: string;
  body: string;
  accent?: boolean;
  isNew?: boolean;
  note?: string;
  onPress: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.98}
      style={[styles.card, accent && styles.cardAccent]}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${body}`}
    >
      <View style={[styles.iconWell, accent && { backgroundColor: ds.flame[1000] }]}>
        <Icon size={22} color={accent ? ds.flame[100] : ds.carbon[300]} strokeWidth={2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.titleRow}>
          <Text style={styles.cardTitle}>{title}</Text>
          {isNew ? (
            <View style={styles.newPill}>
              <Sparkles size={10} color={ds.onAccent} strokeWidth={2.4} />
              <Text style={styles.newText}>NEW · AI</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.cardBody}>{body}</Text>
        {note ? (
          <View style={styles.noteRow}>
            <WifiOff size={12} color={ds.carbon[500]} strokeWidth={2} />
            <Text style={styles.noteText}>{note}</Text>
          </View>
        ) : null}
      </View>
      <ChevronRight size={18} color={ds.carbon[600]} strokeWidth={2} />
    </PressableScale>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: ds.pageBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingHorizontal: 16,
  },
  grabber: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: ds.carbon[800],
    marginBottom: 16,
  },
  title: { fontSize: 18, fontWeight: "700", color: ds.carbon[100], paddingHorizontal: 4 },
  subtitle: {
    fontSize: 13,
    color: ds.carbon[500],
    marginTop: 3,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 84,
    padding: 16,
    marginBottom: 10,
    borderRadius: soRadius.card + 2,
    borderWidth: 1,
    borderColor: ds.isDark ? ds.cardBorder : ds.carbon[900],
    backgroundColor: ds.white,
    ...soShadow,
  },
  cardAccent: { borderColor: ds.flame[100], borderWidth: 1.5 },
  iconWell: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: ds.carbon[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  titleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
  cardTitle: { fontSize: 15.5, fontWeight: "700", color: ds.carbon[100] },
  cardBody: { fontSize: 13, lineHeight: 18, color: ds.carbon[500], marginTop: 3 },
  newPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[100],
  },
  newText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.6, color: ds.onAccent },
  noteRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  noteText: { fontSize: 11.5, color: ds.carbon[500] },
}));
