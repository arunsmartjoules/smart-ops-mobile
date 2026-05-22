import { useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import VersionGateService, {
  type VersionGateState,
} from "@/services/VersionGateService";

/**
 * Full-screen, non-dismissible "update required" gate.
 *
 * Renders nothing until the backend version gate blocks this build, then
 * covers the entire app — there is no way past it except updating. Mounted
 * once near the root (see app/_layout.tsx).
 */
export default function UpdateRequiredScreen() {
  const [state, setState] = useState<VersionGateState>({ blocked: false });

  useEffect(() => {
    return VersionGateService.subscribe(setState);
  }, []);

  if (!state.blocked) return null;

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
          {state.message ||
            "A newer version of JouleOps is required to continue."}
        </Text>

        <TouchableOpacity
          style={styles.button}
          onPress={() => VersionGateService.openStore()}
          activeOpacity={0.85}
        >
          <Text style={styles.buttonText}>Update Now</Text>
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
    marginBottom: 32,
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
