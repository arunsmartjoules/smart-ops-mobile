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
 * covers the entire app. If an OTA update can fix the block it offers an
 * in-place "Update & Restart" — the fast path that resolves most version
 * blocks without a trip to the app store. Only when no OTA is available does
 * it fall back to the store. Mounted once near the root (see app/_layout.tsx).
 */
export default function UpdateRequiredScreen() {
  const [gate, setGate] = useState<VersionGateState>({ blocked: false });
  const [update, setUpdate] = useState<UpdateState>({ status: "idle" });

  useEffect(() => {
    const unsubGate = VersionGateService.subscribe(setGate);
    const unsubUpdate = UpdateService.subscribe(setUpdate);
    return () => {
      unsubGate();
      unsubUpdate();
    };
  }, []);

  // When the gate blocks, look for an OTA that can resolve it in place.
  useEffect(() => {
    if (gate.blocked) {
      UpdateService.checkAndPrepare();
    }
  }, [gate.blocked]);

  if (!gate.blocked) return null;

  const otaReady = update.status === "ready";
  const otaBusy =
    update.status === "checking" || update.status === "downloading";

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

        {otaBusy ? (
          <View style={styles.busyRow}>
            <ActivityIndicator color="white" />
            <Text style={styles.busyText}>Preparing update…</Text>
          </View>
        ) : otaReady ? (
          <TouchableOpacity
            style={styles.button}
            onPress={() => {
              if (update.status === "ready") update.restart();
            }}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Update &amp; Restart</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.button}
            onPress={() => VersionGateService.openStore()}
            activeOpacity={0.85}
          >
            <Text style={styles.buttonText}>Update Now</Text>
          </TouchableOpacity>
        )}

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
    marginBottom: 32,
  },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 14,
  },
  busyText: {
    color: "white",
    fontSize: 15,
    fontWeight: "700",
  },
  button: {
    backgroundColor: "white",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
  },
  buttonText: {
    color: "#b91c1c",
    fontSize: 16,
    fontWeight: "800",
  },
  version: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 20,
  },
});
