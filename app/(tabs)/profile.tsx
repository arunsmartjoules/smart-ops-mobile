/**
 * Settings (bottom tab) — adapted from the Profile screen of Claude Design
 * "JouleOps App.dc.html" (`r_profile`). Account details (identity card,
 * profile photo, Change Password, account deletion) live on their own
 * Account Settings screen (app/account.tsx), reached from the first row here.
 * Below that: a "Modules" group for Attendance and Alerts (no bottom tab),
 * the "App" group, Legal and Sign Out. Colours come from the JouleOps app
 * theme (constants/jo.ts) so the accent follows the user's Appearance choice.
 */
import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Text, View } from "react-native";
import * as WebBrowser from "expo-web-browser";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import {
  ArrowUpCircle,
  Bell,
  CloudUpload,
  FileText,
  Info,
  LogOut,
  Monitor,
  Moon,
  ScrollText,
  Sun,
} from "@/components/jo/bxIcons";

import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import UpdateService from "@/services/UpdateService";
import StoreUpdateService from "@/services/StoreUpdateService";
import { APP_VERSION_DISPLAY } from "@/constants/version";
import { PRIVACY_POLICY_URL, TERMS_URL } from "@/constants/legal";
import { accentDef } from "@/constants/jo";
import {
  Card,
  JoPage,
  ListRow,
  SecondaryButton,
  SectionCaption,
  f,
} from "@/components/jo/ui";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";
import { useNavInsets } from "@/components/jo/navInsets";
import { SETTINGS_MODULES } from "@/components/jo/modules";
import { usePermissions } from "@/contexts/PermissionsContext";

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

export default function Profile() {
  const styles = useStyles();
  const t = useJoTheme();
  const { clearance } = useNavInsets();
  const { canView } = usePermissions();
  // Screens without a bottom tab of their own live here.
  const moduleLinks = SETTINGS_MODULES.filter((m) => !m.perm || canView(m.perm));
  const { user, signOut } = useAuth();
  const { theme, accent } = useTheme();
  const { lastSyncedAt, pendingQueueCount } = useSyncStatus();

  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  const handleCheckUpdates = useCallback(async () => {
    setIsCheckingUpdates(true);
    try {
      const result = await UpdateService.checkForUpdate(false);

      // Either kind of update is mandatory — the update popup
      // (UpdateRequiredScreen) takes over from here.
      if (result.status === "available") {
        setUpdateAvailable(true);
        UpdateService.fetchUpdate();
        return;
      }
      if (await StoreUpdateService.check(true)) {
        setUpdateAvailable(true);
        return;
      }

      if (result.status === "up-to-date") {
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

  const openLink = useCallback(async (url: string) => {
    try {
      await WebBrowser.openBrowserAsync(url);
    } catch {
      Alert.alert("Couldn't open link", "Please try again.");
    }
  }, []);

  const fullName = user?.full_name || user?.name || "Team Member";
  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Monitor;
  const appearanceValue = `${theme.charAt(0).toUpperCase() + theme.slice(1)} · ${accentDef(accent).label}`;

  return (
    <JoPage>
      {/* Pinned title — the groups scroll underneath it. */}
      <View style={styles.top}>
        <Text style={[f.d(28, -0.025), styles.title]}>Settings</Text>
      </View>

      <View style={{ flex: 1 }}>
      <LinearGradient pointerEvents="none" colors={[t.page, `${t.page}00`]} style={styles.fade} />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: clearance }]} showsVerticalScrollIndicator={false}>

        <SectionCaption>Account</SectionCaption>
        <Card style={styles.group}>
          <ListRow
            icon="bx-user-circle"
            iconColor={t.accentInk}
            label="Account Settings"
            sub={fullName}
            onPress={() => router.push("/account")}
          />
          <ListRow
            icon={Bell}
            iconColor={t.accentInk}
            label="Notifications"
            divider
            onPress={() => router.push("/notification-settings")}
          />
          <ListRow
            icon={CloudUpload}
            iconColor={t.accentInk}
            label="Offline & Sync"
            sub={pendingQueueCount > 0 ? formatRelativeTime(lastSyncedAt) : "All synced"}
            badge={pendingQueueCount > 0 ? `${pendingQueueCount} pending` : undefined}
            divider
            onPress={() => router.push("/app-settings")}
          />
        </Card>

        {moduleLinks.length > 0 ? (
          <>
            <SectionCaption>Modules</SectionCaption>
            <Card style={styles.group}>
              {moduleLinks.map((m, i) => (
                <ListRow
                  key={m.key}
                  icon={m.icon}
                  iconColor={t.accentInk}
                  label={m.label}
                  sub={m.sub}
                  divider={i > 0}
                  onPress={() => router.push(m.href as any)}
                />
              ))}
            </Card>
          </>
        ) : null}

        <SectionCaption>App</SectionCaption>
        <Card style={styles.group}>
          <ListRow
            icon={ThemeIcon}
            label="Appearance"
            badge="New"
            badgeTone="accent"
            value={appearanceValue}
            onPress={() => router.push("/appearance")}
          />
          <ListRow
            icon="bx-bug"
            label="Report an Issue"
            divider
            onPress={() => router.push("/report-issue")}
          />
          {isCheckingUpdates ? (
            <View style={[styles.busyRow, { borderTopColor: t.line }]}>
              <ActivityIndicator size="small" color={t.muted} />
              <Text style={[f.t(14, 500), { color: t.ink }]}>Checking for updates…</Text>
            </View>
          ) : (
            <ListRow
              icon={ArrowUpCircle}
              label="Check for Updates"
              badge={updateAvailable ? "New" : undefined}
              badgeTone="accent"
              divider
              onPress={handleCheckUpdates}
            />
          )}
          <ListRow icon={Info} label="App Version" value={APP_VERSION_DISPLAY} chevron={false} divider />
        </Card>

        <SectionCaption>Legal</SectionCaption>
        <Card style={styles.group}>
          <ListRow icon={FileText} label="Privacy Policy" onPress={() => openLink(PRIVACY_POLICY_URL)} />
          <ListRow icon={ScrollText} label="Terms of Service" divider onPress={() => openLink(TERMS_URL)} />
        </Card>

        <SecondaryButton
          label={isSigningOut ? "Syncing your changes…" : "Sign Out"}
          icon={LogOut}
          tone="bad"
          busy={isSigningOut}
          onPress={handleLogout}
          style={{ marginTop: 16 }}
        />
      </ScrollView>
      </View>
    </JoPage>
  );
}

const useStyles = makeJoStyles((t) => ({
  top: { paddingHorizontal: 16 },
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  title: { color: t.ink, paddingTop: 12, paddingHorizontal: 4 },
  fade: { position: "absolute", top: 0, left: 0, right: 0, height: 20, zIndex: 2 },
  group: { paddingVertical: 4, paddingHorizontal: 14 },
  busyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 20,
    paddingHorizontal: 8,
    borderTopWidth: 1,
  },
}));
