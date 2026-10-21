/**
 * Asset Mapping — screen 4, camera capture (nameplate, location or
 * no-access proof).
 *
 * Plain full-screen viewfinder — no guide frame; the whole sensor image is
 * what gets saved. A flash toggle drives the torch so dark plant rooms are lit
 * both in the preview and in the shot.
 *
 * Focus: tapping the viewfinder drops a focus ring and asks the camera to
 * focus there and hold it, which is what a close-up nameplate needs — the
 * continuous autofocus otherwise hunts between the plate and the wall behind
 * it. "Auto" hands focus back to the camera. The lock is iOS-only (expo-camera
 * exposes no focus control on Android, where the camera focuses continuously);
 * the ring still confirms the tap on both.
 *
 * While the parent uploads the shot it passes `busy`, which shows a spinner
 * overlay; the nameplate is read later, in the background. The camera chrome
 * uses the artboard's DARK tokens in both themes (it sits over a live feed),
 * with the user's accent on the shutter, the focus ring and active toggles.
 */
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { CameraView, useCameraPermissions, type FocusMode } from "expo-camera";
import { Bx } from "@/components/jo/Bx";
import { PrimaryButton, f, useJoTheme } from "@/components/jo/ui";
import { joTheme, type JoTheme } from "@/constants/jo";

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
  const { accentKey } = useJoTheme();
  // Dark chrome in both themes; scrims keep text legible over a bright shot.
  const dk = joTheme(true, accentKey);
  const styles = stylesFor(dk);
  const accent = dk.accent;
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [shooting, setShooting] = useState(false);
  const [torch, setTorch] = useState(false);
  // "off" = the camera keeps focusing on its own; "on" = focus once and hold,
  // which is what a tap asks for.
  const [autofocus, setAutofocus] = useState<FocusMode>("off");
  const [ring, setRing] = useState<{ x: number; y: number } | null>(null);
  // Viewfinder size, so the focus button can aim at its centre.
  const [viewfinder, setViewfinder] = useState({ width: 0, height: 0 });
  // State, not a ref: the value is read while rendering the ring.
  const [ringAnim] = useState(() => new Animated.Value(0));
  const refocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copy = COPY[mode];

  useEffect(
    () => () => {
      if (refocusTimer.current) clearTimeout(refocusTimer.current);
    },
    [],
  );

  /** Tap the viewfinder: show the ring there and re-run focus, then hold it. */
  const focusAt = (x: number, y: number) => {
    if (!granted || !ready || busy) return;
    setRing({ x, y });
    ringAnim.setValue(0);
    Animated.sequence([
      Animated.timing(ringAnim, { toValue: 1, duration: 140, useNativeDriver: true }),
      Animated.delay(900),
      Animated.timing(ringAnim, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) setRing(null);
    });

    // A focus pass only restarts when the prop changes, so drop the lock for a
    // frame before asking for it again.
    setAutofocus("off");
    if (refocusTimer.current) clearTimeout(refocusTimer.current);
    refocusTimer.current = setTimeout(() => setAutofocus("on"), 60);
  };

  const clearFocus = () => {
    if (refocusTimer.current) clearTimeout(refocusTimer.current);
    setRing(null);
    setAutofocus("off");
  };

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
          autofocus={autofocus}
          onCameraReady={() => setReady(true)}
        />
      ) : null}

      {/* Top bar */}
      <View style={[styles.topBar, { paddingTop: topInset + 8 }]}>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={8}
          style={styles.roundButton}
          accessibilityRole="button"
          accessibilityLabel="Cancel"
        >
          <Bx name="bx-x" size={24} color={dk.ink} />
        </TouchableOpacity>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.topTitle} numberOfLines={1}>
            {copy.title}
          </Text>
          <Text style={styles.topSub} numberOfLines={1}>
            {assetName}
          </Text>
        </View>
      </View>

      {/* Viewfinder — open, full frame. Tapping it focuses there. */}
      <Pressable
        style={styles.middle}
        onLayout={(e) =>
          setViewfinder({
            width: e.nativeEvent.layout.width,
            height: e.nativeEvent.layout.height,
          })
        }
        onPress={(e) => focusAt(e.nativeEvent.locationX, e.nativeEvent.locationY)}
        accessibilityRole="button"
        accessibilityLabel="Tap to focus"
      >
        {ring ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.focusRing,
              {
                borderColor: accent,
                left: ring.x - FOCUS_RING / 2,
                top: ring.y - FOCUS_RING / 2,
                opacity: ringAnim,
                transform: [
                  { scale: ringAnim.interpolate({ inputRange: [0, 1], outputRange: [1.4, 1] }) },
                ],
              },
            ]}
          />
        ) : null}
        {!permission || granted ? null : (
          <View style={styles.permission}>
            <View style={styles.permissionIcon}>
              <Bx name="bx-camera-off" size={24} color={dk.ink2} />
            </View>
            <Text style={styles.permissionTitle}>Camera access needed</Text>
            <Text style={styles.permissionBody}>Allow the camera to photograph this asset.</Text>
            <PrimaryButton
              label={permission?.canAskAgain === false ? "Open Settings" : "Allow camera"}
              icon="bx-camera"
              height={48}
              style={{ marginTop: 10, paddingHorizontal: 22 }}
              onPress={() => (permission?.canAskAgain === false ? Linking.openSettings() : requestPermission())}
            />
          </View>
        )}
      </Pressable>

      {/* Bottom */}
      <View style={[styles.bottom, { paddingBottom: bottomInset + 22 }]}>
        <Text style={styles.hint}>
          {autofocus === "on" ? "Focus locked — tap the view to move it, or Auto to release." : copy.hint}
        </Text>
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
            <Bx name={torch ? "bxs-zap" : "bx-bolt-circle"} size={22} color={torch ? dk.onAccent : dk.ink} />
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
          {/* Focus: released by default, locked where the operator tapped. */}
          <TouchableOpacity
            onPress={
              autofocus === "on"
                ? clearFocus
                : () => focusAt(viewfinder.width / 2, viewfinder.height / 2)
            }
            disabled={!granted || !ready}
            style={[
              styles.sideButton,
              autofocus === "on" && { backgroundColor: accent },
              (!granted || !ready) && { opacity: 0.4 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={autofocus === "on" ? "Release focus" : "Focus on the centre"}
          >
            <Bx name="bx-target-lock" size={22} color={autofocus === "on" ? dk.onAccent : dk.ink} />
          </TouchableOpacity>
        </View>
      </View>

      {busy ? (
        <View style={[StyleSheet.absoluteFill, styles.overlay]}>
          <View style={styles.busyCard} accessibilityLiveRegion="polite">
            <ActivityIndicator size="large" color={accent} />
            <Text style={styles.busyTitle}>{busy.title}</Text>
            <Text style={styles.busySub}>{busy.sub}</Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const FOCUS_RING = 72;

const STYLE_CACHE = new Map<JoTheme, ReturnType<typeof buildStyles>>();
function stylesFor(dk: JoTheme) {
  let hit = STYLE_CACHE.get(dk);
  if (!hit) {
    hit = buildStyles(dk);
    STYLE_CACHE.set(dk, hit);
  }
  return hit;
}

function buildStyles(dk: JoTheme) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: dk.page },
    focusRing: {
      position: "absolute",
      width: FOCUS_RING,
      height: FOCUS_RING,
      borderRadius: FOCUS_RING / 2,
      borderWidth: 2,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: dk.scrim,
    },
    roundButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: dk.input,
      borderWidth: 1,
      borderColor: dk.lineMid,
      alignItems: "center",
      justifyContent: "center",
    },
    topTitle: { ...f.t(15, 600), color: dk.ink },
    topSub: { ...f.t(11.5), color: dk.muted, marginTop: 2 },
    middle: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
    permission: { alignItems: "center", gap: 8, paddingHorizontal: 20 },
    permissionIcon: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: dk.raised,
      alignItems: "center",
      justifyContent: "center",
    },
    permissionTitle: { ...f.d(22, -0.02), color: dk.ink, marginTop: 6 },
    permissionBody: { ...f.t(13), color: dk.muted, textAlign: "center" },
    bottom: { paddingHorizontal: 20, paddingTop: 16, alignItems: "center", backgroundColor: dk.scrim },
    controls: {
      alignSelf: "stretch",
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingHorizontal: 24,
    },
    sideButton: {
      width: 52,
      height: 52,
      borderRadius: 26,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: dk.input,
      borderWidth: 1,
      borderColor: dk.lineMid,
    },
    hint: { ...f.t(12.5), lineHeight: 18, color: dk.ink2, textAlign: "center", marginBottom: 18 },
    shutter: {
      width: 76,
      height: 76,
      borderRadius: 38,
      borderWidth: 4,
      borderColor: dk.ink,
      alignItems: "center",
      justifyContent: "center",
    },
    shutterInner: { width: 58, height: 58, borderRadius: 29 },
    overlay: { backgroundColor: dk.scrim, alignItems: "center", justifyContent: "center", gap: 12 },
    busyCard: {
      alignItems: "center",
      gap: 10,
      paddingVertical: 22,
      paddingHorizontal: 28,
      borderRadius: 26,
      backgroundColor: dk.card,
      borderWidth: 1,
      borderColor: dk.cardBorder,
    },
    busyTitle: { ...f.t(15, 600), color: dk.ink },
    busySub: { ...f.t(12), color: dk.muted },
  });
}
