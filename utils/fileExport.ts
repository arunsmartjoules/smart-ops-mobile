/**
 * Save a generated or downloaded file (PDF / XLSX / CSV) somewhere the user
 * can reach it — without a new native module, so it ships over the air:
 *
 *  - iOS: write to the cache, then open the share sheet with the file URL
 *    ("Save to Files", Mail, WhatsApp…).
 *  - Android 10+ on builds that include modules/jouleops-downloads: written
 *    straight into the public Downloads folder through MediaStore — no picker,
 *    no permission.
 *  - Otherwise (older binaries, Android 9 and below): a folder picked through
 *    the Storage Access Framework, remembered after the first "Use this
 *    folder". The picker opens on Documents: Android 11+ refuses to grant the
 *    Download folder itself ("Can't use this folder"). If the grant is revoked
 *    (or the folder deleted) the picker simply asks again.
 *
 * Both helpers resolve to a short human message for a toast, or throw with
 * one when the save failed. A user cancelling the folder picker resolves with
 * `null` (nothing to report).
 */
import { Platform, Share } from "react-native";
import { requireOptionalNativeModule } from "expo";
import * as FileSystem from "expo-file-system/legacy";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getValidAuthToken } from "@/services/AuthTokenManager";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION } from "@/constants/version";

function safeName(name: string) {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "_");
}

const EXPORT_DIR_KEY = "export-dir-uri:v1";

/** modules/jouleops-downloads — absent on binaries built before it existed. */
const Downloads = Platform.OS === "android"
  ? requireOptionalNativeModule<{
      saveToDownloads(sourceUri: string, fileName: string, mimeType: string): Promise<string>;
    }>("JouleOpsDownloads")
  : null;

/** "content://…/tree/primary%3ADownload" → "Download". */
function folderLabel(dirUri: string): string {
  const decoded = decodeURIComponent(dirUri);
  const tail = decoded.slice(decoded.lastIndexOf(":") + 1);
  const name = tail.split("/").filter(Boolean).pop() || "the chosen folder";
  return name === "Download" ? "Downloads" : name;
}

/** Write base64 bytes into the remembered Android folder, asking for one if needed. */
async function writeToAndroidFolder(base64: string, filename: string, mimeType: string): Promise<string | null> {
  const saf = FileSystem.StorageAccessFramework;
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;

  const tryWrite = async (dirUri: string) => {
    const target = await saf.createFileAsync(dirUri, stem, mimeType);
    await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
  };

  const saved = await AsyncStorage.getItem(EXPORT_DIR_KEY).catch(() => null);
  if (saved) {
    try {
      await tryWrite(saved);
      return `Saved to ${folderLabel(saved)} · ${filename}`;
    } catch {
      // Grant revoked or folder gone — fall through and ask again.
      await AsyncStorage.removeItem(EXPORT_DIR_KEY).catch(() => {});
    }
  }

  const perm = await saf.requestDirectoryPermissionsAsync(saf.getUriForDirectoryInRoot("Documents"));
  if (!perm.granted) return null;
  await tryWrite(perm.directoryUri);
  await AsyncStorage.setItem(EXPORT_DIR_KEY, perm.directoryUri).catch(() => {});
  return `Saved to ${folderLabel(perm.directoryUri)} · ${filename}`;
}

async function deliver(localUri: string, filename: string, mimeType: string): Promise<string | null> {
  if (Platform.OS === "ios") {
    await Share.share({ url: localUri });
    return `${filename} ready`;
  }
  if (Downloads) {
    try {
      const saved = await Downloads.saveToDownloads(localUri, filename, mimeType);
      return `Saved to Downloads · ${saved}`;
    } catch {
      // Android 9 and below, or MediaStore refused — use the folder picker.
    }
  }
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return writeToAndroidFolder(base64, filename, mimeType);
}

/** Save bytes the app built itself (XLSX / PDF), given as base64. */
export async function saveBase64File(base64: string, filename: string, mimeType: string): Promise<string | null> {
  const local = `${FileSystem.cacheDirectory}${safeName(filename)}`;
  await FileSystem.writeAsStringAsync(local, base64, { encoding: FileSystem.EncodingType.Base64 });
  return deliver(local, filename, mimeType);
}

/**
 * Download an authenticated backend file (e.g. `/api/daily-report/pdf?…`) and
 * hand it to the user. `path` is relative to API_BASE_URL.
 */
export async function saveBackendFile(
  path: string,
  filename: string,
  mimeType: string,
): Promise<string | null> {
  const token = await getValidAuthToken();
  const local = `${FileSystem.cacheDirectory}${safeName(filename)}`;
  const res = await FileSystem.downloadAsync(`${API_BASE_URL}${path}`, local, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "X-Client": "jouleops-mobile",
      "X-App-Version": APP_VERSION,
      "X-Platform": Platform.OS,
    },
  });
  if (res.status < 200 || res.status >= 300) {
    await FileSystem.deleteAsync(local, { idempotent: true }).catch(() => {});
    throw new Error(
      res.status === 403
        ? "You don't have access to this report."
        : res.status === 404
          ? "No report for this selection."
          : `Download failed (HTTP ${res.status}).`,
    );
  }
  return deliver(res.uri, filename, mimeType);
}

/** Write text the app built itself (CSV) and hand it to the user. */
export async function saveTextFile(
  content: string,
  filename: string,
  mimeType = "text/csv",
): Promise<string | null> {
  const local = `${FileSystem.cacheDirectory}${safeName(filename)}`;
  await FileSystem.writeAsStringAsync(local, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return deliver(local, filename, mimeType);
}

/** RFC 4180 CSV from rows of cells (with a UTF-8 BOM so Excel reads ₹/°C right). */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  const cell = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
}
