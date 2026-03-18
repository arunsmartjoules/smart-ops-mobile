import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Image,
  Modal,
  ActivityIndicator,
  Alert,
  Dimensions,
} from "react-native";
import { Camera, Image as ImageIcon, X, Maximize2, RefreshCw, Trash2 } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";
import { StorageService } from "@/services/StorageService";

const { width, height } = Dimensions.get("window");

interface LogImagePickerProps {
  value?: string;
  onImageChange: (url: string | null) => void;
  uploadPath: string; // e.g., "temprh/site_code"
  label?: string;
  compact?: boolean;
  disabled?: boolean;
}

export const LogImagePicker: React.FC<LogImagePickerProps> = ({
  value,
  onImageChange,
  uploadPath,
  label,
  compact = false,
  disabled = false,
}) => {
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
        "site-log-attachments",
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

  const renderEntry = () => {
    if (value) {
      return (
        <View className="flex-row items-center space-x-2 gap-2">
          <TouchableOpacity
            onPress={() => setIsPreviewVisible(true)}
            className="w-16 h-16 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800"
          >
            <Image source={{ uri: value }} className="w-full h-full" />
            <View className="absolute bottom-1 right-1 bg-black/50 rounded-full p-1">
              <Maximize2 size={10} color="white" />
            </View>
          </TouchableOpacity>
          <View className="flex-1 space-y-2 gap-2">
            <TouchableOpacity
              onPress={() => handlePickImage(true)}
              className="flex-row items-center py-2 px-3 bg-slate-100 dark:bg-slate-800 rounded-lg"
              disabled={isUploading || disabled}
            >
              <RefreshCw size={14} color="#64748b" />
              <Text className="ml-2 text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-wider">
                Reupload
              </Text>
            </TouchableOpacity>
            {!disabled && (
              <TouchableOpacity
                onPress={removeImage}
                className="flex-row items-center"
              >
                <Text className="text-[10px] font-bold text-red-500 uppercase tracking-widest px-1">
                  Remove
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    return (
      <View className="flex-row space-x-3 gap-3">
        <TouchableOpacity
          onPress={() => handlePickImage(true)}
          disabled={isUploading || disabled}
          className="flex-1 flex-row items-center justify-center bg-slate-50 dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 py-3 rounded-xl"
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#94a3b8" />
          ) : (
            <>
              <Camera size={18} color="#94a3b8" />
              <Text className="ml-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                Capture
              </Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => handlePickImage(false)}
          disabled={isUploading || disabled}
          className="w-12 h-12 items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl"
        >
          <ImageIcon size={18} color="#94a3b8" />
        </TouchableOpacity>
      </View>
    );
  };

  if (compact) {
    return (
      <View>
        <TouchableOpacity
          onPress={value ? () => setIsPreviewVisible(true) : () => handlePickImage(true)}
          disabled={isUploading || disabled}
          className={`w-12 h-12 rounded-xl items-center justify-center border ${value ? "bg-slate-100 border-slate-200" : "bg-slate-50 border-dashed border-slate-300 dark:bg-slate-900 dark:border-slate-700"}`}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#0d9488" />
          ) : value ? (
            <Image source={{ uri: value }} className="w-10 h-10 rounded-lg" />
          ) : (
            <Camera size={20} color="#94a3b8" />
          )}
        </TouchableOpacity>

        {/* Simplified Preview Modal for compact mode if needed, but we'll use the same full screen one */}
        {renderPreviewModal()}
      </View>
    );
  }

  function renderPreviewModal() {
    return (
      <Modal
        visible={isPreviewVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsPreviewVisible(false)}
      >
        <View className="flex-1 bg-black justify-center items-center">
          <TouchableOpacity
            onPress={() => setIsPreviewVisible(false)}
            className="absolute top-12 right-6 z-10 w-10 h-10 rounded-full bg-black/50 items-center justify-center border border-white/20"
          >
            <X size={24} color="white" />
          </TouchableOpacity>
          
          <Image
            source={{ uri: value }}
            className="w-full h-full"
            resizeMode="contain"
          />

          <View className="absolute bottom-12 w-full px-6 flex-row justify-center space-x-4 gap-4">
            <TouchableOpacity
              onPress={() => {
                setIsPreviewVisible(false);
                handlePickImage(true);
              }}
              className="px-6 py-3 bg-white/20 rounded-full border border-white/30 flex-row items-center"
            >
              <RefreshCw size={18} color="white" />
              <Text className="text-white font-bold ml-2">Reupload</Text>
            </TouchableOpacity>
            {!disabled && (
              <TouchableOpacity
                onPress={() => {
                  setIsPreviewVisible(false);
                  removeImage();
                }}
                className="px-6 py-3 bg-red-500/80 rounded-full flex-row items-center"
              >
                <Trash2 size={18} color="white" />
                <Text className="text-white font-bold ml-2">Delete</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View className="space-y-2 gap-2">
      {label && (
        <Text className="text-[10px] font-black uppercase tracking-widest text-slate-400">
          {label}
        </Text>
      )}
      {renderEntry()}
      {renderPreviewModal()}
    </View>
  );
};
