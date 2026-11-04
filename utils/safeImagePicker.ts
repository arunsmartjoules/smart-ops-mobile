import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";
import { Image, type ImageRef } from "expo-image";
import {
  ImageManipulator,
  SaveFormat,
  type ImageRef as ManipulatedImageRef,
} from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import logger from "@/utils/logger";

/**
 * Drop-in replacements for `ImagePicker.launchCameraAsync` /
 * `launchImageLibraryAsync` that don't crash high-megapixel Android phones.
 *
 * On Android, any `quality` below 1 makes expo-image-picker decode the WHOLE
 * photo into one ARGB bitmap to re-compress it (CompressionImageExporter) —
 * 200–430 MB for a 50/108 MP shot. That out-of-memory kill is the "app
 * restarts after I tap ✓ on the camera" report (Nov 2026). So on Android we
 * pick at quality 1 (a plain file copy, no decode), then downscale through
 * expo-image, whose Glide decode subsamples to the target size instead of
 * holding the full frame. iOS is untouched: it never had the problem.
 *
 * The camera is a separate app, so Android may also kill JouleOps while it is
 * in front. Pass `pending` to persist what the shot was for; after the restart
 * the owning screen calls `takePendingCapture` to get the photo back.
 */

/** Longest edge, in px, a picked photo is scaled down to on Android. */
export const MAX_PHOTO_EDGE = 2560;

/** Re-encode quality used when the caller didn't specify one. */
const DEFAULT_QUALITY = 0.7;

/** A pending record older than this belongs to an abandoned capture. */
const PENDING_TTL_MS = 30 * 60 * 1000;

const PENDING_KEY = "pending_camera_capture_v1";

export type PendingCapture = {
  /** Which screen/flow owns the shot, e.g. "pm_start_before". */
  owner: string;
  /** What the owner needs to put the photo back where it belongs. */
  payload: Record<string, string>;
};

type StoredPendingCapture = PendingCapture & {
  quality: number;
  savedAt: number;
};

type ImagePickerAsset = ImagePicker.ImagePickerAsset;

const isAndroid = () => Platform.OS === "android";

const saveFormatFor = (mimeType?: string | null) => {
  if (mimeType === "image/png") return SaveFormat.PNG;
  if (mimeType === "image/webp") return SaveFormat.WEBP;
  return SaveFormat.JPEG;
};

const MIME_BY_FORMAT: Record<SaveFormat, string> = {
  [SaveFormat.JPEG]: "image/jpeg",
  [SaveFormat.PNG]: "image/png",
  [SaveFormat.WEBP]: "image/webp",
};

const withExtension = (name: string | null | undefined, format: SaveFormat) =>
  name ? name.replace(/\.[^./]+$/, "") + "." + format : name;

const releaseQuietly = (ref: { release?: () => void } | null) => {
  try {
    ref?.release?.();
  } catch {
    // already released — nothing to free
  }
};

/**
 * Scale one picked image to MAX_PHOTO_EDGE and re-encode it at `quality`.
 * Any failure returns the asset untouched: a full-size upload beats a lost
 * evidence photo.
 */
async function downscaleAsset(
  asset: ImagePickerAsset,
  quality: number,
): Promise<ImagePickerAsset> {
  if (asset.type && asset.type !== "image") return asset;
  let loaded: ImageRef | null = null;
  let rendered: ManipulatedImageRef | null = null;
  try {
    loaded = await Image.loadAsync(asset.uri, {
      maxWidth: MAX_PHOTO_EDGE,
      maxHeight: MAX_PHOTO_EDGE,
    });
    rendered = await ImageManipulator.manipulate(loaded).renderAsync();
    const format = saveFormatFor(asset.mimeType);
    const saved = await rendered.saveAsync({ compress: quality, format });
    // The picker's full-size copy lives in our cache and is now dead weight
    // (10–20 MB each on these phones).
    FileSystem.deleteAsync(asset.uri, { idempotent: true }).catch(() => {});
    return {
      ...asset,
      uri: saved.uri,
      width: saved.width,
      height: saved.height,
      mimeType: MIME_BY_FORMAT[format],
      fileName: withExtension(asset.fileName, format),
      fileSize: undefined,
    };
  } catch (error) {
    logger.warn("Photo downscale failed; keeping the original", {
      module: "SAFE_IMAGE_PICKER",
      error: error instanceof Error ? error.message : String(error),
    });
    return asset;
  } finally {
    releaseQuietly(rendered);
    releaseQuietly(loaded);
  }
}

