/**
 * Asset Mapping — the asset's QR label, in the detail-screen layout.
 *
 * Encodes the same value as the web Assets page (qr_id, falling back to
 * asset_id), so a printed label scans back to this asset in the app's QR
 * scanner. The image comes from QuickChart like the web page's.
 *
 * The app has no native print module, so "Print label" opens the full-size
 * image in the device browser, where the system print / save options live.
 */
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Platform,
  ScrollView,
  Share,
  Text,
  View,
} from "react-native";
import { Printer, Share2 } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import {
  AttachButton,
  Badge,
  DetailCard,
  DetailHeader,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
import type { MappedAsset } from "@/services/AssetMappingService";
import { getMappingStatus, qrImageUrl, qrValue, typeMeta } from "./lib";

export default function AssetQrView({
  topInset,
  asset,
  onBack,
}: {
  topInset: number;
  asset: MappedAsset;
  onBack: () => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const value = qrValue(asset);
  const status = getMappingStatus(asset, ds);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const share = async () => {
    const link = qrImageUrl(value, 800);
    try {
      await Share.share(
        Platform.OS === "ios"
          ? { url: link, message: `${asset.asset_name} · ${value}` }
          : { message: `${asset.asset_name} · ${value}\n${link}` },
      );
    } catch {
      Alert.alert("Couldn't share", "Please try again.");
    }
  };

  const print = async () => {
    try {
      await Linking.openURL(qrImageUrl(value, 1000));
    } catch {
      Alert.alert("Couldn't open the label", "Please try again.");
    }
  };

  return (
    <View style={styles.screen}>
      <DetailHeader topInset={topInset} title="QR label" subtitle={asset.asset_id} onBack={onBack} />
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <DetailCard style={styles.card}>
          <Text style={styles.title}>{asset.asset_name}</Text>
          <View style={styles.badgeRow}>
            <Badge label={status.label} bg={status.bg} fg={status.fg} />
            <Badge label={typeMeta(asset).label} bg={ds.carbon[1000]} fg={ds.carbon[400]} />
          </View>

          <View style={styles.qrTile}>
            {failed ? (
              <Text style={styles.qrError}>QR image unavailable — check your connection</Text>
            ) : (
              <>
                <Image
                  source={{ uri: qrImageUrl(value, 600) }}
                  style={styles.qr}
                  onLoad={() => setLoaded(true)}
                  onError={() => setFailed(true)}
                  accessibilityLabel={`QR code for ${value}`}
                />
                {!loaded ? <ActivityIndicator style={styles.qrSpinner} color={ds.thunder[100]} /> : null}
              </>
            )}
          </View>
          <Text style={styles.code}>{value}</Text>

          <View style={styles.actions}>
            <AttachButton icon={Share2} label="Share" onPress={share} />
            <AttachButton icon={Printer} label="Print label" onPress={print} />
          </View>
        </DetailCard>
        <Text style={styles.helper}>
          Stick this label on the asset housing so it can be scanned in the field.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  card: { padding: 16 },
  title: { fontSize: 16, lineHeight: 22, fontWeight: "600", color: ds.carbon[100], marginBottom: 10 },
  badgeRow: { flexDirection: "row", gap: 7, marginBottom: 16 },
  qrTile: {
    backgroundColor: "#FFFFFF",
    borderRadius: soRadius.card,
    borderWidth: 1,
    borderColor: ds.carbon[1000],
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  qr: { width: 200, height: 200 },
  qrSpinner: { position: "absolute" },
  qrError: { fontSize: 12, color: "#5C5857", textAlign: "center" },
  code: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 1,
    color: ds.carbon[100],
    textAlign: "center",
    marginTop: 12,
    marginBottom: 14,
  },
  actions: { flexDirection: "row", gap: 10 },
  helper: { fontSize: 11, lineHeight: 17, color: ds.carbon[400], textAlign: "center", paddingHorizontal: 12 },
}));
