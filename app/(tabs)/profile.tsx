/**
 * Profile — Claude Design "JouleOps Profile.dc.html".
 *
 * Thunder header (identity + status) over a light body of grouped cards:
 * a read-only detail block, an "Account" group, an "App" group, then the
 * sign-out button and the account-deletion link.
 *
 * Geometry and colour are the artboard's, verbatim; brand values resolve
 * through the shared `@/constants/ds` token set. The literals in `MOCK` are
 * one-off tints the artboard uses that have no design-system token.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { format } from "date-fns";
import {
  ArrowUpCircle,
  Bell,
  Building2,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  CloudUpload,
  Info,
  LogOut,
  Mail,
  MessageSquareWarning,
  Monitor,
  Moon,
  Pencil,
  Shield,
  Sun,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import UpdateService from "@/services/UpdateService";
import { StorageService } from "@/services/StorageService";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import { APP_VERSION_DISPLAY } from "@/constants/version";
import { ds } from "@/constants/ds";

/** Corner scale read off the artboard. */
const radius = {
  header: 26,
  card: 18,
  button: 14,
  tile: 99,
  badge: 5,
} as const;

/** Mock-only tints (no design-system token exists for these). */
const MOCK = {
  /** Hairline between rows inside a card. */
  divider: "#F0EFEF",
  /** Sign-out button outline — a flame wash lighter than flame-800. */
  signOutBorder: "#F6DAD3",
  /** "On-site" presence dot and its label, on the sky-tinted pill. */
  presenceDot: "#6FD3A8",
  presenceText: "#A9E3CC",
  presenceFill: "rgba(40,147,157,0.28)",
  /** Translucent header affordance + its bullet separator. */
  headerTile: "rgba(255,255,255,0.10)",
  headerBullet: "rgba(142,198,202,0.6)",
  /** Underline under the delete-account link. */
  linkUnderline: "#D6D4D3",
} as const;

