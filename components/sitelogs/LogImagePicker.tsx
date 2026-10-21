/**
 * Photo attachment for a log entry — the artboard's dashed "Add photo" slot
 * (height 52, radius 26, accent camera) with a gallery button beside it; once
 * a photo is attached, a thumbnail row with Replace / Remove and a
 * full-screen preview. Upload: S3 via StorageService ("jouleops-attachments").
 */
import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";
import { Bx } from "@/components/jo/Bx";
import { IconButton, f, useJoTheme } from "@/components/jo/ui";
import { FieldLabel } from "./LogsKit";

interface LogImagePickerProps {
  value?: string;
  onImageChange: (url: string | null) => void;
  uploadPath: string; // e.g., "temprh/site_code"
  label?: string;
  /** Text inside the empty slot. */
  cta?: string;
  compact?: boolean;
  disabled?: boolean;
}

export const LogImagePicker: React.FC<LogImagePickerProps> = ({
  value,
  onImageChange,
  uploadPath,
  label,
  cta = "Add photo",
  compact = false,
  disabled = false,
}) => {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const [isUploading, setIsUploading] = useState(false);
  const [isPreviewVisible, setIsPreviewVisible] = useState(false);

  const handlePickImage = async (useCamera: boolean) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permissionResult.granted) {
        Alert.alert(
          "Permission Required",
          `Please grant ${useCamera ? "camera" : "gallery"} permissions to attach images.`
        );
        return;
      }

      const pickerResult = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: "images",
            quality: 0.5,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: "images",
            quality: 0.5,
          });

      if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets.length > 0) {
        uploadImage(pickerResult.assets[0].uri);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Error", "Failed to pick image");
    }
  };

  const uploadImage = async (uri: string) => {
    setIsUploading(true);
    try {
      const filename = `${uploadPath}/${Date.now()}.jpg`;
      const publicUrl = await StorageService.uploadFile(
        "jouleops-attachments",
        filename,
        uri
      );

      if (publicUrl) {
        onImageChange(publicUrl);
      } else {
        Alert.alert("Upload Failed", "Could not upload image correctly.");
      }
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Error", "Failed to upload image");
    } finally {
      setIsUploading(false);
    }
  };

  const removeImage = () => {
    Alert.alert("Remove Image", "Are you sure you want to remove this attachment?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => onImageChange(null),
      },
    ]);
  };

  const busy = isUploading || disabled;

  const roundTile = (size: number) => ({
    width: size,
    height: size,
    borderRadius: size / 2,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
  });

  const renderPreviewModal = () => (
    <Modal
      visible={isPreviewVisible}
      transparent={false}
      animationType="fade"
      onRequestClose={() => setIsPreviewVisible(false)}
    >
      <View style={{ flex: 1, backgroundColor: t.page, justifyContent: "center" }}>
        <Image source={{ uri: value }} style={{ width: "100%", height: "100%" }} resizeMode="contain" />
        <View style={{ position: "absolute", top: insets.top + 10, right: 16 }}>
          <IconButton icon="bx-x" label="Close preview" onPress={() => setIsPreviewVisible(false)} />
        </View>
        <View
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: insets.bottom + 20,
            flexDirection: "row",
            justifyContent: "center",
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={() => {
              setIsPreviewVisible(false);
              handlePickImage(true);
            }}
            activeOpacity={0.85}
            accessibilityRole="button"
            style={{
              height: 48,
              paddingHorizontal: 20,
              borderRadius: 24,
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              backgroundColor: t.input,
              borderWidth: 1,
              borderColor: t.lineMid,
            }}
          >
            <Bx name="bx-revision" size={18} color={t.ink} />
            <Text style={[f.t(14, 600), { color: t.ink }]}>Reupload</Text>
          </TouchableOpacity>
          {!disabled && (
            <TouchableOpacity
              onPress={() => {
                setIsPreviewVisible(false);
                removeImage();
              }}
              activeOpacity={0.85}
              accessibilityRole="button"
              style={{
                height: 48,
                paddingHorizontal: 20,
                borderRadius: 24,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                backgroundColor: t.badWash,
                borderWidth: 1,
                borderColor: t.badBorder,
              }}
            >
              <Bx name="bx-trash" size={18} color={t.bad} />
              <Text style={[f.t(14, 600), { color: t.bad }]}>Delete</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );

  if (compact) {
    return (
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <TouchableOpacity
          onPress={value ? () => setIsPreviewVisible(true) : () => handlePickImage(true)}
          disabled={busy}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={value ? "Preview photo" : "Take photo"}
          style={[roundTile(44), !value && { borderStyle: "dashed", borderColor: t.lineStrong }]}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color={t.accentInk} />
          ) : value ? (
            <Image source={{ uri: value }} style={{ width: 36, height: 36, borderRadius: 18 }} />
          ) : (
            <Bx name="bx-camera" size={19} color={t.accentInk} />
          )}
        </TouchableOpacity>
        {!disabled && (
          <TouchableOpacity
            onPress={() => handlePickImage(false)}
            disabled={isUploading}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            style={roundTile(44)}
          >
            <Bx name="bx-images" size={18} color={t.ink2} />
          </TouchableOpacity>
        )}
        {renderPreviewModal()}
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {label ? <FieldLabel label={label} /> : null}
      {value ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <TouchableOpacity
            onPress={() => setIsPreviewVisible(true)}
            activeOpacity={0.85}
            accessibilityRole="imagebutton"
            accessibilityLabel="Preview photo"
            style={{ width: 64, height: 64, borderRadius: 18, overflow: "hidden", backgroundColor: t.raised }}
          >
            <Image source={{ uri: value }} style={{ width: "100%", height: "100%" }} />
            <View
              style={{
                position: "absolute",
                right: 4,
                bottom: 4,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: t.scrim,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bx name="bx-fullscreen" size={11} color={t.selBg} />
            </View>
          </TouchableOpacity>
          <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
            <Text style={[f.t(13.5, 600), { color: t.ink }]}>Photo attached</Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                onPress={() => handlePickImage(true)}
                disabled={busy}
                activeOpacity={0.8}
                accessibilityRole="button"
                style={{
                  height: 32,
                  paddingHorizontal: 12,
                  borderRadius: 16,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  backgroundColor: t.raised,
                  borderWidth: 1,
                  borderColor: t.lineMid,
                }}
              >
                {isUploading ? (
                  <ActivityIndicator size="small" color={t.muted} />
                ) : (
                  <Bx name="bx-revision" size={14} color={t.ink2} />
                )}
                <Text style={[f.t(12.5, 600), { color: t.ink2 }]}>Reupload</Text>
              </TouchableOpacity>
              {!disabled && (
                <TouchableOpacity
                  onPress={removeImage}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  style={{ height: 32, paddingHorizontal: 10, justifyContent: "center" }}
                >
                  <Text style={[f.t(12.5, 600), { color: t.bad }]}>Remove</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity
            onPress={() => handlePickImage(true)}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={cta}
            style={{
              flex: 1,
              height: 52,
              borderRadius: 26,
              borderWidth: 1,
              borderStyle: "dashed",
              borderColor: t.lineStrong,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              opacity: disabled ? 0.6 : 1,
            }}
          >
            {isUploading ? (
              <ActivityIndicator size="small" color={t.accentInk} />
            ) : (
              <>
                <Bx name="bx-camera" size={19} color={t.accentInk} />
                <Text style={[f.t(13.5, 600), { color: t.ink }]} numberOfLines={1}>
                  {cta}
                </Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handlePickImage(false)}
            disabled={busy}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Choose from gallery"
            style={[roundTile(52), { opacity: disabled ? 0.6 : 1 }]}
          >
            <Bx name="bx-images" size={19} color={t.ink2} />
          </TouchableOpacity>
        </View>
      )}
      {renderPreviewModal()}
    </View>
  );
};
