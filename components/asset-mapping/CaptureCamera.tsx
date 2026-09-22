/**
 * Asset Mapping — screen 4, camera capture (nameplate, location or
 * no-access proof).
 *
 * Live viewfinder with a faint grid, flame corner brackets and an animated
 * scan line. While the parent uploads the shot it passes `busy`, which shows
 * a spinner overlay; the nameplate is read later, in the background.
 * The camera stays dark in both themes — it's a viewfinder.
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
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { Camera } from "lucide-react-native";
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
  const copy = COPY[mode];

  useEffect(() => {
    if (permission && !permission.granted && permission.canAskAgain) {
      void requestPermission();
    }
  }, [permission, requestPermission]);

  // Scan line sweeps the guide frame top → bottom → top.
  const sweep = useSharedValue(0);
  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [sweep]);
  const frameH = useSharedValue(0);
  const lineStyle = useAnimatedStyle(() => ({
    top: frameH.value * (0.06 + sweep.value * 0.86),
  }));

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
          onCameraReady={() => setReady(true)}
        />
      ) : null}
      <View style={[StyleSheet.absoluteFill, styles.shade]} pointerEvents="none" />
      <View style={[StyleSheet.absoluteFill, styles.grid]} pointerEvents="none">
        {Array.from({ length: 3 }).map((_, i) => (
          <View key={`v${i}`} style={[styles.gridV, { left: `${(i + 1) * 25}%` }]} />
        ))}
        {Array.from({ length: 5 }).map((_, i) => (
          <View key={`h${i}`} style={[styles.gridH, { top: `${(i + 1) * 16.6}%` }]} />
        ))}
      </View>

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topInset + 10 }]}>
        <Text style={styles.topTitle}>{copy.title}</Text>
        <TouchableOpacity onPress={onCancel} hitSlop={12} accessibilityRole="button">
          <Text style={styles.cancel}>Cancel</Text>
        </TouchableOpacity>
      </View>

      {/* Guide frame */}
      <View style={styles.frameWrap}>
        {!permission ? null : granted ? (
          <View style={styles.frame} onLayout={(e) => { frameH.value = e.nativeEvent.layout.height; }}>
            <Corner pos="tl" color={accent} />
            <Corner pos="tr" color={accent} />
            <Corner pos="bl" color={accent} />
            <Corner pos="br" color={accent} />
            <Animated.View
              style={[
                styles.scanLine,
                { backgroundColor: accent, shadowColor: accent },
                lineStyle,
              ]}
            />
          </View>
        ) : (
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

function Corner({ pos, color }: { pos: "tl" | "tr" | "bl" | "br"; color: string }) {
  const top = pos[0] === "t";
  const left = pos[1] === "l";
  return (
    <View
      style={{
        position: "absolute",
        width: 34,
        height: 34,
        borderColor: color,
        [top ? "top" : "bottom"]: 0,
        [left ? "left" : "right"]: 0,
        [top ? "borderTopWidth" : "borderBottomWidth"]: 3,
        [left ? "borderLeftWidth" : "borderRightWidth"]: 3,
        [`border${top ? "Top" : "Bottom"}${left ? "Left" : "Right"}Radius`]: 8,
      }}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#041417" },
  shade: { backgroundColor: "rgba(5,8,15,0.28)" },
  grid: { opacity: 0.35 },
  gridV: { position: "absolute", top: 0, bottom: 0, width: 1, backgroundColor: "rgba(200,220,255,0.12)" },
  gridH: { position: "absolute", left: 0, right: 0, height: 1, backgroundColor: "rgba(200,220,255,0.12)" },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  topTitle: { flex: 1, fontSize: 13, fontWeight: "600", color: INK },
  cancel: { fontSize: 13, fontWeight: "600", color: INK_SUB },
  frameWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  frame: { width: "100%", aspectRatio: 4 / 3 },
  scanLine: {
    position: "absolute",
    left: "8%",
    right: "8%",
    height: 2,
    shadowOpacity: 0.8,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  permission: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
  permissionTitle: { fontSize: 15, fontWeight: "700", color: INK, marginTop: 6 },
  permissionBody: { fontSize: 12.5, color: INK_SUB, textAlign: "center" },
  permissionButton: { marginTop: 10, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 20 },
  permissionButtonText: { fontSize: 13, fontWeight: "600", color: "#FFFFFF" },
  bottom: { paddingHorizontal: 20, alignItems: "center" },
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
