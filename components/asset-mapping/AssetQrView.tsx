/**
 * Asset Mapping — the asset's QR label, in the detail-screen layout.
 *
 * The same QR the web Assets table shows (web/src/lib/qr-code.ts): QuickChart
 * with the Smart Joules logo in the centre, encoding qr_id (falling back to
 * asset_id), so a printed label scans back to this asset.
 *
 * Loaded like the web's `loadAssetQrImage`: the with-logo image is downloaded
 * first and only kept when QuickChart answers 200 — a failed logo overlay
 * comes back as HTTP 400 carrying a valid "Could not generate QR" PNG, which
 * an <Image> would happily show — otherwise the plain QR is used.
 *
 * The app has no native print module: on iOS "Print label" opens the share
 * sheet on the saved image (Print is in it); on Android it opens the image in
 * the browser, where print / save live.
 */
import React, { useEffect, useState } from "react";
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
import * as FileSystem from "expo-file-system/legacy";
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

/** Big enough to print sharply; the web thumbnails use the same image scaled down. */
const QR_SIZE = 600;

interface LoadedQr {
  /** Local cache file the <Image> shows and the iOS share sheet sends. */
  fileUri: string;
  /** The QuickChart URL that produced it (with or without the logo). */
  remoteUrl: string;
}

async function loadQr(value: string): Promise<LoadedQr> {
  const base = `${FileSystem.cacheDirectory}asset-qr-${value.replace(/[^A-Za-z0-9._-]/g, "_")}`;
  const withLogo = qrImageUrl(value, QR_SIZE, true);
  try {
    const res = await FileSystem.downloadAsync(withLogo, `${base}.png`);
    if (res.status === 200) return { fileUri: res.uri, remoteUrl: withLogo };
  } catch {
    // network / QuickChart error — fall through to the plain QR
  }
  const plain = qrImageUrl(value, QR_SIZE, false);
  const res = await FileSystem.downloadAsync(plain, `${base}-plain.png`);
  if (res.status !== 200) throw new Error(`QR ${res.status}`);
  return { fileUri: res.uri, remoteUrl: plain };
}

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
  // Keyed by the value it was loaded for, so a different asset never shows a
  // stale QR while its own is still downloading.
  const [result, setResult] = useState<{ value: string; qr: LoadedQr | null; failed: boolean }>({
    value: "",
    qr: null,
    failed: false,
  });
  const current = result.value === value;
  const qr = current ? result.qr : null;
  const failed = current && result.failed;

  useEffect(() => {
    let cancelled = false;
    loadQr(value)
      .then((loaded) => !cancelled && setResult({ value, qr: loaded, failed: false }))
      .catch(() => !cancelled && setResult({ value, qr: null, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [value]);

  const share = async () => {
    if (!qr) return;
    const caption = `${asset.asset_name} · ${value}`;
    try {
      await Share.share(
        Platform.OS === "ios"
          ? { url: qr.fileUri, message: caption }
          : // Android's share sheet takes text only; the plain link keeps it short.
            { message: `${caption}\n${qrImageUrl(value, QR_SIZE, false)}` },
      );
    } catch {
      Alert.alert("Couldn't share", "Please try again.");
    }
  };

  const print = async () => {
    if (!qr) return;
    try {
      if (Platform.OS === "ios") {
        await Share.share({ url: qr.fileUri });
      } else {
        await Linking.openURL(qr.remoteUrl);
      }
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
            ) : qr ? (
              <Image
                source={{ uri: qr.fileUri }}
                style={styles.qr}
                accessibilityLabel={`QR code for ${value}`}
              />
            ) : (
              <ActivityIndicator color={ds.carbon[500]} />
            )}
          </View>
          <Text style={styles.code}>{value}</Text>

          <View style={styles.actions}>
            <AttachButton icon={Share2} label="Share" onPress={share} active={!!qr} />
            <AttachButton icon={Printer} label="Print label" onPress={print} active={!!qr} />
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
