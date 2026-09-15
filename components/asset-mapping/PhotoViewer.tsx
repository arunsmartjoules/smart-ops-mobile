/** Asset Mapping — full-screen preview of a captured photo. */
import React, { useState } from "react";
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { X } from "lucide-react-native";

export default function PhotoViewer({
  photo,
  onClose,
}: {
  photo: { url: string; title: string } | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const loading = !!photo && loadedUrl !== photo.url;

  return (
    <Modal visible={!!photo} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.screen}>
        {photo ? (
          <Image
            source={{ uri: photo.url }}
            style={StyleSheet.absoluteFill}
            resizeMode="contain"
            onLoad={() => setLoadedUrl(photo.url)}
            accessibilityLabel={photo.title}
          />
        ) : null}
        {loading ? <ActivityIndicator style={StyleSheet.absoluteFill} color="#FFFFFF" /> : null}
        <View style={[styles.bar, { paddingTop: insets.top + 10 }]}>
          <Text style={styles.title} numberOfLines={1}>
            {photo?.title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
          >
            <X size={20} color="#FFFFFF" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#000000" },
  bar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  title: { flex: 1, fontSize: 14, fontWeight: "600", color: "#FFFFFF" },
  close: {
    width: 34,
    height: 34,
    borderRadius: 99,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
});
