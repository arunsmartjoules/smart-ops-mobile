/**
 * Asset Mapping — screen 4, camera capture (nameplate, location or
 * no-access proof).
 *
 * Plain full-screen viewfinder — no guide frame; the whole sensor image is
 * what gets saved. A flash toggle drives the torch so dark plant rooms are lit
 * both in the preview and in the shot. While the parent uploads the shot it
 * passes `busy`, which shows a spinner overlay; the nameplate is read later,
 * in the background. The camera chrome stays dark in both themes.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Camera, Zap, ZapOff } from "lucide-react-native";
import { useDs } from "@/hooks/useDs";

export type CaptureMode = "nameplate" | "location" | "proof";

const COPY: Record<CaptureMode, { title: string; hint: string }> = {
  nameplate: {
    title: "Nameplate Photo",
    hint: "Frame the nameplate so all text is visible and in focus.",
  },
  location: {
    title: "Location Photo",
    hint: "Show the asset and its full installation position.",
  },
  proof: {
    title: "Proof Photo",
    hint: "Show clearly why this asset can't be accessed.",
  },
};

// Viewfinder chrome sits on the app's thunder, dark in both themes.
const INK = "#F1F4F4";
const INK_SUB = "#9FB0B3";
const DIM = "rgba(7,33,38,0.9)";
// Scrim behind the top/bottom chrome so text stays legible over a bright shot.
const SCRIM = "rgba(4,20,23,0.55)";

interface Props {
  mode: CaptureMode;
  assetName: string;
  topInset: number;
  bottomInset: number;
  busy: { title: string; sub: string } | null;
  onCapture: (uri: string) => void;
  onCancel: () => void;
}

export default function CaptureCamera({
  mode,
  assetName,
  topInset,
  bottomInset,
  busy,
  onCapture,
  onCancel,
}: Props) {
  const ds = useDs();
  const accent = ds.flame[100];
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [torch, setTorch] = useState(false);
  const copy = COPY[mode];

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  const shoot = async () => {
    if (!cameraRef.current || !ready || shooting || busy) return;
    setShooting(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.55, exif: false });
      if (photo?.uri) onCapture(photo.uri);
    } finally {
      setShooting(false);
    }
  };

  const granted = !!permission?.granted;

  return (
    <View style={styles.screen}>
      {granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
        />
      ) : null}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topInset + 10 }]}>
        <Text style={styles.topTitle}>{copy.title}</Text>
        <TouchableOpacity onPress={onCancel} hitSlop={12} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Viewfinder — open, full frame */}
      <View style={styles.middle}>
        {!permission || granted ? null : (
          <View style={styles.permission}>
            <Camera size={28} color={INK_SUB} strokeWidth={2} />
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>
              Allow the camera to photograph this asset.
            </Text>
            <TouchableOpacity
              onPress={() =>
                permission?.canAskAgain === false ? Linking.openSettings() : requestPermission()
              }
              style={[styles.permissionButton, { backgroundColor: accent }]}
              accessibilityRole="button"
            >
              <Text style={styles.permissionButtonText}>
                {permission?.canAskAgain === false ? "Open Settings" : "Allow camera"}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Bottom */}
      <View style={[styles.bottom, { paddingBottom: bottomInset + 22 }]}>
        <Text style={styles.assetName} numberOfLines={1}>
          {assetName}
        </Text>
        <Text style={styles.hint}>{copy.hint}</Text>
        <View style={styles.controls}>
          <TouchableOpacity
            onPress={() => setTorch((on) => !on)}
            disabled={!granted || !ready}
            style={[
              styles.sideButton,
              torch && { backgroundColor: accent },
              (!granted || !ready) && { opacity: 0.4 },
            ]}
            accessibilityRole="switch"
            accessibilityState={{ checked: torch }}
            accessibilityLabel="Flash"
          >
            {torch ? (
              <Zap size={22} color="#FFFFFF" strokeWidth={2.2} />
            ) : (
              <ZapOff size={22} color={INK} strokeWidth={2.2} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={shoot}
            disabled={!granted || !ready || shooting || !!busy}
            activeOpacity={0.8}
            style={[styles.shutter, (!granted || !ready) && { opacity: 0.4 }]}
            accessibilityRole="button"
            accessibilityLabel="Take photo"
          >
            <View style={[styles.shutterInner, { backgroundColor: accent }]} />
          </TouchableOpacity>
          {/* Mirrors the flash button so the shutter stays centred. */}
          <View style={styles.sideSpacer} />
        </View>
      </View>

      {busy ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <ActivityIndicator size="large" color={accent} />
          <Text style={styles.busyTitle}>{busy.title}</Text>
          <Text style={styles.busySub}>{busy.sub}</Text>
        </View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#041417" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: SCRIM,
  },
  topTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: INK },
  cancel: { fontSize: 13, fontWeight: "600", color: INK_SUB },
  middle: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  permission: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
  permissionTitle: { fontSize: 15, fontWeight: "700", color: INK, marginTop: 6 },
  permissionBody: { fontSize: 12.5, color: INK_SUB, textAlign: "center" },
  permissionButton: { marginTop: 10, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20 },
  permissionButtonText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  bottom: { paddingHorizontal: 20, paddingTop: 14, alignItems: "center", backgroundColor: SCRIM },
  controls: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
  },
  sideButton: {
    width: 48,
    height: 48,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(238,242,255,0.16)",
  },
  sideSpacer: { width: 48, height: 48 },
  assetName: { fontSize: 12.5, fontWeight: "600", color: INK, marginBottom: 6 },
  hint: { fontSize: 11.5, lineHeight: 17, color: INK_SUB, textAlign: "center", marginBottom: 18 },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 99,
    borderWidth: 4,
    borderColor: "rgba(238,242,255,0.85)",
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 54, height: 54, borderRadius: 99 },
  overlay: { backgroundColor: DIM, alignItems: "center", justifyContent: "center", gap: 14 },
  busyTitle: { fontSize: 14, fontWeight: "600", color: INK },
  busySub: { fontSize: 11.5, fontWeight: "500", color: INK_SUB },
});
