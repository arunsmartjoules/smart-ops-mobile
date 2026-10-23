/**
 * "Sign to complete" bottom sheet in the artboard language.
 *
 * Capture semantics mirror components/SignaturePad (standalone mode) so the
 * saved value is unchanged: strokes are drawn as SVG paths inside a
 * ViewShot, captured to a temporary JPG (quality 0.8) on confirm, and that
 * file URI is handed to `onOK`. An empty pad is rejected with the same
 * "Signature Required" alert.
 */
import React, { useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GestureHandlerRootView, PanGestureHandler, State } from "react-native-gesture-handler";
import ViewShot, { type ViewShotRef } from "react-native-view-shot";
import Animated, { FadeIn, SlideInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";

export function SignatureSheet({
  visible,
  title,
  description = "Please sign here",
  okText,
  onOK,
  onClear,
  onClose,
  busy = false,
}: {
  visible: boolean;
  title: string;
  description?: string;
  okText: string;
  onOK: (signatureUri: string) => void;
  onClear?: () => void;
  onClose: () => void;
  /**
   * The parent is saving the signed record: the confirm button spins and
   * further taps (confirm, clear, close) are ignored until it finishes — on a
   * slow connection that can take a while, and without it the sheet looked
   * frozen ("no response").
   */
  busy?: boolean;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState("");
  const shotRef = useRef<ViewShotRef>(null);

  const clear = () => {
    setPaths([]);
    setCurrentPath("");
    onClear?.();
  };

  const close = () => {
    if (busy) return;
    setPaths([]);
    setCurrentPath("");
    onClose();
  };

  const confirm = async () => {
    if (busy) return;
    if (paths.length === 0 && !currentPath) {
      Alert.alert("Signature Required", "Please provide a signature before saving.");
      return;
    }
    try {
      if (shotRef.current?.capture) {
        const uri = await shotRef.current.capture();
        setPaths([]);
        setCurrentPath("");
        onOK(uri);
      }
    } catch (error) {
      console.error("Signature capture failed", error);
      Alert.alert("Error", "Failed to capture signature image.");
    }
  };

  const onGestureEvent = (event: any) => {
    const { x, y } = event.nativeEvent;
    setCurrentPath((p) => (p === "" ? `M${x},${y}` : `${p} L${x},${y}`));
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END && currentPath) {
      setPaths((prev) => [...prev, currentPath]);
      setCurrentPath("");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
      <Animated.View entering={FadeIn.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Close" />
      </Animated.View>
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <Animated.View
          entering={SlideInDown.duration(260)}
          style={{
            height: "62%",
            marginHorizontal: 8,
            marginBottom: 8 + insets.bottom,
            backgroundColor: t.input,
            borderWidth: 1,
            borderColor: t.lineMid,
            borderRadius: 38,
            paddingTop: 12,
            paddingHorizontal: 20,
            paddingBottom: 20,
          }}
        >
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: t.handle, alignSelf: "center", marginBottom: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.d(22, -0.02), { color: t.ink }]} numberOfLines={1}>
                {title}
              </Text>
              <Text style={[f.t(12.5), { color: t.muted, marginTop: 4 }]} numberOfLines={1}>
                {description}
              </Text>
            </View>
            <IconButton icon="bx-x" label="Close" onPress={close} size={40} />
          </View>

          <View
            style={{
              flex: 1,
              marginTop: 14,
              borderRadius: 22,
              overflow: "hidden",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: t.lineStrong,
            }}
          >
            <GestureHandlerRootView style={{ flex: 1 }}>
              <PanGestureHandler onGestureEvent={onGestureEvent} onHandlerStateChange={onHandlerStateChange} minDist={0}>
                <View style={{ flex: 1 }}>
                  <ViewShot
                    ref={shotRef}
                    options={{ format: "jpg", quality: 0.8 }}
                    style={{ flex: 1, backgroundColor: t.sheetField }}
                  >
                    <Svg style={StyleSheet.absoluteFill}>
                      {[...paths, ...(currentPath ? [currentPath] : [])].map((d, i) => (
                        <Path
                          key={i}
                          d={d}
                          stroke={t.ink}
                          strokeWidth={3}
                          fill="none"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      ))}
                    </Svg>
                  </ViewShot>
                </View>
              </PanGestureHandler>
            </GestureHandlerRootView>
          </View>

          <View style={{ flexDirection: "row", gap: 9, marginTop: 14 }}>
            <SecondaryButton
              label="Clear"
              icon="bx-eraser"
              onPress={busy ? () => {} : clear}
              style={{ paddingHorizontal: 20, opacity: busy ? 0.5 : 1 }}
            />
            <PrimaryButton
              label={busy ? "Saving…" : okText}
              icon="bx-check"
              onPress={confirm}
              busy={busy}
              height={52}
              style={{ flex: 1 }}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}
