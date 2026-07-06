import { useCallback, useEffect, useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  AppState,
  Linking,
} from "react-native";
import { BellRing } from "lucide-react-native";
import { useAuth } from "@/contexts/AuthContext";
import {
  getNotificationPermissionStatus,
  requestNotificationPermissions,
  registerForPushNotifications,
} from "@/services/NotificationService";

/**
 * Full-screen, non-dismissible gate that blocks NON-ADMIN users from using the
 * app until OS-level notification permission is granted.
 *
 * Ticket / SLA alerts are operationally mandatory for field staff, so a
 * technician who has denied notifications must not be able to proceed. Admins
 * and superadmins are exempt — they manage their own categories from
 * notification-settings.tsx (the same "Always On for non-admins" rule).
 *
 * Mounted once near the root, inside AuthGuard, so it only ever shows for a
 * signed-in, email-verified user. Placed before <UpdateRequiredScreen /> so the
 * force-update gate wins when both would block.
 */
export default function NotificationGate() {
  const { user, token, isLoading, isEmailVerified } = useAuth();
  const userId = user?.user_id;

  const isAdmin =
    !!user?.is_superadmin ||
    ["admin", "superadmin"].includes((user?.role || "").toLowerCase());

  // null = not checked yet; true/false = latest known OS permission state.
  const [granted, setGranted] = useState<boolean | null>(null);
  // Simulators / emulators can't receive push — never block there.
  const [applicable, setApplicable] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const check = useCallback(async () => {
    const permission = await getNotificationPermissionStatus();
    setApplicable(permission.isPhysicalDevice);
    setGranted(permission.granted);
  }, []);

  // Check once auth resolves, then re-check on every foreground — the user may
  // flip the OS toggle in Settings and return, and the block should lift itself.
  useEffect(() => {
    if (isLoading || !userId) return;
    check();
    const sub = AppState.addEventListener("change", (next) => {
      if (next === "active") check();
    });
    return () => sub.remove();
  }, [isLoading, userId, check]);

  const handleEnable = useCallback(async () => {
    setRequesting(true);
    try {
      const ok = await requestNotificationPermissions();
      setGranted(ok);

      if (ok) {
        // Register the push token now instead of waiting for the next relaunch
        // or network reconnect, so alerts start flowing immediately.
        if (userId && token) {
          registerForPushNotifications(userId, token).catch(() => {});
        }
        return;
      }

      // Permission still denied. If the OS will no longer show its prompt, the
      // only path left is the app's system settings screen.
      const status = await getNotificationPermissionStatus();
      if (!status.canAskAgain) {
        await Linking.openSettings();
      }
    } finally {
      setRequesting(false);
    }
  }, [token, userId]);

  const shouldBlock =
    !isLoading &&
    !!userId &&
    isEmailVerified &&
    !isAdmin &&
    applicable &&
    granted === false;

  if (!shouldBlock) return null;

  return (
    <Modal
      visible
      animationType="fade"
      presentationStyle="fullScreen"
      onRequestClose={() => {
        /* Hard block — the back button must not dismiss it. */
      }}
    >
      <View style={styles.container}>
        <View style={styles.iconCircle}>
          <BellRing size={44} color="white" strokeWidth={2.2} />
        </View>

        <Text style={styles.title}>Notifications Required</Text>

        <Text style={styles.message}>
          JouleOps needs notifications turned on so you never miss a new ticket
          or SLA reminder at your site. Please enable notifications to continue.
        </Text>

        <TouchableOpacity
          style={styles.primaryButton}
          onPress={handleEnable}
          disabled={requesting}
          activeOpacity={0.85}
        >
          {requesting ? (
            <ActivityIndicator color="#b91c1c" />
          ) : (
            <Text style={styles.primaryButtonText}>Enable Notifications</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => Linking.openSettings()}
          activeOpacity={0.7}
        >
          <Text style={styles.settingsLink}>Open device settings instead</Text>
        </TouchableOpacity>

        <Text style={styles.hint}>
          This screen closes automatically once notifications are enabled.
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
  primaryButton: {
    backgroundColor: "white",
    paddingHorizontal: 40,
    height: 48,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 220,
  },
  primaryButtonText: {
    color: "#b91c1c",
    fontSize: 16,
    fontWeight: "800",
  },
  settingsLink: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 14,
    fontWeight: "700",
    textDecorationLine: "underline",
    marginTop: 20,
  },
  hint: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 24,
    textAlign: "center",
  },
});
