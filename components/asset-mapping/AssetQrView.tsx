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
import {
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { JO_LIGHT } from "@/constants/jo";
import type { MappedAsset } from "@/services/AssetMappingService";
import { DetailTop } from "./ui";
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
  const s = useStyles();
  const t = useJoTheme();
  const value = qrValue(asset);
  const status = getMappingStatus(asset);
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
    <View style={s.screen}>
      <DetailTop topInset={topInset} title="QR label" subtitle={asset.asset_id} onBack={onBack} />
      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.pills}>
          <StatusPill label={status.label} tone={status.tone} height={24} />
          <StatusPill label={typeMeta(asset).label} tone="mute" height={24} />
        </View>
        <Text style={s.title} selectable>
          {asset.asset_name}
        </Text>

        <Card style={s.card}>
          {/* A QR must sit on white to scan, in either theme. */}
          <View style={s.qrTile}>
            {failed ? (
              <Text style={s.qrError}>QR image unavailable — check your connection</Text>
            ) : qr ? (
              <Image source={{ uri: qr.fileUri }} style={s.qr} accessibilityLabel={`QR code for ${value}`} />
            ) : (
              <ActivityIndicator color={JO_LIGHT.muted} />
            )}
          </View>
          <Text style={s.code} selectable>
            {value}
          </Text>
          <View style={s.actions}>
            <SecondaryButton label="Share" icon="bx-share-alt" onPress={share} style={{ flex: 1, opacity: qr ? 1 : 0.5 }} />
            <PrimaryButton label="Print label" icon="bx-printer" onPress={print} disabled={!qr} height={52} style={{ flex: 1 }} />
          </View>
        </Card>
        <Text style={[f.t(12), { color: t.muted, textAlign: "center", lineHeight: 18, marginTop: 14, paddingHorizontal: 12 }]}>
          Stick this label on the asset housing so it can be scanned in the field.
        </Text>
      </ScrollView>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  title: { ...f.d(24, -0.025, 1.12), color: t.ink, marginTop: 10 },
  card: { padding: 16, marginTop: 14 },
  qrTile: {
    backgroundColor: JO_LIGHT.card,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 240,
  },
  qr: { width: 200, height: 200 },
  qrError: { ...f.t(12.5), color: JO_LIGHT.muted, textAlign: "center" },
  code: { ...f.m(14, 600), color: t.ink, textAlign: "center", marginTop: 14, marginBottom: 14 },
  actions: { flexDirection: "row", gap: 8 },
}));