async function downscaleResult(
  result: ImagePicker.ImagePickerResult,
  quality: number,
): Promise<ImagePicker.ImagePickerResult> {
  if (result.canceled) return result;
  // One at a time: decoding several photos in parallel is what we're avoiding.
  const assets: ImagePickerAsset[] = [];
  for (const asset of result.assets) {
    assets.push(await downscaleAsset(asset, quality));
  }
  return { ...result, assets };
}

async function launchSafely(
  launch: (
    options: ImagePicker.ImagePickerOptions,
  ) => Promise<ImagePicker.ImagePickerResult>,
  options: ImagePicker.ImagePickerOptions,
  pending?: PendingCapture,
): Promise<ImagePicker.ImagePickerResult> {
  if (!isAndroid()) return launch(options);

  const quality = options.quality ?? DEFAULT_QUALITY;
  if (pending) {
    const stored: StoredPendingCapture = {
      ...pending,
      quality,
      savedAt: Date.now(),
    };
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(stored));
  }
  let result: ImagePicker.ImagePickerResult;
  try {
    result = await launch({ ...options, quality: 1 });
  } finally {
    // Reaching here means the app survived the picker; nothing to recover.
    if (pending) await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  }
  return downscaleResult(result, quality);
}

export function launchCameraSafe(
  options: ImagePicker.ImagePickerOptions = {},
  pending?: PendingCapture,
): Promise<ImagePicker.ImagePickerResult> {
  return launchSafely(ImagePicker.launchCameraAsync, options, pending);
}

export function launchImageLibrarySafe(
  options: ImagePicker.ImagePickerOptions = {},
  pending?: PendingCapture,
): Promise<ImagePicker.ImagePickerResult> {
  return launchSafely(ImagePicker.launchImageLibraryAsync, options, pending);
}

/**
 * After Android killed the app while the camera was open, hand the photo back
 * to the screen that asked for it. Returns null when there is nothing for
 * `owner`; another owner's record is left alone for that owner to claim.
 */
export async function takePendingCapture(
  owner: string,
): Promise<{ payload: Record<string, string>; uri: string } | null> {
  if (!isAndroid()) return null;
  let stored: StoredPendingCapture | null = null;
  try {
    const raw = await AsyncStorage.getItem(PENDING_KEY);
    stored = raw ? (JSON.parse(raw) as StoredPendingCapture) : null;
  } catch {
    stored = null;
  }
  if (!stored) return null;
  if (Date.now() - stored.savedAt > PENDING_TTL_MS) {
    await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
    return null;
  }
  if (stored.owner !== owner) return null;

  await AsyncStorage.removeItem(PENDING_KEY).catch(() => {});
  try {
    const result = await ImagePicker.getPendingResultAsync();
    // null = nothing pending; a `code` field = ImagePickerErrorResult.
    if (!result || "code" in result || result.canceled) return null;
    const recovered = await downscaleResult(result, stored.quality);
    const uri = !recovered.canceled ? recovered.assets[0]?.uri : undefined;
    if (!uri) return null;
    logger.info("Recovered a photo taken before the app was restarted", {
      module: "SAFE_IMAGE_PICKER",
      owner,
    });
    return { payload: stored.payload, uri };
  } catch (error) {
    logger.warn("Pending photo recovery failed", {
      module: "SAFE_IMAGE_PICKER",
      owner,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
