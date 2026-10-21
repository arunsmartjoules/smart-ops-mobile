/**
 * Save a generated or downloaded file (PDF / XLSX / CSV) somewhere the user
 * can reach it — without a new native module, so it ships over the air:
 *
 *  - iOS: write to the cache, then open the share sheet with the file URL
 *    ("Save to Files", Mail, WhatsApp…).
 *  - Android: the share sheet only carries text, so ask for a folder via the
 *    Storage Access Framework once per save and write the file into it.
 *
 * Both helpers resolve to a short human message for a toast, or throw with
 * one when the save failed. A user cancelling the folder picker resolves with
 * `null` (nothing to report).
 */
import { Platform, Share } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { getValidAuthToken } from "@/services/AuthTokenManager";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION } from "@/constants/version";

function safeName(name: string) {
  return name.replace(/[^A-Za-z0-9._ -]/g, "_").replace(/\s+/g, "_");
}

async function deliver(localUri: string, filename: string, mimeType: string): Promise<string | null> {
  if (Platform.OS === "ios") {
    await Share.share({ url: localUri });
    return `${filename} ready`;
  }
  const saf = FileSystem.StorageAccessFramework;
  const perm = await saf.requestDirectoryPermissionsAsync();
  if (!perm.granted) return null;
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const target = await saf.createFileAsync(perm.directoryUri, stem, mimeType);
  await FileSystem.writeAsStringAsync(target, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return `Saved ${filename}`;
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
