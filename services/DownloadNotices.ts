/**
 * Local notifications for file exports (utils/fileExport): "Downloading…"
 * while a report is fetched or written, replaced by "Downloaded · Tap to
 * open" when it lands. Tapping that one opens the file — routed through
 * utils/notificationDeepLink (`data.kind === "download"`) so it works from a
 * warm tap and from a cold start alike.
 *
 * Best effort throughout: if notifications aren't allowed, or anything here
 * fails, the export itself is unaffected (the in-app toast still reports it).
 */
import { Linking, Platform, Share } from "react-native";
import { requireOptionalNativeModule } from "expo";
import * as Notifications from "expo-notifications";
import logger from "@/utils/logger";

const PROGRESS_CHANNEL = "downloads-progress";
const DONE_CHANNEL = "downloads";

/** modules/jouleops-downloads — absent on binaries built before it existed. */
const Downloads =
  Platform.OS === "android"
    ? requireOptionalNativeModule<{ openFile(uri: string, mimeType: string): Promise<void> }>("JouleOpsDownloads")
    : null;

export interface DownloadNoticeData extends Record<string, unknown> {
  kind: "download";
  phase: "progress" | "done" | "failed";
  uri?: string;
  mimeType?: string;
  name?: string;
}

let channelsReady: Promise<void> | null = null;
function ensureChannels(): Promise<void> {
  if (Platform.OS !== "android") return Promise.resolve();
  channelsReady ??= Promise.all([
    // Silent: it's replaced a moment later.
    Notifications.setNotificationChannelAsync(PROGRESS_CHANNEL, {
      name: "Downloads in progress",
      importance: Notifications.AndroidImportance.LOW,
    }),
    Notifications.setNotificationChannelAsync(DONE_CHANNEL, {
      name: "Downloads",
      importance: Notifications.AndroidImportance.DEFAULT,
    }),
  ])
    .then(() => undefined)
    .catch(() => undefined);
  return channelsReady;
}

let askedThisSession = false;
async function allowed(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    // Ask once per session, and only if the person hasn't already said no.
    if (askedThisSession || !current.canAskAgain) return false;
    askedThisSession = true;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

const trigger = (channelId: string): Notifications.NotificationTriggerInput =>
  Platform.OS === "android" ? { channelId } : null;

/** Shows "Downloading <name>…". Resolves with its id, or null when not shown. */
export async function downloadStarted(fileName: string): Promise<string | null> {
  try {
    if (!(await allowed())) return null;
    await ensureChannels();
    const data: DownloadNoticeData = { kind: "download", phase: "progress", name: fileName };
    return await Notifications.scheduleNotificationAsync({
      content: { title: "Downloading…", body: fileName, data, sticky: true, autoDismiss: false },
      trigger: trigger(PROGRESS_CHANNEL),
    });
  } catch (error) {
    logger.warn("Download notice failed to show", { error });
    return null;
  }
}

async function replace(id: string | null, content: Notifications.NotificationContentInput, channel: string) {
  try {
    if (id) await Notifications.dismissNotificationAsync(id).catch(() => {});
    if (!id && !(await allowed())) return;
    await ensureChannels();
    await Notifications.scheduleNotificationAsync({ content, trigger: trigger(channel) });
  } catch (error) {
    logger.warn("Download notice failed to update", { error });
  }
}

/** Replaces the progress notice with "Downloaded · Tap to open". */
export function downloadFinished(
  id: string | null,
  file: { name: string; uri?: string | null; mimeType: string; where: string },
) {
  const data: DownloadNoticeData = {
    kind: "download",
    phase: "done",
    name: file.name,
    mimeType: file.mimeType,
    ...(file.uri ? { uri: file.uri } : {}),
  };
  return replace(
    id,
    {
      title: "Downloaded",
      body: file.uri ? `${file.name} · ${file.where} · Tap to open` : `${file.name} · ${file.where}`,
      data,
    },
    DONE_CHANNEL,
  );
}

/** Replaces the progress notice with a failure line. */
export function downloadFailed(id: string | null, fileName: string) {
  const data: DownloadNoticeData = { kind: "download", phase: "failed", name: fileName };
  return replace(id, { title: "Download failed", body: `${fileName} couldn't be saved. Please try again.`, data }, DONE_CHANNEL);
}

/** Removes the progress notice (e.g. the person cancelled the folder picker). */
export function downloadCancelled(id: string | null) {
  if (!id) return Promise.resolve();
  return Notifications.dismissNotificationAsync(id).catch(() => {});
}

/** Tap on a "Downloaded" notice: open the file in the phone's viewer. */
export async function openDownloadedFile(data: Record<string, unknown>) {
  const uri = typeof data.uri === "string" ? data.uri : "";
  const mimeType = typeof data.mimeType === "string" ? data.mimeType : "application/pdf";
  if (!uri) return;
  try {
    if (Platform.OS === "ios") {
      // The file lives in the app's cache; the share sheet previews and saves it.
      await Share.share({ url: uri });
    } else if (Downloads) {
      await Downloads.openFile(uri, mimeType);
    } else {
      await Linking.openURL(uri);
    }
  } catch (error) {
    logger.warn("Couldn't open downloaded file", { error });
  }
}