function formatRelativeTime(isoTimestamp: string | null): string {
  if (!isoTimestamp) return "Never synced";
  const diffMins = Math.floor(
    (Date.now() - new Date(isoTimestamp).getTime()) / 60000,
  );
  if (diffMins < 1) return "Last synced just now";
  if (diffMins < 60)
    return `Last synced ${diffMins} min${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24)
    return `Last synced ${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `Last synced ${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

/** Two-letter monogram, matching the artboard's "PG". */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/* ── Card primitives ──────────────────────────────────────────────────── */

/** One row of the read-only detail block: icon, label, right-aligned value. */
function DetailRow({
  icon: Icon,
  label,
  value,
  last,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, last && styles.rowLast]}>
      <View style={styles.detailIcon}>
        <Icon size={16} color={ds.carbon[600]} strokeWidth={1.8} />
      </View>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

/** One tappable row of the Account / App groups. */
function MenuRow({
  icon: Icon,
  label,
  subtitle,
  value,
  badge,
  badgeTone = "muted",
  busy,
  onPress,
  last,
}: {
  icon: LucideIcon;
  label: string;
  subtitle?: string;
  value?: string;
  badge?: string;
  badgeTone?: "muted" | "solid";
  busy?: boolean;
  onPress?: () => void;
  last?: boolean;
}) {
  const solid = badgeTone === "solid";
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress || busy}
      activeOpacity={0.7}
      style={[styles.menuRow, last && styles.rowLast]}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={value ? `${label}, ${value}` : label}
    >
      <Icon size={19} color={ds.carbon[400]} strokeWidth={1.8} />

      <View style={styles.menuLabelWrap}>
        <Text style={styles.menuLabel}>{label}</Text>
        {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
      </View>

      {badge ? (
        <View style={[styles.badge, solid && styles.badgeSolid]}>
          <Text style={[styles.badgeText, solid && styles.badgeTextSolid]}>
            {badge}
          </Text>
        </View>
      ) : null}

      {value ? <Text style={styles.menuValue}>{value}</Text> : null}

      {busy ? (
        <ActivityIndicator size="small" color={ds.carbon[600]} />
      ) : onPress ? (
        <ChevronRight size={18} color={ds.carbon[800]} strokeWidth={2} />
      ) : null}
    </TouchableOpacity>
  );
}

/* ── Screen ───────────────────────────────────────────────────────────── */

export default function Profile() {
  const { user, signOut, deleteAccount, refreshProfile } = useAuth();
  const { theme, setTheme } = useTheme();
  const { lastSyncedAt, pendingQueueCount } = useSyncStatus();
  const insets = useSafeAreaInsets();

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const pickAndUploadPhoto = useCallback(
    async (source: "camera" | "gallery") => {
      try {
        const permission =
          source === "camera"
            ? await ImagePicker.requestCameraPermissionsAsync()
            : await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Permission Required",
            `Please grant ${source === "camera" ? "camera" : "gallery"} access to set a profile picture.`,
          );
          return;
        }

        const result =
          source === "camera"
            ? await ImagePicker.launchCameraAsync({
                mediaTypes: "images",
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: "images",
                allowsEditing: true,
                aspect: [1, 1],
                quality: 0.6,
              });

        if (result.canceled || !result.assets?.[0]?.uri) return;

        setIsUploadingPhoto(true);
        const uri = result.assets[0].uri;
        const userKey = user?.user_id || user?.id || "unknown";
        const remotePath = `profile_photos/${userKey}/${Date.now()}.jpg`;
        const publicUrl = await StorageService.uploadFile(
          "jouleops-attachments",
          remotePath,
          uri,
        );
        if (!publicUrl) {
          Alert.alert("Upload Failed", "Could not upload the picture. Try again.");
          return;
        }

        const response = await apiFetch(
          `${API_BASE_URL}/api/auth/profile-photo`,
          {
            method: "PUT",
            body: JSON.stringify({ profile_photo_url: publicUrl }),
          },
        );
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          Alert.alert(
            "Save Failed",
            body?.error ||
              "Picture uploaded but couldn't be saved to your profile.",
          );
          return;
        }

        await refreshProfile();
      } catch (err: any) {
        Alert.alert("Error", err?.message || "Failed to update profile picture.");
      } finally {
        setIsUploadingPhoto(false);
      }
    },
    [refreshProfile, user?.id, user?.user_id],
  );

  const removePhoto = useCallback(async () => {
    try {
      setIsUploadingPhoto(true);
      const response = await apiFetch(
        `${API_BASE_URL}/api/auth/profile-photo`,
        {
          method: "PUT",
          body: JSON.stringify({ profile_photo_url: null }),
        },
      );
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        Alert.alert(
          "Remove Failed",
          body?.error || "Couldn't remove your profile picture. Try again.",
        );
        return;
      }
      await refreshProfile();
    } catch (err: any) {
      Alert.alert("Error", err?.message || "Failed to remove profile picture.");
    } finally {
      setIsUploadingPhoto(false);
    }
  }, [refreshProfile]);

  const handlePhotoPress = useCallback(() => {
    if (isUploadingPhoto) return;
    const hasPhoto = !!user?.profile_photo_url;
    const buttons: Parameters<typeof Alert.alert>[2] = [
      { text: "Take Photo", onPress: () => pickAndUploadPhoto("camera") },
      { text: "Choose from Gallery", onPress: () => pickAndUploadPhoto("gallery") },
    ];
    if (hasPhoto) {
      buttons.push({
        text: "Remove Photo",
        style: "destructive",
        onPress: () =>
          Alert.alert(
            "Remove Profile Picture?",
            "Your profile picture will be removed.",
            [
              { text: "Cancel", style: "cancel" },
              { text: "Remove", style: "destructive", onPress: removePhoto },
            ],
          ),
      });
    }
    buttons.push({ text: "Cancel", style: "cancel" });
    Alert.alert("Profile Picture", "Choose an option", buttons, {
      cancelable: true,
    });
  }, [isUploadingPhoto, pickAndUploadPhoto, removePhoto, user?.profile_photo_url]);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/dashboard");
  }, []);

  const handleLogout = useCallback(async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut();
      router.replace("/sign-in");
    } catch (err: any) {
      Alert.alert(
        "Can't sign out yet",
        err?.message ||
          "Some of your changes haven't synced. Check your connection and try again.",
      );
    } finally {
      setIsSigningOut(false);
    }
  }, [signOut, isSigningOut]);

  const performAccountDeletion = useCallback(async () => {
    if (isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      await deleteAccount();
      router.replace("/sign-in");
      Alert.alert(
        "Account Deleted",
        "Your account has been deleted and you've been signed out.",
      );
    } catch (err: any) {
      Alert.alert(
        "Couldn't Delete Account",
        err?.message ||
          "Something went wrong. Check your connection and try again.",
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }, [deleteAccount, isDeletingAccount]);

  const handleDeleteAccount = useCallback(() => {
    if (isDeletingAccount || isSigningOut) return;
    // Two-step confirmation: deletion is irreversible from the app's side.
    Alert.alert(
      "Delete My Account?",
      "Your JouleOps account will be deactivated and you'll be signed out on this device. You won't be able to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "This can't be undone",
              "Are you sure you want to permanently delete your JouleOps account?",
              [
                { text: "Keep My Account", style: "cancel" },
                {
                  text: "Delete Account",
                  style: "destructive",
                  onPress: performAccountDeletion,
                },
              ],
            ),
        },
      ],
    );
  }, [isDeletingAccount, isSigningOut, performAccountDeletion]);

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await UpdateService.checkForUpdate(false);

      if (result.status === "available") {
        setUpdateAvailable(true);
        Alert.alert(
          "Update Available",
          "A new version is available. Download and install it now?",
          [
            { text: "Later", style: "cancel" },
            {
              text: "Download & Install",
              onPress: async () => {
                const fetchRes = await UpdateService.fetchUpdate();
                if (fetchRes.success) {
                  Alert.alert(
                    "Success",
                    "Update installed. The app will now restart.",
                    [{ text: "Restart", onPress: () => UpdateService.reloadApp() }],
                  );
                } else {
                  Alert.alert(
                    "Download Failed",
                    fetchRes.error ||
                      "Could not download the update. Please try again.",
                  );
                }
              },
            },
          ],
        );
      } else if (result.status === "up-to-date") {
        Alert.alert(
          "Up to Date",
          "You are using the latest version of JouleOps.",
        );
      } else if (result.status === "unsupported") {
        Alert.alert(
          "Updates Unavailable",
          "Over-the-air updates aren't available in this build. Install the latest version from the app store.",
        );
      } else {
        Alert.alert(
          "Update Check Failed",
          result.error ||
            "Could not check for updates. Check your connection and try again.",
        );
      }
    } catch (e: any) {
      Alert.alert(
        "Update Check Failed",
        e?.message || "Something went wrong while checking for updates.",
      );
    } finally {
      setIsCheckingUpdates(false);
    }
  }, []);

  const handleCycleTheme = useCallback(() => {
    if (theme === "light") setTheme("dark");
    else if (theme === "dark") setTheme("system");
    else setTheme("light");
  }, [theme, setTheme]);

  const fullName = user?.full_name || user?.name || "Team Member";
  const joinedRaw = user?.created_at || user?.date_of_joining;
  const joined = joinedRaw
    ? format(new Date(joinedRaw as string), "MMM yyyy")
    : "—";
  const presence = user?.work_location_type;
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;

  return (
    <View style={styles.screen}>
      {/* ── Thunder header ── */}
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity
            onPress={handleBack}
            activeOpacity={0.7}
            hitSlop={6}
            style={styles.headerBack}
            accessibilityRole="button"
            accessibilityLabel="Go back"
          >
            <ChevronLeft size={24} color={ds.white} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={handlePhotoPress}
            disabled={isUploadingPhoto}
            activeOpacity={0.8}
            hitSlop={6}
            style={styles.headerTile}
            accessibilityRole="button"
            accessibilityLabel="Edit profile picture"
          >
            <Pencil size={16} color={ds.white} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <View style={styles.identityRow}>
          <TouchableOpacity
            onPress={handlePhotoPress}
            disabled={isUploadingPhoto}
            activeOpacity={0.85}
            style={styles.avatarWrap}
            accessibilityRole="button"
            accessibilityLabel="Change profile picture"
          >
            {user?.profile_photo_url ? (
              <Image
                source={{ uri: user.profile_photo_url }}
                style={styles.avatar}
              />
            ) : (
              <View style={[styles.avatar, styles.avatarFallback]}>
                <Text style={styles.avatarText}>{initialsFor(fullName)}</Text>
              </View>
            )}
            <View style={styles.avatarBadge}>
              {isUploadingPhoto ? (
                <ActivityIndicator size="small" color={ds.white} />
              ) : (
                <Camera size={11} color={ds.white} strokeWidth={2.2} />
              )}
            </View>
          </TouchableOpacity>

          <View style={styles.identityText}>
            <Text style={styles.identityName} numberOfLines={1}>
              {fullName}
            </Text>
            <View style={styles.identityMeta}>
              <Text style={styles.identityRole} numberOfLines={1}>
                {user?.designation || "Team Member"}
              </Text>
              {presence ? (
                <>
                  <View style={styles.identityBullet} />
                  <View style={styles.presencePill}>
                    <View style={styles.presenceDot} />
                    <Text style={styles.presenceLabel}>{presence}</Text>
                  </View>
                </>
              ) : null}
            </View>
          </View>
        </View>
      </View>

      {/* ── Body ── */}
      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.card, styles.detailCard]}>
          <DetailRow icon={Mail} label="Email" value={user?.email || "—"} />
          <DetailRow
            icon={Building2}
            label="Department"
            value={user?.department || "Operations"}
          />
          <DetailRow icon={Calendar} label="Joined" value={joined} last />
        </View>

        <Text style={styles.groupLabel}>Account</Text>
        <View style={styles.card}>
          <MenuRow
            icon={Bell}
            label="Notifications"
            onPress={() => router.push("/notification-settings")}
          />
          <MenuRow
            icon={Shield}
            label="Change Password"
            onPress={() => router.push("/privacy-security")}
          />
          <MenuRow
            icon={CloudUpload}
            label="Offline & Sync"
            subtitle={
              pendingQueueCount > 0
                ? formatRelativeTime(lastSyncedAt)
                : "All synced"
            }
            badge={
              pendingQueueCount > 0 ? `${pendingQueueCount} pending` : undefined
            }
            onPress={() => router.push("/app-settings")}
            last
          />
        </View>

        <Text style={styles.groupLabel}>App</Text>
        <View style={styles.card}>
          <MenuRow
            icon={ThemeIcon}
            label="Appearance"
            value={theme.charAt(0).toUpperCase() + theme.slice(1)}
            onPress={handleCycleTheme}
          />
          <MenuRow
            icon={MessageSquareWarning}
            label="Report an Issue"
            onPress={() => router.push("/report-issue")}
          />
          <MenuRow
            icon={ArrowUpCircle}
            label="Check for Updates"
            badge={updateAvailable ? "New" : undefined}
            badgeTone="solid"
            busy={isCheckingUpdates}
            onPress={handleCheckUpdates}
          />
          <MenuRow
            icon={Info}
            label="App Version"
            value={APP_VERSION_DISPLAY}
            last
          />
        </View>

        <TouchableOpacity
          onPress={handleLogout}
          disabled={isSigningOut}
          activeOpacity={0.8}
          style={[styles.signOut, isSigningOut && styles.dimmed]}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          {isSigningOut ? (
            <>
              <ActivityIndicator size="small" color={ds.flame[100]} />
              <Text style={styles.signOutLabel}>Syncing your changes…</Text>
            </>
          ) : (
            <>
              <LogOut size={18} color={ds.flame[100]} strokeWidth={2} />
              <Text style={styles.signOutLabel}>Sign Out</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Account deletion — required by the App Store review guidelines. */}
        <View style={styles.deleteWrap}>
          <TouchableOpacity
            onPress={handleDeleteAccount}
            disabled={isDeletingAccount || isSigningOut}
            activeOpacity={0.7}
            hitSlop={8}
            style={[
              styles.deleteLink,
              (isDeletingAccount || isSigningOut) && styles.dimmed,
            ]}
            accessibilityRole="link"
            accessibilityLabel="Delete my account"
          >
            {isDeletingAccount ? (
              <ActivityIndicator size="small" color={ds.carbon[600]} />
            ) : null}
            <Text style={styles.deleteLabel}>
              {isDeletingAccount ? "Deleting your account…" : "Delete my account"}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: ds.pageBg },

  /* ── Header ── */
  header: {
    backgroundColor: ds.thunder[100],
    paddingBottom: 22,
    borderBottomLeftRadius: radius.header,
    borderBottomRightRadius: radius.header,
  },
  headerBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingTop: 10,
    marginBottom: 18,
  },
  headerBack: {
    width: 34,
    height: 34,
    borderRadius: radius.tile,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 17, fontWeight: "700", color: ds.white },
  headerTile: {
    width: 34,
    height: 34,
    borderRadius: radius.tile,
    backgroundColor: MOCK.headerTile,
    alignItems: "center",
    justifyContent: "center",
  },

  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 22,
  },
  avatarWrap: { width: 62, height: 62 },
  avatar: { width: 62, height: 62, borderRadius: radius.tile },
  avatarFallback: {
    backgroundColor: ds.sky[100],
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 23, fontWeight: "700", color: ds.white },
  avatarBadge: {
    position: "absolute",
    right: -3,
    bottom: -3,
    width: 23,
    height: 23,
    borderRadius: radius.tile,
    backgroundColor: ds.flame[100],
    borderWidth: 2.5,
    borderColor: ds.thunder[100],
    alignItems: "center",
    justifyContent: "center",
  },
  identityText: { flex: 1, minWidth: 0 },
  identityName: {
    fontSize: 19,
    lineHeight: 22,
    fontWeight: "700",
    color: ds.white,
    marginBottom: 5,
  },
  identityMeta: { flexDirection: "row", alignItems: "center", gap: 7 },
  identityRole: { fontSize: 12, fontWeight: "500", color: ds.sky[500] },
  identityBullet: {
    width: 3,
    height: 3,
    borderRadius: radius.tile,
    backgroundColor: MOCK.headerBullet,
  },
  presencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.badge,
    backgroundColor: MOCK.presenceFill,
  },
  presenceDot: {
    width: 5,
    height: 5,
    borderRadius: radius.tile,
    backgroundColor: MOCK.presenceDot,
  },
  presenceLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: MOCK.presenceText,
  },

  /* ── Body ── */
  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 18, paddingTop: 16, paddingBottom: 28 },

  card: {
    backgroundColor: ds.white,
    borderRadius: radius.card,
    paddingHorizontal: 16,
    marginBottom: 18,
    shadowColor: ds.carbon[100],
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  detailCard: { paddingVertical: 4 },

  groupLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[700],
    marginHorizontal: 4,
    marginBottom: 9,
  },

  rowLast: { borderBottomWidth: 0 },

  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: MOCK.divider,
  },
  detailIcon: { width: 18, alignItems: "flex-start" },
  detailLabel: {
    width: 84,
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[700],
  },
  detailValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: "500",
    color: ds.carbon[100],
    textAlign: "right",
  },

  menuRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 15,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: MOCK.divider,
  },
  menuLabelWrap: { flex: 1, minWidth: 0 },
  menuLabel: { fontSize: 13.5, fontWeight: "500", color: ds.carbon[100] },
  menuSubtitle: {
    fontSize: 10.5,
    fontWeight: "400",
    color: ds.carbon[600],
    marginTop: 3,
  },
  menuValue: { fontSize: 10, fontWeight: "600", color: ds.carbon[500] },

  badge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.badge,
    backgroundColor: ds.flame[1000],
  },
  badgeSolid: { backgroundColor: ds.flame[100] },
  badgeText: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 0.36,
    textTransform: "uppercase",
    color: ds.flame[100],
  },
  badgeTextSolid: { color: ds.white, letterSpacing: 0.54 },

  /* ── Footer actions ── */
  signOut: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    padding: 14,
    borderRadius: radius.button,
    borderWidth: 1.5,
    borderColor: MOCK.signOutBorder,
    backgroundColor: ds.white,
    marginBottom: 12,
  },
  signOutLabel: { fontSize: 13.5, fontWeight: "700", color: ds.flame[100] },

  deleteWrap: { alignItems: "center", paddingTop: 2 },
  deleteLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingBottom: 1,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: MOCK.linkUnderline,
  },
  deleteLabel: { fontSize: 11, fontWeight: "500", color: ds.carbon[600] },

  dimmed: { opacity: 0.55 },
});
