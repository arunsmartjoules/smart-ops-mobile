import {
  View,
  Text,
  TouchableOpacity,
  Animated,
  StyleSheet,
} from "react-native";
import { useState, useRef, useEffect } from "react";
import { SafeAreaView } from "react-native-safe-area-context";
import UpdateService, { type UpdateState } from "@/services/UpdateService";

/**
 * A top banner that shows OTA update progress.
 * Renders nothing when idle.
 */
export default function UpdateBanner() {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const pulseAnim = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const unsubscribe = UpdateService.subscribe(setState);
    return () => {
      unsubscribe();
    };
  }, []);

  if (state.status === "idle") return null;

  const config = getConfig(state);

  return (
    <SafeAreaView
      edges={["top"]}
      style={[
        styles.container,
        { backgroundColor: config.bg },
      ]}
    >
      {(state.status === "downloading" || state.status === "checking") && (
        <Animated.View
          style={[
            styles.progressBar,
            { opacity: pulseAnim, backgroundColor: config.accent },
          ]}
        />
      )}
      <View style={styles.content}>
        <Text style={styles.text}>{config.text}</Text>
        {state.status === "ready" && (
          <TouchableOpacity
            onPress={() => state.restart()}
            style={styles.button}
          >
            <Text style={styles.buttonText}>Restart Now</Text>
          </TouchableOpacity>
        )}
        {(state.status === "error" || state.status === "up-to-date") && (
          <TouchableOpacity
            onPress={() => UpdateService.dismiss()}
            style={styles.dismissButton}
          >
            <Text style={styles.dismissText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    </SafeAreaView>
  );
}

function getConfig(state: UpdateState) {
  switch (state.status) {
    case "checking":
      return {
        bg: "#e11d48",
        accent: "#f43f5e",
        text: "Checking for updates...",
      };
    case "downloading":
      return {
        bg: "#e11d48",
        accent: "#f43f5e",
        text: "Downloading update...",
      };
    case "ready":
      return { bg: "#e11d48", accent: "#f43f5e", text: "Update ready!" };
    case "error":
      return { bg: "#991b1b", accent: "#ef4444", text: `Update failed` };
    case "up-to-date":
      return { bg: "#e11d48", accent: "#f43f5e", text: "App is up to date ✓" };
    default:
      return { bg: "transparent", accent: "transparent", text: "" };
  }
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
  },
  progressBar: {
    height: 3,
    width: "100%",
  },
  content: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  text: {
    color: "white",
    fontSize: 12,
    fontWeight: "700",
  },
  button: {
    marginLeft: 12,
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  buttonText: {
    color: "white",
    fontSize: 11,
    fontWeight: "800",
  },
  dismissButton: {
    marginLeft: 12,
    padding: 2,
  },
  dismissText: {
    color: "rgba(255,255,255,0.7)",
    fontSize: 14,
    fontWeight: "700",
  },
});
