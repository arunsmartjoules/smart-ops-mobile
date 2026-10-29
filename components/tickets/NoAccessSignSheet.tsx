/**
 * "No Access" sign-off — the client's name and signature, collected before a
 * ticket can move to No Access.
 *
 * No Access stops the ticket's SLA clocks (backend: complaint_sla_pauses), so
 * it needs the client's confirmation that access was refused. The sheet only
 * collects; the parent submits the status update with both values.
 *
 * Built like components/sitelogs/SignatureSheet: a plain Modal with the native
 * slide animation and plain Views. A Reanimated `entering` animation inside a
 * Modal left sheet buttons untouchable on Android (Oct 2026), so don't add one.
 * The signature is the same small SVG data URI the site logs store
 * (utils/signatureSvg) — no file or upload, so it survives the offline queue.
 */
import React, { useRef, useState } from "react";
import { Alert, Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Path } from "react-native-svg";
import { GestureHandlerRootView, PanGestureHandler, State } from "react-native-gesture-handler";
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { IconButton, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";
import { BoxInput, FieldHead } from "@/components/tickets/TicketFormParts";
import {
  addPoint,
  buildSignatureDataUri,
  hasInk,
  strokeToPath,
  type Stroke,
} from "@/utils/signatureSvg";

/** What the parent sends with the No Access update. */
export interface NoAccessSignoff {
  client_name: string;
  /** `data:image/svg+xml;base64,…` */
  client_signature: string;
}

/** Matches the backend's limit on `client_name`. */
const CLIENT_NAME_MAX = 120;

export function NoAccessSignSheet({
  visible,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  onConfirm: (signoff: NoAccessSignoff) => void;
  onClose: () => void;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [clientName, setClientName] = useState("");
  const [nameMissing, setNameMissing] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [current, setCurrent] = useState<Stroke>([]);
  // Gesture callbacks read the live stroke from a ref, not a render closure.
  const currentRef = useRef<Stroke>([]);
  const padSize = useRef({ width: 0, height: 0 });

  const clearPad = () => {
    currentRef.current = [];
    setCurrent([]);
    setStrokes([]);
  };

  const close = () => {
    clearPad();
    setClientName("");
    setNameMissing(false);
    onClose();
  };

  const confirm = () => {
    const name = clientName.trim();
    if (!name) {
      setNameMissing(true);
      return;
    }
    const all = currentRef.current.length ? [...strokes, currentRef.current] : strokes;
    if (!hasInk(all)) {
      Alert.alert("Signature required", "Ask the client to sign before confirming.");
      return;
    }
    const signature = buildSignatureDataUri(all, padSize.current.width, padSize.current.height);
    clearPad();
    setClientName("");
    setNameMissing(false);
    onConfirm({ client_name: name, client_signature: signature });
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
      <KeyboardAvoidingView style={{ flex: 1, justifyContent: "flex-end" }} behavior="padding" pointerEvents="box-none">
        <View
          style={{
            height: "78%",
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
                Client sign-off
              </Text>
              <Text style={[f.t(12.5), { color: t.muted, marginTop: 4 }]} numberOfLines={2}>
                The client confirms access wasn&apos;t given. The SLA timer pauses until the status changes.
              </Text>
            </View>
            <IconButton icon="bx-x" label="Close" onPress={close} size={40} />
          </View>

          <FieldHead
            label="Client name"
            hint="Required"
            hintBad={nameMissing}
            style={{ marginTop: 16 }}
          />
          <BoxInput
            placeholder="Who is refusing access?"
            value={clientName}
            onChangeText={(v) => {
              setClientName(v);
              if (nameMissing && v.trim()) setNameMissing(false);
            }}
            maxLength={CLIENT_NAME_MAX}
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="done"
            invalid={nameMissing}
            accessibilityLabel="Client name"
            style={{ marginTop: 9 }}
          />
          {nameMissing ? (
            <Text style={[f.t(12), { color: t.bad, marginTop: 6 }]} accessibilityLiveRegion="polite">
              Enter the client&apos;s name.
            </Text>
          ) : null}

          <FieldHead label="Client signature" hint="Required" style={{ marginTop: 16 }} />
          <View
            style={{
              flex: 1,
              minHeight: 140,
              marginTop: 9,
              borderRadius: 22,
              overflow: "hidden",
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: t.lineStrong,
            }}
            accessibilityLabel="Signature pad. Ask the client to sign here."
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
            <SecondaryButton label="Clear" icon="bx-eraser" onPress={clearPad} style={{ paddingHorizontal: 20 }} />
            <PrimaryButton label="Move to No Access" icon="bx-check" onPress={confirm} height={52} style={{ flex: 1 }} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
