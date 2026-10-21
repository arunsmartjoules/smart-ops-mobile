/**
 * Full-height sheet that hosts the entry detail and the log/edit form.
 * One Modal for both, so "Edit entry" swaps content instead of stacking a
 * second Modal on top of the first.
 */
import React from "react";
import { KeyboardAvoidingView, Modal, Platform, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft, X } from "lucide-react-native";
import { IconButton, f, useJoTheme } from "@/components/jo/ui";

export function CommSheet({
  visible,
  title,
  kicker,
  onClose,
  onBack,
  children,
  overlay,
}: {
  visible: boolean;
  title: string;
  kicker?: string;
  onClose: () => void;
  /** Shown instead of nothing on the left when the form was opened from the detail. */
  onBack?: () => void;
  children: (bottomInset: number) => React.ReactNode;
  /** Rendered last, above the content (e.g. a Toast — the page's own is hidden under the Modal). */
  overlay?: React.ReactNode;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onBack ?? onClose} statusBarTranslucent>
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.page }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingHorizontal: 16,
            paddingBottom: 10,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderBottomWidth: 1,
            borderBottomColor: t.line,
          }}
        >
          {onBack ? <IconButton icon={ArrowLeft} label="Back to entry" onPress={onBack} /> : null}
          <View style={{ flex: 1, minWidth: 0 }}>
            {kicker ? (
              <Text style={[f.t(12.5), { color: t.muted }]} numberOfLines={1}>
                {kicker}
              </Text>
            ) : null}
            <Text style={[f.d(22, -0.02), { color: t.ink }]} numberOfLines={1}>
              {title}
            </Text>
          </View>
          <IconButton icon={X} label="Close" onPress={onClose} />
        </View>
        {children(insets.bottom)}
        {overlay}
      </KeyboardAvoidingView>
    </Modal>
  );
}
