import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  Platform,
} from "react-native";
import { Download } from "lucide-react-native";
import VersionGateService, {
  type VersionGateState,
} from "@/services/VersionGateService";
import UpdateService, { type UpdateState } from "@/services/UpdateService";
import StoreUpdateService, {
  type StoreUpdateState,
} from "@/services/StoreUpdateService";
import { dsRadius } from "@/constants/ds";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { GlossFill } from "@/components/jo/ui";

/**
 * Mandatory update popup — non-dismissible, covers the whole app. Mounted once
 * near the root (see app/_layout.tsx). Three triggers, highest first:
 *
 *  1. "required" — the backend version gate blocked this build (admin rule in
 *     Settings › Mobile app › Versions & Maintenance, or a 426). Tries an OTA
 *     first; when none exists the app store is the way out.
 *  2. "ota" — an OTA update was found. It downloads straight away and the
 *     user must restart onto it. Only a failed download can be put off ("Not
 *     now"), so a technician who loses signal mid-download isn't locked out;
 *     the next launch / foreground check brings the popup back.
 *  3. "store" — a newer native build is live in the Play Store / App Store
 *     (StoreUpdateService). Android runs Play's in-app update flow.
 *
 * Offline is never a block: every check that fails to reach its server leaves
 * the app usable.
 */
export default function UpdateRequiredScreen() {
  const [gate, setGate] = useState<VersionGateState>({ blocked: false });
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });
  const [store, setStore] = useState<StoreUpdateState>({ available: false });
  const [busy, setBusy] = useState(false);
  const styles = useStyles();
  const d = useDs();

  useEffect(() => {
    const unsubGate = VersionGateService.subscribe(setGate);
    const unsubUpdate = UpdateService.subscribe(setUpdate);
    const unsubStore = StoreUpdateService.subscribe(setStore);
    return () => {
      unsubGate();
      unsubUpdate();
      unsubStore();
    };
  }, []);

  // When the gate blocks, immediately look for an OTA that can resolve it.
  useEffect(() => {
    if (gate.blocked) {
      UpdateService.checkAndPrepare();
    }
  }, [gate.blocked]);

  const otaBusy =
    update.status === "checking" || update.status === "downloading";
  const otaReady = update.status === "ready";
  const otaActive =
    update.status === "downloading" || otaReady || update.status === "error";

  const mode = gate.blocked
    ? "required"
    : otaActive
      ? "ota"
      : store.available
        ? "store"
        : null;
  if (!mode) return null;

  const storeName = Platform.OS === "ios" ? "App Store" : "Play Store";

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  };

  const openStore = () => run(() => StoreUpdateService.startUpdate());

  let title: string;
  let message: string;
  let primary: { label: string; onPress: () => void } | null = null;
  let secondary: { label: string; onPress: () => void } | null = null;
  let progress: string | null = null;

  if (otaBusy && mode !== "store") {
    progress =
      update.status === "downloading"
        ? "Downloading update…"
        : "Checking for update…";
  }

  if (mode === "required") {
    title = "Update Required";
    message = otaReady
      ? "An update is ready to install. Restart now to continue."
      : gate.message ||
        "A newer version of JouleOps is required to continue.";
    if (otaReady) {
      primary = { label: "Restart Now", onPress: () => UpdateService.reloadApp() };
    } else if (!otaBusy) {
      primary = { label: `Update from ${storeName}`, onPress: openStore };
      // Picks up rule changes on the server and OTAs published since.
      secondary = {
        label: "Check Again",
        onPress: () =>
          run(async () => {
            await VersionGateService.check();
            await UpdateService.checkAndPrepare();
          }),
      };
    }
  } else if (mode === "ota") {
    title = "Update Available";
    if (update.status === "error") {
      message =
        "The update couldn't be downloaded. Check your connection and try again.";
      primary = { label: "Try Again", onPress: () => run(() => UpdateService.fetchUpdate()) };
      secondary = { label: "Not now", onPress: () => UpdateService.dismiss() };
    } else if (otaReady) {
      message =
        "A new version of JouleOps is ready. Restart the app to finish updating.";
      primary = { label: "Restart Now", onPress: () => UpdateService.reloadApp() };
    } else {
      message =
        "A new version of JouleOps is downloading. You can continue once it's installed.";
    }
  } else {
    title = "New Version Available";
    message =
      `A new version of JouleOps${store.storeVersion ? ` (${store.storeVersion})` : ""} ` +
      `is available on the ${storeName}. Update now to keep using the app.`;
    primary = { label: "Update Now", onPress: openStore };
  }

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        /* Mandatory — the back button must not dismiss. */
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <View style={styles.iconCircle}>
            <Download size={28} color={d.flame[100]} strokeWidth={2.4} />
          </View>

          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>

          {progress ? (
            <View style={styles.busyRow}>
              <ActivityIndicator color={d.flame[100]} />
              <Text style={styles.busyText}>{progress}</Text>
            </View>
          ) : null}

          {primary ? (
            <TouchableOpacity
              style={[styles.primaryButton, busy && styles.disabled]}
              onPress={primary.onPress}
              disabled={busy}
              activeOpacity={0.85}
            >
              <GlossFill color={d.flame[100]} fg={d.onAccent} radius={dsRadius.base} />
              {busy ? (
                <ActivityIndicator color={d.onAccent} />
              ) : (
                <Text style={styles.primaryButtonText}>{primary.label}</Text>
              )}
            </TouchableOpacity>
          ) : null}

          {secondary ? (
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={secondary.onPress}
              disabled={busy}
              activeOpacity={0.7}
            >
              <Text style={styles.secondaryButtonText}>{secondary.label}</Text>
            </TouchableOpacity>
          ) : null}

          <Text style={styles.version}>
            Installed version {VersionGateService.appVersion}
          </Text>
        </View>
      </View>
    </Modal>
  );
}

const useStyles = makeThemedStyles((d) => ({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(6,12,26,0.72)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: d.white,
    borderRadius: dsRadius.sheet,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: "center",
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: d.flame[900],
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  title: {
    color: d.carbon[100],
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 8,
    textAlign: "center",
  },
  message: {
    color: d.carbon[400],
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
    marginBottom: 22,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
  },
  busyText: {
    color: d.carbon[100],
    fontSize: 14,
    fontWeight: "700",
  },
  primaryButton: {
    alignSelf: "stretch",
    backgroundColor: d.flame[100],
    height: 48,
    borderRadius: dsRadius.base,
    alignItems: "center",
    justifyContent: "center",
  },
  disabled: {
    opacity: 0.7,
  },
  primaryButtonText: {
    color: d.onAccent,
    fontSize: 15,
    fontWeight: "800",
  },
  secondaryButton: {
    alignSelf: "stretch",
    height: 44,
    marginTop: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButtonText: {
    color: d.carbon[300],
    fontSize: 14,
    fontWeight: "700",
  },
  version: {
    color: d.carbon[600],
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
  },
}));
