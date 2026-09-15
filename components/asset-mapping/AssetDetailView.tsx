/**
 * Asset Mapping — screen 2, Asset Detail: the hub for one asset.
 *
 * Identity card, the review / approval banner, photo previews, then either
 * the no-access summary or the documentation block: progress (nameplate 50 +
 * location 50), the two capture rows, the nameplate data read off the plate,
 * the data-pending note, and the "I cannot access this asset." entry.
 *
 * Approve (review → completed) is shown only to managers and admins.
 */
import React from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  Ban,
  Check,
  CircleAlert,
  CircleCheck,
  Hourglass,
  IdCard,
  Map as MapIcon,
  QrCode,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { makeThemedStyles } from "@/hooks/useDs";
import { formatISTDateTime } from "@/utils/istDate";
import { soShadow } from "@/components/shared/ListChrome";
import type { MappedAsset } from "@/services/AssetMappingService";
import { MONO, amPalette, statusChip, tint, typeMeta } from "./lib";
import { BackHeader, Button, Chip, Eyebrow, Notice, TypeBadge, usePalette } from "./ui";

interface Props {
  topInset: number;
  asset: MappedAsset;
  onBack: () => void;
  onViewQr: () => void;
  onCaptureNameplate: () => void;
  onCaptureLocation: () => void;
  onCannotAccess: () => void;
  onPreview: (url: string, title: string) => void;
  canApprove: boolean;
  approving: boolean;
  onApprove: () => void;
}

