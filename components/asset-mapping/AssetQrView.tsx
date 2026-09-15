/**
 * Asset Mapping — screen 3, the asset's QR label.
 *
 * Encodes the same value as the web Assets page (qr_id, falling back to
 * asset_id), so a printed label scans back to this asset in the app's QR
 * scanner. The image comes from QuickChart like the web page's; the tab is
 * online-only anyway.
 *
 * The app has no native print module, so "Print Label" opens the full-size
 * label image in the device browser, where the system print / save options
 * live. "Share QR" hands the same image link to the share sheet.
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
import { makeThemedStyles } from "@/hooks/useDs";
import type { MappedAsset } from "@/services/AssetMappingService";
import { MONO, amPalette, qrImageUrl, qrValue, typeMeta } from "./lib";
import { BackHeader, Button, Chip, usePalette } from "./ui";

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
  const p = usePalette();
  const meta = typeMeta(asset, p.sub);
  const value = qrValue(asset);
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
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <BackHeader title="Asset QR" onBack={onBack} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.head}>
          <Text style={styles.name}>{asset.asset_name}</Text>
          <View style={styles.chips}>
            <Chip label={meta.label} color={meta.color} dot={false} />
            {asset.floor ? <Chip label={asset.floor} color={p.sub} dot={false} /> : null}
          </View>
        </View>

        <View style={styles.qrTile}>
          {failed ? (
            <Text style={styles.qrError}>QR image unavailable offline</Text>
          ) : (
            <>
              <Image
                source={{ uri: qrImageUrl(value, 600) }}
                style={styles.qr}
                onLoad={() => setLoaded(true)}
                onError={() => setFailed(true)}
                accessibilityLabel={`QR code for ${value}`}
              />
              {!loaded ? <ActivityIndicator style={styles.qrSpinner} color="#08101F" /> : null}
            </>
          )}
        </View>

        <Text style={styles.code}>{value}</Text>

        <Button tone="secondary" label="Share QR" icon={Share2} onPress={share} style={{ marginBottom: 9 }} />
        <Button tone="info" label="Print Label" icon={Printer} onPress={print} style={{ marginBottom: 14 }} />
        <Text style={styles.helper}>
          Stick this label on the asset housing so it can be scanned in the field.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    screen: { flex: 1, backgroundColor: p.screen },
    content: { paddingHorizontal: 20, paddingBottom: 28 },
    head: { alignItems: "center", marginBottom: 18 },
    name: { fontSize: 17, lineHeight: 21, fontWeight: "700", color: p.text, textAlign: "center", marginBottom: 7 },
    chips: { flexDirection: "row", gap: 6 },
    qrTile: {
      backgroundColor: "#FFFFFF",
      borderRadius: 18,
      padding: 22,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 14,
      minHeight: 244,
      borderWidth: ds.isDark ? 0 : 1,
      borderColor: p.border,
    },
    qr: { width: 200, height: 200 },
    qrSpinner: { position: "absolute" },
    qrError: { fontSize: 12, color: "#5C5857" },
    code: {
      fontFamily: MONO,
      fontSize: 13,
      fontWeight: "600",
      color: p.text,
      letterSpacing: 1,
      textAlign: "center",
      marginBottom: 20,
    },
    helper: { fontSize: 11.5, lineHeight: 18, color: p.sub, textAlign: "center", paddingHorizontal: 12 },
  };
});
