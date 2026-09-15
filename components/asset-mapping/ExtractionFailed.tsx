/**
 * Asset Mapping — "Couldn't read the text", in the detail-screen layout.
 *
 * Reached when the photo passed (or was forced past) the quality gate but no
 * specs could be read. By the time this shows, the backend has already saved
 * the photo tagged "failed" — the asset counts its nameplate as captured and
 * carries the Data pending flag until someone enters the specs.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Camera, CircleCheck, Keyboard, ScanText } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import {
  AttachButton,
  CardHead,
  DetailCard,
  DetailHeader,
  soRadius,
} from "@/components/tickets/TicketDetailUI";

export default function ExtractionFailed({
  topInset,
  bottomInset,
  assetName,
  onBack,
  onRetake,
  onEnterManually,
  onSavePhotoOnly,
}: {
  topInset: number;
  bottomInset: number;
  assetName: string;
  onBack: () => void;
  onRetake: () => void;
  onEnterManually: () => void;
  onSavePhotoOnly: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  return (
    <View style={styles.screen}>
      <DetailHeader topInset={topInset} title="Nameplate not read" subtitle={assetName} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: bottomInset + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <DetailCard style={{ padding: 16 }}>
          <View style={styles.iconWell}>
            <ScanText size={20} color={ds.flame[100]} strokeWidth={2.1} />
          </View>
          <Text style={styles.title}>Couldn&apos;t read the text</Text>
          <Text style={styles.text}>
            Your photo was saved, but AI couldn&apos;t extract the specs. The asset is flagged as data
            pending until the specs are entered.
          </Text>
          <View style={styles.saved}>
            <CircleCheck size={15} color={ds.sky[100]} strokeWidth={2.2} />
            <Text style={styles.savedText}>Nameplate photo saved</Text>
          </View>
        </DetailCard>

        <DetailCard>
          <CardHead label="What next" />
          <View style={styles.actions}>
            <AttachButton icon={Camera} label="Retake photo" onPress={onRetake} active />
            <AttachButton icon={Keyboard} label="Enter manually" onPress={onEnterManually} />
          </View>
          <TouchableOpacity onPress={onSavePhotoOnly} style={styles.quiet} accessibilityRole="button">
            <Text style={styles.quietText}>Keep the photo only — enter the specs later</Text>
          </TouchableOpacity>
        </DetailCard>
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16 },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[1000],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  title: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: ds.carbon[100], marginBottom: 6 },
  text: { fontSize: 12.5, lineHeight: 19, color: ds.carbon[400] },
  saved: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    paddingTop: 12,
    marginTop: 14,
  },
  savedText: { fontSize: 12, fontWeight: "500", color: ds.carbon[200] },
  actions: { flexDirection: "row", gap: 10 },
  quiet: { paddingTop: 14, paddingBottom: 2, alignItems: "center" },
  quietText: { fontSize: 12, fontWeight: "500", color: ds.carbon[400] },
}));