export default function AssetDetailView({
  topInset,
  asset,
  onBack,
  onViewQr,
  onCaptureNameplate,
  onCaptureLocation,
  onCannotAccess,
  onPreview,
  canApprove,
  approving,
  onApprove,
}: Props) {
  const styles = useStyles();
  const p = usePalette();
  const meta = typeMeta(asset, p.sub);
  const status = statusChip(asset, p);
  const noAccess = asset.mapping_status === "no_access";
  const hasNameplate = !!asset.nameplate_photo_url;
  const hasLocation = !!asset.location_photo_url;
  const progress = (hasNameplate ? 50 : 0) + (hasLocation ? 50 : 0);
  const progressColor = progress === 100 ? p.success : p.accent;
  const specs = asset.nameplate_data?.fields ?? [];
  const photos = [
    asset.nameplate_photo_url && {
      title: "Nameplate",
      url: asset.nameplate_photo_url,
      by: asset.nameplate_captured_by_name,
    },
    asset.location_photo_url && {
      title: "Location",
      url: asset.location_photo_url,
      by: asset.location_captured_by_name,
    },
    asset.no_access_proof_url && {
      title: "No-access proof",
      url: asset.no_access_proof_url,
      by: asset.no_access_logged_by_name,
    },
  ].filter(Boolean) as { title: string; url: string; by: string | null }[];

  return (
    <View style={[styles.screen, { paddingTop: topInset }]}>
      <BackHeader
        title="Asset Detail"
        onBack={onBack}
        right={
          <TouchableOpacity
            onPress={onViewQr}
            activeOpacity={0.8}
            style={[styles.qrButton, { borderColor: tint(p.info, 0.4) }]}
            accessibilityRole="button"
          >
            <QrCode size={14} color={p.info} strokeWidth={2.2} />
            <Text style={[styles.qrButtonText, { color: p.info }]}>View QR</Text>
          </TouchableOpacity>
        }
      />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Identity */}
        <View style={[styles.card, { marginBottom: 12 }]}>
          <View style={styles.identityTop}>
            <TypeBadge abbr={meta.abbr} color={meta.color} size={46} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.name}>{asset.asset_name}</Text>
              <Text style={styles.code}>{asset.asset_id}</Text>
            </View>
          </View>
          <View style={styles.chips}>
            <Chip label={meta.label} color={meta.color} />
            <Chip label={status.label} color={status.color} />
          </View>
          <View style={styles.placeRow}>
            <View style={{ flex: 1 }}>
              <Eyebrow style={{ marginBottom: 5 }}>Floor</Eyebrow>
              <Text style={styles.placeValue}>{asset.floor || "—"}</Text>
            </View>
            <View style={styles.placeDivider} />
            <View style={{ flex: 1 }}>
              <Eyebrow style={{ marginBottom: 5 }}>Area</Eyebrow>
              <Text style={styles.placeValue}>{asset.location || "—"}</Text>
            </View>
          </View>
        </View>

        {asset.mapping_status === "review" ? (
          <View
            style={[
              styles.card,
              { backgroundColor: tint(p.info, 0.08), borderColor: tint(p.info, 0.3), marginBottom: 12 },
            ]}
          >
            <View style={styles.naHead}>
              <Hourglass size={17} color={p.info} strokeWidth={2.2} />
              <Text style={[styles.naTitle, { color: p.info }]}>Waiting for manager approval</Text>
            </View>
            <Text style={styles.bannerBody}>
              {canApprove
                ? "Check the photos and nameplate data below, then approve."
                : "Documentation is complete. A manager will review it. Retaking a photo sends it back for review."}
            </Text>
            {canApprove ? (
              <Button
                label="Approve"
                icon={Check}
                onPress={onApprove}
                loading={approving}
                style={{ marginTop: 12, backgroundColor: approving ? undefined : p.success }}
              />
            ) : null}
          </View>
        ) : null}

        {asset.mapping_status === "completed" ? (
          <Notice color={p.success} icon={CircleCheck} title="Completed" style={{ marginBottom: 12 }}>
            {`Approved${asset.approved_by_name ? ` by ${asset.approved_by_name}` : ""}${
              asset.approved_at ? ` · ${formatISTDateTime(asset.approved_at)}` : ""
            }`}
          </Notice>
        ) : null}

        {photos.length > 0 ? (
          <View style={[styles.card, { marginBottom: 12 }]}>
            <Eyebrow style={{ marginBottom: 10 }}>Photos</Eyebrow>
            <View style={styles.photos}>
              {photos.map((ph) => (
                <TouchableOpacity
                  key={ph.title}
                  onPress={() => onPreview(ph.url, ph.title)}
                  activeOpacity={0.85}
                  style={styles.photo}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Preview ${ph.title}`}
                >
                  <Image source={{ uri: ph.url }} style={styles.photoImage} />
                  <Text style={styles.photoLabel} numberOfLines={1}>
                    {ph.title}
                  </Text>
                  {ph.by ? (
                    <Text style={styles.photoBy} numberOfLines={1}>
                      {ph.by}
                    </Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {noAccess ? (
          <View
            style={[
              styles.card,
              { backgroundColor: tint(p.warning, 0.1), borderColor: tint(p.warning, 0.32) },
            ]}
          >
            <View style={styles.naHead}>
              <CircleAlert size={18} color={p.warning} strokeWidth={2.2} />
              <Text style={[styles.naTitle, { color: p.warning }]}>Logged as non-accessible</Text>
            </View>
            <Text style={styles.naReason}>{asset.no_access_reason}</Text>
            {asset.no_access_notes ? (
              <Text style={styles.naNotes}>{asset.no_access_notes}</Text>
            ) : null}
            <View style={styles.naProof}>
              <CircleCheck size={15} color={p.success} strokeWidth={2.2} />
              <Text style={styles.naProofText}>Proof photo attached.</Text>
            </View>
          </View>
        ) : (
          <>
            <View style={[styles.card, { marginBottom: 12 }]}>
              <View style={styles.progressHead}>
                <Eyebrow>Documentation progress</Eyebrow>
                <Text style={[styles.progressLabel, { color: progressColor }]}>{progress}%</Text>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[styles.progressFill, { width: `${progress}%`, backgroundColor: progressColor }]}
                />
              </View>
            </View>

            <Eyebrow style={{ marginLeft: 2, marginBottom: 9 }}>Required documentation</Eyebrow>

            <DocRow
              icon={IdCard}
              title="Nameplate Photo"
              done={hasNameplate}
              onPress={onCaptureNameplate}
              style={{ marginBottom: 9 }}
            />
            <DocRow
              icon={MapIcon}
              title="Asset Location Photo"
              done={hasLocation}
              onPress={onCaptureLocation}
              style={{ marginBottom: 12 }}
            />

            {specs.length > 0 ? (
              <View style={[styles.card, { borderColor: tint(p.success, 0.28), marginBottom: 12 }]}>
                <View style={styles.specsHead}>
                  <CircleCheck size={16} color={p.success} strokeWidth={2.2} />
                  <Text style={[styles.specsTitle, { color: p.success }]}>Nameplate Data</Text>
                  {asset.nameplate_data?.state === "manual" ? (
                    <Text style={[styles.specsManual, { color: p.info }]}>· entered manually</Text>
                  ) : null}
                </View>
                <View style={styles.specsGrid}>
                  {specs.map((s, i) => (
                    <View key={`${s.label}-${i}`} style={styles.specCell}>
                      <Eyebrow size={8.5} style={{ marginBottom: 4 }}>
                        {s.label}
                      </Eyebrow>
                      <Text style={styles.specValue} selectable>
                        {s.value}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            ) : null}

            {asset.data_pending ? (
              <Notice color={p.warning} icon={CircleAlert} style={{ marginBottom: 12 }}>
                Photo saved, specs not extracted. Tagged for the office team to re-enter.
              </Notice>
            ) : null}

            <TouchableOpacity
              onPress={onCannotAccess}
              activeOpacity={0.8}
              style={[styles.cannot, { borderColor: tint(p.warning, 0.5) }]}
              accessibilityRole="button"
            >
              <Ban size={16} color={p.warning} strokeWidth={2.2} />
              <Text style={[styles.cannotText, { color: p.warning }]}>I cannot access this asset.</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function DocRow({
  icon: Icon,
  title,
  done,
  onPress,
  style,
}: {
  icon: LucideIcon;
  title: string;
  done: boolean;
  onPress: () => void;
  style?: object;
}) {
  const styles = useStyles();
  const p = usePalette();
  return (
    <View style={[styles.card, styles.docRow, style]}>
      <View
        style={[
          styles.docIcon,
          { backgroundColor: done ? tint(p.success, 0.14) : p.raised },
        ]}
      >
        <Icon size={18} color={done ? p.success : p.sub} strokeWidth={2.2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={[styles.docNote, { color: done ? p.success : p.sub }]}>
          {done ? "✓ Captured and saved" : "Not captured yet"}
        </Text>
      </View>
      <TouchableOpacity
        onPress={onPress}
        activeOpacity={0.85}
        style={[styles.docButton, { backgroundColor: done ? p.raised : p.accent }]}
        accessibilityRole="button"
        accessibilityLabel={`${done ? "Retake" : "Capture"} ${title}`}
      >
        <Text style={[styles.docButtonText, { color: done ? p.text : p.onAccent }]}>
          {done ? "Retake" : "Capture"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => {
  const p = amPalette(ds);
  return {
    screen: { flex: 1, backgroundColor: p.screen },
    content: { paddingHorizontal: 20, paddingBottom: 28 },
    card: {
      backgroundColor: p.card,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: 16,
      padding: 15,
      ...(ds.isDark ? {} : soShadow),
    },
    qrButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      borderWidth: 1,
      borderRadius: 10,
      paddingVertical: 7,
      paddingHorizontal: 10,
    },
    qrButtonText: { fontSize: 11, fontWeight: "600" },
    identityTop: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
    name: { fontSize: 16, lineHeight: 20, fontWeight: "700", color: p.text, marginBottom: 5 },
    code: { fontFamily: MONO, fontSize: 11, color: p.sub, letterSpacing: 0.4 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
    placeRow: {
      flexDirection: "row",
      gap: 10,
      borderTopWidth: 1,
      borderTopColor: p.border,
      paddingTop: 13,
    },
    placeDivider: { width: 1, backgroundColor: p.border },
    placeValue: { fontSize: 13, fontWeight: "600", color: p.text },
    naHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    naTitle: { fontSize: 13, fontWeight: "700" },
    naReason: { fontSize: 13, lineHeight: 19.5, fontWeight: "500", color: p.text, marginBottom: 8 },
    naNotes: { fontSize: 12, lineHeight: 18, color: p.sub, marginBottom: 8 },
    naProof: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 4 },
    bannerBody: { fontSize: 12, lineHeight: 18, fontWeight: "500", color: p.text },
    photos: { flexDirection: "row", gap: 10 },
    photo: { flex: 1, minWidth: 0, maxWidth: "33%" },
    photoImage: { width: "100%", aspectRatio: 1, borderRadius: 10, backgroundColor: p.raised, marginBottom: 6 },
    photoLabel: { fontSize: 11.5, fontWeight: "600", color: p.text },
    photoBy: { fontSize: 10.5, color: p.sub, marginTop: 1 },
    naProofText: { fontSize: 11.5, fontWeight: "500", color: p.sub },
    progressHead: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      marginBottom: 11,
    },
    progressLabel: { fontSize: 14, fontWeight: "700" },
    progressTrack: { height: 7, borderRadius: 99, backgroundColor: p.raised, overflow: "hidden" },
    progressFill: { height: 7, borderRadius: 99 },
    docRow: { flexDirection: "row", alignItems: "center", gap: 11, padding: 14 },
    docIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    docTitle: { fontSize: 13, fontWeight: "600", color: p.text, marginBottom: 3 },
    docNote: { fontSize: 11, fontWeight: "500" },
    docButton: { borderRadius: 10, paddingVertical: 9, paddingHorizontal: 14 },
    docButtonText: { fontSize: 12, fontWeight: "600" },
    specsHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 13 },
    specsTitle: { fontSize: 12.5, fontWeight: "700" },
    specsManual: { fontSize: 11, fontWeight: "500" },
    specsGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12, columnGap: 14 },
    specCell: { width: "46%", minWidth: 0 },
    specValue: { fontSize: 12.5, lineHeight: 17, fontWeight: "600", color: p.text },
    cannot: {
      borderWidth: 1,
      borderStyle: "dashed",
      borderRadius: 13,
      padding: 13,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
    },
    cannotText: { fontSize: 12.5, fontWeight: "600" },
  };
});
