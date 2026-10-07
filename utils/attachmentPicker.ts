import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

/**
 * One place that knows how to pick an attachment, so every screen gets the
 * same behaviour.
 *
 * Camera shots are NEVER put through the OS crop step (`allowsEditing` stays
 * off): a crop screen after every photo is friction for field staff taking
 * evidence shots, and it silently trims the very edge of the frame that proves
 * something. Quality stays at 0.7 to keep uploads small on site connections.
 */
export type AttachmentSource = "camera" | "gallery" | "files";

const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "heic", "heif", "avif"];

const extOf = (uri: string) => {
  const clean = (uri.split("?")[0] ?? uri).toLowerCase();
  const name = clean.split("/").pop() ?? "";
  return name.includes(".") ? (name.split(".").pop() ?? "") : "";
};

/** True for anything that is not recognisably an image (pdf, docx, csv …). */
export const isDocumentUri = (uri: string) => {
  const ext = extOf(uri);
  return ext !== "" && !IMAGE_EXT.includes(ext);
};

export const attachmentFileName = (uri: string) => {
  const noQuery = uri.split("?")[0] || uri;
  const last = noQuery.split("/").pop() || "attachment";
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

export async function pickFromCamera(): Promise<string[]> {
  try {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Permission required", "Camera permission is required.");
      return [];
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ["images"],
      allowsEditing: false,
      quality: 0.7,
    });
    if (result.canceled) return [];
    return result.assets.map((a) => a.uri).filter(Boolean);
  } catch {
    Alert.alert("Error", "Unable to open the camera.");
    return [];
  }
}

export async function pickFromGallery(selectionLimit = 8): Promise<string[]> {
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      allowsEditing: false,
      quality: 0.7,
      selectionLimit,
    });
    if (result.canceled) return [];
    return result.assets.map((a) => a.uri).filter(Boolean);
  } catch {
    Alert.alert("Error", "Unable to open the photo library.");
    return [];
  }
}

/**
 * Any file type. StorageService maps an unknown extension to
 * `application/octet-stream`, which the backend's presign allowlist accepts, so
 * the wildcard type is safe here — rejecting an unsupported file is the
 * server's call, not the picker's.
 */
export async function pickFiles(): Promise<string[]> {
  try {
    const result = await DocumentPicker.getDocumentAsync({
      multiple: true,
      type: "*/*",
      copyToCacheDirectory: true,
    });
    if (result.canceled) return [];
    return result.assets.map((a) => a.uri).filter(Boolean);
  } catch {
    Alert.alert("Error", "Unable to open the file picker.");
    return [];
  }
}

export async function pickAttachments(source: AttachmentSource): Promise<string[]> {
  if (source === "camera") return pickFromCamera();
  if (source === "gallery") return pickFromGallery();
  return pickFiles();
}
