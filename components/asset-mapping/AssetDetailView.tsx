/**
 * Asset Mapping detail — laid out like the ticket detail: thunder header,
 * summary card (title, badges, meta), one card per concern, an activity
 * timeline, and the sticky action bar (Approve, for managers and admins while
 * the asset is in Review).
 */
import React, { useState } from "react";
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import {
  Ban,
  Camera,
  CircleAlert,
  CircleCheck,
  ChevronRight,
  Hourglass,
  IdCard,
  Keyboard,
  Map as MapIcon,
  Pencil,
  Plus,
  QrCode,
  Upload,
} from "lucide-react-native";
import type { LucideIcon } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { formatISTDateTime } from "@/utils/istDate";
import {
  ActivityRow,
  AttachButton,
  Badge,
  CardHead,
  DetailCard,
  DetailHeader,
  MetaBlock,
  SectionTitle,
  StatusHint,
  SubmitBar,
  soRadius,
  soShadow,
} from "@/components/tickets/TicketDetailUI";
import type { MappedAsset } from "@/services/AssetMappingService";
import { equipmentTone, getMappingStatus, processingTone, sideLabel, typeColor, typeMeta } from "./lib";

export type PhotoSource = "camera" | "library";

interface Props {
  topInset: number;
  bottomInset: number;
  asset: MappedAsset;
  onBack: () => void;
  onViewQr: () => void;
  /** Take a photo with the camera, or pick one from the gallery. */
  onNameplatePhoto: (source: PhotoSource) => void;
  onLocationPhoto: (source: PhotoSource) => void;
  onCannotAccess: () => void;
  /** Failed read: type the specs in from the saved nameplate photo. */
  onEnterSpecs: () => void;
  onPreview: (url: string, title: string) => void;
  /** Edit the extracted nameplate text (a corrected AI read). */
  onEditSpecs: () => void;
  equipment: {
    onOpen: (equipmentId: string) => void;
    onAdd: (name: string) => void;
  };
  canApprove: boolean;
  approving: boolean;
  onApprove: () => void;
}

