/**
 * Account Settings — reached from the "Account Settings" row on the Settings
 * tab. Holds everything about the signed-in user's account: the identity card
 * (avatar with photo change, name, role, presence pill, read-only details),
 * Change Password and the account-deletion link. Built in the "JouleOps App"
 * visual language, like Appearance.
 */
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { format } from "date-fns";
import { Camera, ChevronLeft, Lock } from "@/components/jo/bxIcons";

import { useAuth } from "@/contexts/AuthContext";
import { StorageService } from "@/services/StorageService";
import { apiFetch } from "@/utils/apiHelper";
import { API_BASE_URL } from "@/constants/api";
import {
  Card,
  IconButton,
  JoPage,
  ListRow,
  SectionCaption,
  f,
} from "@/components/jo/ui";
import { makeJoStyles, useJoTheme } from "@/hooks/useJoTheme";

/** Role code → display label (users.role vocabulary). */
const ROLE_LABEL: Record<string, string> = {
  technician: "Site Technician",
  manager: "Site Manager",
  regional_manager: "Regional Manager",
  admin: "Admin",
};

/** Two-letter monogram, matching the artboard's "PG". */
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

export default function AccountScreen() {
  const styles = useStyles();
  const t = useJoTheme();
  const { user, deleteAccount, refreshProfile } = useAuth();

  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/profile");
  };

  const userKey = user?.user_id || user?.id || "unknown";

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
                allowsEditing: false,
                quality: 0.6,
              })
            : await ImagePicker.launchImageLibraryAsync({
                mediaTypes: "images",
                allowsEditing: false,
                quality: 0.6,
              });

        if (result.canceled || !result.assets?.[0]?.uri) return;

        setIsUploadingPhoto(true);
        const uri = result.assets[0].uri;
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
    [refreshProfile, userKey],
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
    if (isDeletingAccount) return;
    // Two-step confirmation: deletion is irreversible from the app's side.
    Alert.alert(
      "Delete My Account?",
      "Your JouleOps account and personal details will be permanently deleted and you'll be signed out on this device. You won't be able to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "destructive",
          onPress: () =>
            Alert.alert(
              "This can't be undone",
              "Are you sure you want to permanently delete your JouleOps account? Your name, email and other personal details will be removed.",
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
  }, [isDeletingAccount, performAccountDeletion]);

  const fullName = user?.full_name || user?.name || "Team Member";
  const joinedRaw = user?.created_at || user?.date_of_joining;
  const joinedDate = joinedRaw ? new Date(joinedRaw as string) : null;
  const joined =
    joinedDate && !Number.isNaN(joinedDate.getTime()) ? format(joinedDate, "MMM yyyy") : "—";
  const presence = user?.work_location_type;
  const roleLabel =
    user?.designation || ROLE_LABEL[String(user?.role || "").toLowerCase()] || "Team Member";

  // Employee code and phone only show when the profile carries them.
  const info = [
    { label: "Email", value: user?.email || "—" },
    ...(user?.employee_code ? [{ label: "Employee Code", value: user.employee_code }] : []),
    ...(user?.phone ? [{ label: "Phone", value: user.phone }] : []),
    { label: "Department", value: user?.department || "Operations" },
    { label: "Joined", value: joined },
  ];

  return (
    <JoPage>
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <View style={styles.headRow}>
          <IconButton icon={ChevronLeft} label="Back" onPress={back} iconSize={22} />
        </View>
        <Text style={[f.t(13), { color: t.muted, paddingHorizontal: 4, marginTop: 14 }]}>Settings</Text>
        <Text style={[f.d(28, -0.025), { color: t.ink, paddingHorizontal: 4, marginTop: 4 }]}>
          Account Settings
        </Text>

        <Card radius={28} style={styles.identityCard}>
          <View style={styles.identityRow}>
            <TouchableOpacity
              onPress={handlePhotoPress}
              disabled={isUploadingPhoto}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Change profile picture"
            >
              {/* box-shadow: 0 0 0 3px card, 0 0 0 5px accent */}
              <View style={[styles.avatarRing, { backgroundColor: t.accent }]}>
                <View style={styles.avatarGap}>
                  {user?.profile_photo_url ? (
                    <Image source={{ uri: user.profile_photo_url }} style={styles.avatar} />
                  ) : (
                    <View style={[styles.avatar, { backgroundColor: t.avatarSelf }]}>
                      <Text style={[f.d(22, 0, 1.1), { color: "#0A0A0C" }]}>{initialsFor(fullName)}</Text>
                    </View>
                  )}
                </View>
              </View>
              <View style={[styles.cameraBadge, { backgroundColor: t.raised }]}>
                {isUploadingPhoto ? (
                  <ActivityIndicator size="small" color={t.ink} />
                ) : (
                  <Camera size={12} color={t.ink} strokeWidth={2.2} />
                )}
              </View>
            </TouchableOpacity>

            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.d(21, -0.02), { color: t.ink }]} numberOfLines={1}>
                {fullName}
              </Text>
              <View style={styles.metaRow}>
                <Text style={[f.t(12.5), { color: t.ink3, flexShrink: 1 }]} numberOfLines={1}>
                  {roleLabel}
                </Text>
                {presence ? (
                  <View style={[styles.presencePill, { backgroundColor: t.okTint }]}>
                    <View style={[styles.presenceDot, { backgroundColor: t.ok }]} />
                    <Text style={[f.t(11, 600), { color: t.ok }]} numberOfLines={1}>
                      {presence}
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
          </View>

          <View style={{ marginTop: 16 }}>
            {info.map((r) => (
              <View key={r.label} style={styles.infoRow}>
                <Text style={[f.t(13), { color: t.muted }]}>{r.label}</Text>
                <Text style={[f.t(13, 500), { color: t.ink, flexShrink: 1, textAlign: "right" }]} numberOfLines={1}>
                  {r.value}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        <SectionCaption>Security</SectionCaption>
        <Card style={styles.group}>
          <ListRow
            icon={Lock}
            iconColor={t.accentInk}
            label="Change Password"
            onPress={() => router.push("/privacy-security")}
          />
        </Card>

        {/* Account deletion — required by the App Store review guidelines. */}
        <TouchableOpacity
          onPress={handleDeleteAccount}
          disabled={isDeletingAccount}
          activeOpacity={0.7}
          hitSlop={8}
          style={[styles.deleteLink, isDeletingAccount && { opacity: 0.5 }]}
          accessibilityRole="link"
          accessibilityLabel="Delete my account"
        >
          {isDeletingAccount ? <ActivityIndicator size="small" color={t.muted} /> : null}
          <Text style={[f.t(12.5), { color: t.muted, textDecorationLine: "underline" }]}>
            {isDeletingAccount ? "Deleting your account…" : "Delete my account"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </JoPage>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingBottom: 32 },
  headRow: { flexDirection: "row", paddingTop: 12 },
  identityCard: { marginTop: 16, padding: 18 },
  identityRow: { flexDirection: "row", alignItems: "center", gap: 14 },
  avatarRing: { padding: 2, borderRadius: 40 },
  avatarGap: { padding: 3, borderRadius: 38, backgroundColor: t.card },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  cameraBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: t.card,
    alignItems: "center",
    justifyContent: "center",
  },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  presencePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    flexShrink: 0,
  },
  presenceDot: { width: 6, height: 6, borderRadius: 3 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderTopColor: t.line,
  },
  group: { paddingVertical: 4, paddingHorizontal: 14 },
  deleteLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    alignSelf: "center",
  },
}));
