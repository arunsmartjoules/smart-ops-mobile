/**
 * File pickers for the client-communication sheets.
 *
 * Calls expo-document-picker / expo-image-picker directly (both ship in the
 * binary) instead of utils/attachmentPicker because the AI intake needs each
 * file's name and size for its checks, which that helper drops. Photos keep
 * the app-wide rules: no crop step, quality 0.7.
 */
import { Alert } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import type { LocalFile } from "@/services/CustomerCommunicationService";
import { extOf } from "./lib";

export interface PickedFile extends LocalFile {
  size: number | null;
}

const EXT_BY_MIME: Record<string, string> = {
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

function toPicked(a: { uri: string; name?: string | null; size?: number | null; mimeType?: string | null }, fallback: string): PickedFile {
  const ext = extOf(a.name) || extOf(a.uri) || EXT_BY_MIME[a.mimeType ?? ""] || "";
  const name = (a.name || "").trim() || `${fallback}${ext ? `.${ext}` : ""}`;
  return { uri: a.uri, name, ext, size: typeof a.size === "number" ? a.size : null };
}

/** Any file (form / detail attachments), or only `types` (AI intake documents). */
export async function pickDocuments(types: string[] | string = "*/*"): Promise<PickedFile[]> {
  try {
    const res = await DocumentPicker.getDocumentAsync({ type: types, multiple: true, copyToCacheDirectory: true });
    if (res.canceled) return [];
    return (res.assets ?? []).filter((a) => !!a.uri).map((a) => toPicked(a, "document"));
  } catch {
    Alert.alert("Couldn't open files", "We couldn't open the file picker. Please try again.");
    return [];
  }
}

async function fromCamera(): Promise<PickedFile[]> {
  try {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (perm.status !== "granted") {
      Alert.alert("Camera permission needed", "Allow camera access in Settings to take a photo.");
      return [];
    }
    const res = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 0.7 });
    if (res.canceled) return [];
    return res.assets.map((a) => toPicked({ uri: a.uri, name: a.fileName, size: a.fileSize, mimeType: a.mimeType }, "photo"));
  } catch {
    Alert.alert("Couldn't open the camera", "Please try again.");
    return [];
  }
}

async function fromLibrary(limit: number): Promise<PickedFile[]> {
  try {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: limit > 1,
      selectionLimit: limit,
      allowsEditing: false,
      quality: 0.7,
    });
    if (res.canceled) return [];
    return res.assets.map((a) => toPicked({ uri: a.uri, name: a.fileName, size: a.fileSize, mimeType: a.mimeType }, "photo"));
  } catch {
    Alert.alert("Couldn't open your photos", "Please try again.");
    return [];
  }
}

/**
 * The alert must finish dismissing before the picker presents — on iOS a
 * picker launched mid-dismiss (inside a Modal) can be silently dropped.
 */
const afterAlert = <T,>(fn: () => Promise<T>) => new Promise<T>((r) => setTimeout(() => void fn().then(r), 350));

/** Ask camera vs. library, then pick. Resolves [] when cancelled. */
export function pickPhotos(limit = 8): Promise<PickedFile[]> {
  return new Promise((resolve) => {
    Alert.alert(
      "Add a photo",
      undefined,
      [
        { text: "Take photo", onPress: () => void afterAlert(fromCamera).then(resolve) },
        { text: "Choose from library", onPress: () => void afterAlert(() => fromLibrary(limit)).then(resolve) },
        { text: "Cancel", style: "cancel", onPress: () => resolve([]) },
      ],
      { cancelable: true, onDismiss: () => resolve([]) },
    );
  });
}
