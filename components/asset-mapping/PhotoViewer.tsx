/**
 * Asset Mapping — full-screen preview of a captured photo. Dark chrome in
 * both themes (the artboard's dark tokens), matching the camera.
 */
import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx } from "@/components/jo/Bx";
import { f, useJoTheme } from "@/components/jo/ui";
import { joTheme } from "@/constants/jo";

export default function PhotoViewer({
  photo,
  onClose,
}: {
  photo: { url: string; title: string } | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { accentKey } = useJoTheme();
  const dk = joTheme(true, accentKey);
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loading = !!photo && loadedUrl !== photo.url;

  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={[styles.screen, { backgroundColor: dk.page }]}>
        {photo ? (
          <Image
            source={{ uri: photo.url }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={() => setLoadedUrl(photo.url)}
            accessibilityLabel={photo.title}
          />
        ) : null}
        {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color={dk.ink} /> : null}
        <View style={[styles.bar, { paddingTop: insets.top + 8, backgroundColor: dk.scrim }]}>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={8}
            style={[styles.close, { backgroundColor: dk.input, borderColor: dk.lineMid }]}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <Bx name="bx-x" size={24} color={dk.ink} />
          </TouchableOpacity>
          <Text style={[f.t(15, 600), { color: dk.ink, flex: 1 }]} numberOfLines={1}>
            {photo?.title}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  close: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
