import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import ServerStatusService, {
  type ServerStatusState,
} from "@/services/ServerStatusService";
import VersionGateService from "@/services/VersionGateService";

/**
 * Renders the two backend-trouble states:
 *
 *  - Maintenance mode  → full-screen blocking notice.
 *  - Server unreachable (device online, backend down) → non-blocking top
 *    banner; the app stays usable offline.
 *
 * While either is showing it polls the backend so the screen clears itself
 * once maintenance ends or the server recovers. Mounted once near the root
 * (see app/_layout.tsx).
 */
export default function ServerStatusOverlay() {
  const [status, setStatus] = useState<ServerStatusState>(
    ServerStatusService.current,
  );

  useEffect(() => ServerStatusService.subscribe(setStatus), []);

  const inMaintenance = status.maintenance.active;
  // Only a "real" outage — the device has internet but the backend is down.
  const serverDown = status.serverDown && status.deviceOnline;

  // Re-check the backend on an interval while something is wrong, so the
  // notice disappears on its own when things recover.
  useEffect(() => {
    if (!inMaintenance && !serverDown) return;
    const id = setInterval(() => {
      VersionGateService.check();
    }, 20000);
    return () => clearInterval(id);
  }, [inMaintenance, serverDown]);

  if (inMaintenance) {
    return <MaintenanceModal message={status.maintenance.message} />;
  }
  if (serverDown) {
    return <ServerDownBanner />;
  }
  return null;
}

function MaintenanceModal({ message }: { message: string }) {
  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Blocking notice — back button must not dismiss. */
      }}
    >
      <View style={styles.maintContainer}>
        <View style={styles.maintIconCircle}>
          <Text style={styles.maintIcon}>🔧</Text>
        </View>
        <Text style={styles.maintTitle}>Under Maintenance</Text>
        <Text style={styles.maintMessage}>
          {message ||
            "JouleOps is temporarily down for maintenance. Please try again shortly."}
        </Text>
        <TouchableOpacity
          style={styles.maintButton}
          onPress={() => VersionGateService.check()}
          activeOpacity={0.85}
        >
          <Text style={styles.maintButtonText}>Check Again</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

function ServerDownBanner() {
  return (
    <SafeAreaView edges={["top"]} style={styles.bannerSafe}>
      <View style={styles.bannerContent}>
        <Text style={styles.bannerText}>
          Server unavailable — working offline. Your changes are saved and will
          sync when it&apos;s back.
        </Text>
        <TouchableOpacity
          onPress={() => VersionGateService.check()}
          style={styles.bannerButton}
        >
          <Text style={styles.bannerButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Maintenance modal
  maintContainer: {
    flex: 1,
    backgroundColor: "#0f172a",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  maintIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(245,158,11,0.18)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  maintIcon: {
    fontSize: 40,
  },
  maintTitle: {
    color: "white",
    fontSize: 26,
    fontWeight: "800",
    marginBottom: 12,
    textAlign: "center",
  },
  maintMessage: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 32,
  },
  maintButton: {
    backgroundColor: "#f59e0b",
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 14,
  },
  maintButtonText: {
    color: "#0f172a",
    fontSize: 16,
    fontWeight: "800",
  },
  // Server-down banner
  bannerSafe: {
    width: "100%",
    backgroundColor: "#475569",
  },
  bannerContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  bannerText: {
    flex: 1,
    color: "white",
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  bannerButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 10,
  },
  bannerButtonText: {
    color: "white",
    fontSize: 11,
    fontWeight: "800",
  },
});