export default function AssetDetailView({
  topInset,
  bottomInset,
  asset,
  onBack,
  onViewQr,
  onNameplatePhoto,
  onLocationPhoto,
  onCannotAccess,
  onEnterSpecs,
  onPreview,
  onEditSpecs,
  equipment,
  canApprove,
  approving,
  onApprove,
}: Props) {
  const styles = useStyles();
  const ds = useDs();
  const status = getMappingStatus(asset, ds);
  const meta = typeMeta(asset);
  const noAccess = asset.mapping_status === "no_access";
  const hasNameplate = !!asset.nameplate_photo_url;
  const hasLocation = !!asset.location_photo_url;
  const captured = (hasNameplate ? 1 : 0) + (hasLocation ? 1 : 0);
  const specs = asset.nameplate_data?.fields ?? [];
  const nameplateFailed = asset.nameplate_data?.state === "failed";
  const showApprove = canApprove && asset.mapping_status === "review";

  const photos = [
    asset.nameplate_photo_url && { title: "Nameplate", url: asset.nameplate_photo_url },
    asset.location_photo_url && { title: "Location", url: asset.location_photo_url },
    asset.no_access_proof_url && { title: "No-access proof", url: asset.no_access_proof_url },
  ].filter(Boolean) as { title: string; url: string }[];

  const activity = [
    asset.nameplate_captured_at && {
      title: asset.nameplate_data?.state === "failed" ? "Nameplate photo saved (not read)" : "Nameplate captured",
      by: asset.nameplate_captured_by_name,
      at: asset.nameplate_captured_at,
      dot: ds.flame[100],
    },
    asset.location_captured_at && {
      title: "Location photo captured",
      by: asset.location_captured_by_name,
      at: asset.location_captured_at,
      dot: ds.flame[100],
    },
    asset.no_access_logged_at && {
      title: "Logged as no access",
      by: asset.no_access_logged_by_name,
      at: asset.no_access_logged_at,
      dot: ds.carbon[500],
    },
    asset.approved_at && {
      title: "Approved",
      by: asset.approved_by_name,
      at: asset.approved_at,
      dot: ds.sky[100],
    },
  ]
    .filter(Boolean)
    .sort((a: any, b: any) => Date.parse(b.at) - Date.parse(a.at)) as {
    title: string;
    by: string | null;
    at: string;
    dot: string;
  }[];

  return (
    <View style={styles.screen}>
      <DetailHeader
        topInset={topInset}
        title={asset.asset_id}
        subtitle={[asset.site_name || asset.site_code, meta.label].filter(Boolean).join(" · ")}
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary */}
        <DetailCard style={styles.summary}>
          <Text style={styles.title}>{asset.asset_name}</Text>
          <View style={styles.badgeRow}>
            <Badge label={status.label} bg={status.bg} fg={status.fg} />
            {asset.nameplate_processing ? <Badge {...processingTone(ds)} /> : null}
          </View>
          <View style={styles.metaWrap}>
            <MetaBlock label="Floor" value={asset.floor || "—"} />
            <MetaBlock label="Area" value={asset.location || "—"} />
            <MetaBlock label="Type" value={meta.label} />
            <MetaBlock label="Side" value={sideLabel(asset) || "—"} />
            <MetaBlock label="Criticality" value={asset.criticality || "—"} />
          </View>
          <View style={styles.qrRow}>
            <AttachButton icon={QrCode} label="View QR label" onPress={onViewQr} />
          </View>
        </DetailCard>

        {/* Review / completed state */}
        {asset.mapping_status === "review" ? (
          <DetailCard>
            <CardHead label="Approval" hint="Waiting" />
            <StatusHint icon={Hourglass}>
              {canApprove
                ? "Check the photos and nameplate data, then approve below."
                : "Documentation is complete and waiting for a manager to approve."}
            </StatusHint>
          </DetailCard>
        ) : null}

        {asset.mapping_status === "completed" ? (
          <DetailCard>
            <CardHead label="Approval" hint="Approved" />
            <View style={styles.inline}>
              <CircleCheck size={16} color={ds.sky[100]} strokeWidth={2.2} />
              <Text style={styles.inlineText}>
                Approved{asset.approved_by_name ? ` by ${asset.approved_by_name}` : ""}
                {asset.approved_at ? ` · ${formatISTDateTime(asset.approved_at)}` : ""}
              </Text>
            </View>
          </DetailCard>
        ) : null}

        {noAccess ? (
          <DetailCard>
            <CardHead label="No access" hint="Logged" />
            <Text style={styles.reason}>{asset.no_access_reason}</Text>
            {asset.no_access_notes ? <Text style={styles.notes}>{asset.no_access_notes}</Text> : null}
          </DetailCard>
        ) : (
          <DetailCard>
            <CardHead label="Documentation" hint={`${captured} of 2 captured`} />
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${captured * 50}%`, backgroundColor: captured === 2 ? ds.sky[100] : ds.flame[100] },
                ]}
              />
            </View>
            <DocRow
              icon={IdCard}
              title="Nameplate photo"
              done={hasNameplate}
              note={
                asset.nameplate_processing
                  ? { text: "Uploaded — reading in the background", tone: "info" }
                  : nameplateFailed
                    ? { text: "Couldn't be read — upload again", tone: "error" }
                    : undefined
              }
              onSource={onNameplatePhoto}
            />
            <DocRow icon={MapIcon} title="Location photo" done={hasLocation} onSource={onLocationPhoto} last />
            {nameplateFailed ? (
              <>
                <View style={[styles.inline, { marginTop: 12, marginBottom: 10 }]}>
                  <CircleAlert size={14} color={ds.flame[100]} strokeWidth={2.2} />
                  <Text style={[styles.inlineText, { color: ds.flame[100] }]}>
                    {asset.nameplate_data?.failure_reason ??
                      "AI couldn't read the plate. Upload a clearer photo."}
                  </Text>
                </View>
                <View style={{ flexDirection: "row" }}>
                  <AttachButton icon={Keyboard} label="Enter specs by hand" onPress={onEnterSpecs} />
                </View>
              </>
            ) : null}
          </DetailCard>
        )}

        {photos.length > 0 ? (
          <DetailCard>
            <CardHead label="Photos" hint="Tap to preview" />
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
                </TouchableOpacity>
              ))}
            </View>
          </DetailCard>
        ) : null}

        {specs.length > 0 ? (
          <DetailCard>
            <CardHead
              label="Nameplate data"
              hint={asset.nameplate_data?.state === "manual" ? "Entered manually" : "Read by AI"}
            />
            <View style={styles.specGrid}>
              {specs.map((s, i) => (
                <View key={`${s.label}-${i}`} style={styles.specCell}>
                  <Text style={styles.eyebrow}>{s.label}</Text>
                  <Text style={styles.specValue} selectable>
                    {s.value}
                  </Text>
                </View>
              ))}
            </View>
            <View style={{ flexDirection: "row", marginTop: 12 }}>
              <AttachButton icon={Pencil} label="Edit details" onPress={onEditSpecs} />
            </View>
          </DetailCard>
        ) : null}

        <EquipmentCard asset={asset} onOpen={equipment.onOpen} onAdd={equipment.onAdd} />

        {!noAccess ? (
          <TouchableOpacity
            onPress={onCannotAccess}
            activeOpacity={0.85}
            style={[styles.card, styles.linkRow]}
            accessibilityRole="button"
          >
            <View style={styles.linkIcon}>
              <Ban size={17} color={ds.flame[100]} strokeWidth={2.1} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.linkTitle}>I cannot access this asset</Text>
              <Text style={styles.linkSub}>Log it with a reason and a proof photo</Text>
            </View>
            <ChevronRight size={18} color={ds.carbon[600]} strokeWidth={2} />
          </TouchableOpacity>
        ) : null}

        {activity.length > 0 ? (
          <DetailCard>
            <SectionTitle>Activity</SectionTitle>
            {activity.map((a, i) => (
              <ActivityRow
                key={`${a.title}-${a.at}`}
                title={a.title}
                meta={[a.by, formatISTDateTime(a.at)].filter(Boolean).join(" · ")}
                dot={a.dot}
                line={i < activity.length - 1}
              />
            ))}
          </DetailCard>
        ) : null}
      </ScrollView>

      {showApprove ? (
        <SubmitBar label="Approve" ready busy={approving} bottomInset={bottomInset} onPress={onApprove} />
      ) : null}
    </View>
  );
}

/**
 * Equipment line items: anything documented under this asset in its own
 * right (a chiller's units, a plant room's pumps). Each carries its own
 * nameplate read and extra photos — tap to open it.
 */
function EquipmentCard({
  asset,
  onOpen,
  onAdd,
}: {
  asset: MappedAsset;
  onOpen: (equipmentId: string) => void;
  onAdd: (name: string) => void;
}) {
  const styles = useStyles();
  const ds = useDs();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const items = asset.equipment ?? [];

  const submit = () => {
    const next = name.trim();
    if (!next) return;
    onAdd(next);
    setName("");
    setAdding(false);
  };

  return (
    <DetailCard>
      <CardHead label="Equipment" hint={items.length ? `${items.length}` : "None yet"} />
      {items.map((item) => {
        const tone = typeColor(item.name.slice(0, 3).toUpperCase(), ds);
        const ocr = equipmentTone(item, ds);
        const details = item.nameplate_data?.fields?.length ?? 0;
        const note = details > 0 ? `${details} details` : "No details yet";
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onOpen(item.id)}
            activeOpacity={0.85}
            style={styles.equipRow}
            accessibilityRole="button"
            accessibilityLabel={item.name}
          >
            {item.nameplate_photo_url ? (
              <Image source={{ uri: item.nameplate_photo_url }} style={styles.equipThumb} />
            ) : (
              <View style={[styles.equipThumb, { backgroundColor: tone.bg, alignItems: "center", justifyContent: "center" }]}>
                <IdCard size={16} color={tone.fg} strokeWidth={2.1} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.equipTop}>
                <Text style={styles.equipName} numberOfLines={1}>
                  {item.name}
                </Text>
                {/* OCR state, same colour roles as the asset status badges. */}
                <Badge label={ocr.label} bg={ocr.bg} fg={ocr.fg} />
              </View>
              <Text style={styles.equipNote} numberOfLines={1}>
                {note}
                {item.photos.length > 0 ? ` · ${item.photos.length} photo${item.photos.length === 1 ? "" : "s"}` : ""}
              </Text>
            </View>
            <ChevronRight size={18} color={ds.carbon[600]} strokeWidth={2} />
          </TouchableOpacity>
        );
      })}

      {adding ? (
        <View style={styles.addRow}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Equipment name"
            placeholderTextColor={ds.carbon[700]}
            style={styles.addInput}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
          />
          <TouchableOpacity
            onPress={submit}
            style={[styles.addButton, { backgroundColor: ds.controlOn }]}
            accessibilityRole="button"
            accessibilityLabel="Add equipment"
          >
            <Text style={[styles.addButtonText, { color: ds.onControl }]}>Add</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={{ flexDirection: "row", marginTop: items.length ? 12 : 4 }}>
          <AttachButton icon={Plus} label="Add equipment" onPress={() => setAdding(true)} />
        </View>
      )}
    </DetailCard>
  );
}

function DocRow({
  icon: Icon,
  title,
  done,
  note,
  onSource,
  last,
}: {
  icon: LucideIcon;
  title: string;
  done: boolean;
  /** Overrides the captured / not-captured line (reading, failed). */
  note?: { text: string; tone: "info" | "error" };
  onSource: (source: PhotoSource) => void;
  last?: boolean;
}) {
  const styles = useStyles();
  const ds = useDs();
  const noteColor = note
    ? note.tone === "error"
      ? ds.flame[100]
      : ds.sky[100]
    : done
      ? ds.sky[100]
      : ds.carbon[400];
  return (
    <View style={[styles.docRow, !last && styles.docDivider]}>
      <View style={[styles.docIcon, { backgroundColor: done ? ds.sky[900] : ds.carbon[1000] }]}>
        <Icon size={16} color={done ? ds.sky[100] : ds.carbon[400]} strokeWidth={2.1} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.docTitle}>{title}</Text>
        <Text style={[styles.docNote, { color: noteColor }]}>
          {note?.text ?? (done ? "Captured" : "Not captured yet")}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onSource("library")}
        activeOpacity={0.85}
        style={[styles.docIconButton, { borderColor: ds.carbon[900] }]}
        accessibilityRole="button"
        accessibilityLabel={`Upload ${title} from gallery`}
      >
        <Upload size={16} color={ds.carbon[200]} strokeWidth={2.1} />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => onSource("camera")}
        activeOpacity={0.85}
        style={[
          styles.docButton,
          done
            ? { backgroundColor: ds.white, borderColor: ds.carbon[900] }
            : { backgroundColor: ds.controlOn, borderColor: ds.controlOn },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${done ? "Retake" : "Capture"} ${title} with the camera`}
      >
        <Camera size={14} color={done ? ds.carbon[100] : ds.onControl} strokeWidth={2.2} />
        <Text style={[styles.docButtonText, { color: done ? ds.carbon[100] : ds.onControl }]}>
          {done ? "Retake" : "Capture"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 20 },
  summary: { padding: 16, marginBottom: 12 },
  title: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "600",
    letterSpacing: 0.16,
    color: ds.carbon[100],
    marginBottom: 10,
  },
  badgeRow: { flexDirection: "row", gap: 7, marginBottom: 14 },
  metaWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderTopWidth: 1,
    borderTopColor: ds.carbon[1000],
    paddingTop: 13,
  },
  qrRow: { flexDirection: "row", marginTop: 12 },
  card: {
    backgroundColor: ds.white,
    borderRadius: soRadius.card,
    padding: 14,
    marginBottom: 10,
    ...soShadow,
  },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  inline: { flexDirection: "row", alignItems: "flex-start", gap: 7 },
  inlineText: { flex: 1, fontSize: 12, lineHeight: 17, color: ds.carbon[200] },
  reason: { fontSize: 13, lineHeight: 19, fontWeight: "500", color: ds.carbon[100] },
  notes: { fontSize: 12, lineHeight: 18, color: ds.carbon[400], marginTop: 6 },
  progressTrack: {
    height: 5,
    borderRadius: soRadius.pill,
    backgroundColor: ds.carbon[1000],
    overflow: "hidden",
    marginBottom: 6,
  },
  progressFill: { height: 5, borderRadius: soRadius.pill },
  docRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 11 },
  docDivider: { borderBottomWidth: 1, borderBottomColor: ds.carbon[1000] },
  docIcon: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  docTitle: { fontSize: 13, fontWeight: "500", color: ds.carbon[100] },
  docNote: { fontSize: 10.5, color: ds.carbon[400], marginTop: 1 },
  docButton: {
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: soRadius.pill,
    borderWidth: 1,
    flexDirection: "row",
    gap: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  docButtonText: { fontSize: 12, fontWeight: "600" },
  docIconButton: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    borderWidth: 1,
    backgroundColor: ds.white,
    alignItems: "center",
    justifyContent: "center",
  },
  photos: { flexDirection: "row", gap: 10 },
  photo: { flex: 1, minWidth: 0, maxWidth: "33%" },
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: soRadius.sm,
    backgroundColor: ds.carbon[1000],
    marginBottom: 6,
  },
  photoLabel: { fontSize: 11, fontWeight: "500", color: ds.carbon[200] },
  specGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  specCell: { width: "50%", paddingRight: 12 },
  specValue: { fontSize: 12.5, color: ds.carbon[100], marginTop: 3 },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  linkIcon: {
    width: 34,
    height: 34,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[1000],
    alignItems: "center",
    justifyContent: "center",
  },
  equipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: ds.carbon[1000],
  },
  equipThumb: {
    width: 38,
    height: 38,
    borderRadius: soRadius.sm,
    backgroundColor: ds.carbon[1000],
  },
  equipTop: { flexDirection: "row", alignItems: "center", gap: 7 },
  equipName: { flexShrink: 1, fontSize: 13, fontWeight: "500", color: ds.carbon[100] },
  equipNote: { fontSize: 10.5, color: ds.carbon[400], marginTop: 2 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 },
  addInput: {
    flex: 1,
    minHeight: 40,
    backgroundColor: ds.pageBg,
    borderWidth: 1,
    borderColor: ds.carbon[900],
    borderRadius: soRadius.sm,
    paddingHorizontal: 12,
    fontSize: 13,
    color: ds.carbon[100],
  },
  addButton: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: soRadius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  addButtonText: { fontSize: 13, fontWeight: "600" },
  linkTitle: { fontSize: 13, fontWeight: "500", color: ds.carbon[100] },
  linkSub: { fontSize: 10.5, color: ds.carbon[400], marginTop: 1 },
}));
