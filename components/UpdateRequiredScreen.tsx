import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
} from "react-native";
import VersionGateService, {
  type VersionGateState,
} from "@/services/VersionGateService";
import UpdateService, { type UpdateState } from "@/services/UpdateService";

/**
 * Full-screen, non-dismissible "update required" gate.
 *
 * Renders nothing until the backend version gate blocks this build, then
 * covers the entire app. The primary action looks for an OTA update and, if
 * found, applies it in place ("Update & Restart") — no app-store trip needed.
 * "Retry" re-checks the gate, so if the rule is changed on the server the
 * block lifts itself. The app store is the last-resort fallback for old native
 * builds an OTA can't fix. Mounted once near the root (see app/_layout.tsx).
 */
export default function UpdateRequiredScreen() {
  const [gate, setGate] = useState<VersionGateState>({ blocked: false });
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const unsubGate = VersionGateService.subscribe(setGate);
    const unsubUpdate = UpdateService.subscribe(setUpdate);
    return () => {
      unsubGate();
      unsubUpdate();
    };
  }, []);

  // When the gate blocks, immediately look for an OTA that can resolve it.
  useEffect(() => {
    if (gate.blocked) {
      UpdateService.checkAndPrepare();
    }
  }, [gate.blocked]);

  if (!gate.blocked) return null;

  const otaReady = update.status === "ready";
  const otaBusy =
    update.status === "checking" || update.status === "downloading";
  const noOta = update.status === "up-to-date";

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await VersionGateService.check();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Hard block — back button must not dismiss. */
      }}
    >
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <Text style={styles.iconText}>↑</Text>
        </View>

        <Text style={styles.title}>Update Required</Text>

        <Text style={styles.message}>
          {otaReady
            ? "An update is ready to install. Restart now to continue."
            : gate.message ||
              "A newer version of JouleOps is required to continue."}
        </Text>

        {/* Primary action — fetch & apply an OTA update. */}
        {otaBusy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="white" />
            <Text style={styles.busyText}>
              {update.status === "downloading"
                ? "Downloading update…"
                : "Checking for update…"}
            </Text>
          </View>
        ) : otaReady ? (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => {
              if (update.status === "ready") update.restart();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Update &amp; Restart</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => UpdateService.checkAndPrepare()}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryButtonText}>Check for Update</Text>
          </TouchableOpacity>
        )}

        {noOta && (
          <Text style={styles.hint}>
            No new update found yet — try again in a moment.
          </Text>
        )}

        {/* Retry the gate — picks up rule changes made on the server. */}
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={handleRetry}
          disabled={retrying}
          activeOpacity={0.8}
        >
          {retrying ? (
            <ActivityIndicator color="white" size="small" />
          ) : (
            <Text style={styles.secondaryButtonText}>Retry</Text>
          )}
        </TouchableOpacity>

        {/* Last-resort fallback for old native builds an OTA can't fix. */}
        <TouchableOpacity
          onPress={() => VersionGateService.openStore()}
          activeOpacity={0.7}
        >
          <Text style={styles.storeLink}>Open the app store instead</Text>
        </TouchableOpacity>

        <Text style={styles.version}>
          Installed version {VersionGateService.appVersion}
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#b91c1c",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  iconText: {
    color: "white",
    fontSize: 44,
    fontWeight: "900",
    lineHeight: 48,
  },
  title: {
    color: "white",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  message: {
    color: "rgba(255,255,255,0.9)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 28,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    height: 48,
  },
  busyText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  primaryButton: {
    backgroundColor: "white",
    paddingHorizontal: 40,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryButtonText: {
    color: "#b91c1c",
    fontSize: 16,
    fontWeight: "800",
  },
  hint: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
    textAlign: "center",
  },
  secondaryButton: {
    marginTop: 14,
    paddingHorizontal: 36,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.6)",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 140,
  },
  secondaryButtonText: {
    color: "white",
    fontSize: 15,
    fontWeight: "800",
  },
  storeLink: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
    textDecorationLine: "underline",
    marginTop: 18,
  },
  version: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 18,
  },
});
