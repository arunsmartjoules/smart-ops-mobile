/**
 * "Sign to complete" bottom sheet in the artboard language.
 *
 * Built like the PM sign sheet (components/pm/PMExecUI): a plain Modal with
 * the native slide animation. It used to animate in with Reanimated layout
 * animations (FadeIn / SlideInDown) inside a `animationType="none"` Modal;
 * on Android that left the sheet's buttons unreachable — taps on
 * "Save signature" and "Clear" fell through to the backdrop and only closed
 * the sheet, while the pad (gesture handler) still drew. Reproduced on an
 * Android 15 emulator, 28 Oct 2026; it was the "Complete & sign does
 * nothing" report on Chiller, Water and Chemical.
 *
 * The sheet only collects the signature. On confirm it encodes the strokes into
 * an SVG data URI in plain JS (utils/signatureSvg) and hands that string to
 * `onOK` synchronously — no native snapshot or file involved, so confirming
 * can't stall. Saving is the parent's job and happens after the sheet closes,
 * which is why the sheet never locks: it can always be confirmed or closed.
 * An empty pad is rejected with the "Signature Required" alert.
 */
import React, { useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GestureHandlerRootView, PanGestureHandler, State } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";
import {
  addPoint,
  buildSignatureDataUri,
  hasInk,
  strokeToPath,
  type Stroke,
} from "@/utils/signatureSvg";

export function SignatureSheet({
  visible,
  title,
  description = "Please sign here",
  okText,
  onOK,
  onClear,
  onClose,
}: {
  visible: boolean;
  title: string;
  description?: string;
  okText: string;
  /** Receives the signature as a `data:image/svg+xml;base64,…` string. */
  onOK: (signature: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke>([]);
  // Gesture callbacks read the live stroke from a ref, not a render closure.
  const currentRef = useRef<Stroke>([]);
  const padSize = useRef({ width: 0, height: 0 });

  const reset = () => {
    currentRef.current = [];
    setCurrent([]);
    setStrokes([]);
  };

  const clear = () => {
    reset();
    onClear?.();
  };

  const close = () => {
    reset();
    onClose();
  };

  const confirm = () => {
    const all = currentRef.current.length ? [...strokes, currentRef.current] : strokes;
    if (!hasInk(all)) {
      Alert.alert("Signature Required", "Please provide a signature before saving.");
      return;
    }
    const signature = buildSignatureDataUri(all, padSize.current.width, padSize.current.height);
    reset();
    onOK(signature);
  };

  const onPadLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    padSize.current = { width, height };
  };

  const onGestureEvent = (event: any) => {
    const { x, y } = event.nativeEvent;
    const next = addPoint(currentRef.current, x, y);
    if (next !== currentRef.current) {
      currentRef.current = next;
      setCurrent(next);
    }
  };

  const onHandlerStateChange = (event: any) => {
    const { state } = event.nativeEvent;
    if ((state === State.END || state === State.CANCELLED) && currentRef.current.length) {
      const finished = currentRef.current;
      currentRef.current = [];
      setCurrent([]);
      setStrokes((prev) => [...prev, finished]);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close} statusBarTranslucent>
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: t.scrim }]}
        onPress={close}
        accessibilityLabel="Close"
      />
      <View style={{ flex: 1, justifyContent: "flex-end" }} pointerEvents="box-none">
        <View
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
                <View style={{ flex: 1, backgroundColor: t.sheetField }} onLayout={onPadLayout}>
                  <Svg style={StyleSheet.absoluteFill}>
                    {[...strokes, ...(current.length ? [current] : [])].map((stroke, i) => (
                      <Path
                        key={i}
                        d={strokeToPath(stroke)}
                        stroke={t.ink}
                        strokeWidth={3}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </Svg>
                </View>
              </PanGestureHandler>
            </GestureHandlerRootView>
          </View>

          <View style={{ flexDirection: "row", gap: 9, marginTop: 14 }}>
            <SecondaryButton label="Clear" icon="bx-eraser" onPress={clear} style={{ paddingHorizontal: 20 }} />
            <PrimaryButton label={okText} icon="bx-check" onPress={confirm} height={52} style={{ flex: 1 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
