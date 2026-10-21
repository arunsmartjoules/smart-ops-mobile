/**
 * Asset Mapping detail — in the artboard's detail language (ticket detail /
 * PM execution): round back button header with the QR label button on the
 * right, status pills over a Bricolage title, three-up info tiles, one
 * radius-26 card per concern, the "cannot access" row card, the activity
 * timeline, and the gradient CTA bar (Approve, for managers and admins while
 * the asset is in Review).
 */
import React, { useState } from "react";
import { Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Bx, type BxName } from "@/components/jo/Bx";
import {
  Card,
  IconButton,
  PrimaryButton,
  ProgressBar,
  StatusPill,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import { formatISTDateTime } from "@/utils/istDate";
import type { MappedAsset } from "@/services/AssetMappingService";
import {
  ActionPill,
  BottomBar,
  DetailTop,
  HintRow,
  InfoGrid,
  RoundAction,
  SectionCard,
  SpecGrid,
  Timeline,
  bottomBarSpace,
} from "./ui";
import {
  PROCESSING,
  criticalityTone,
  equipmentTone,
  getMappingStatus,
  qrValue,
  sideLabel,
  typeMeta,
} from "./lib";

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
  const s = useStyles();
  const t = useJoTheme();
  const status = getMappingStatus(asset);
  const critical = criticalityTone(asset);
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

  const activity = (
    [
      asset.nameplate_captured_at && {
        title: nameplateFailed ? "Nameplate photo saved (not read)" : "Nameplate captured",
        by: asset.nameplate_captured_by_name,
        at: asset.nameplate_captured_at,
        dot: t.accent,
      },
      asset.location_captured_at && {
        title: "Location photo captured",
        by: asset.location_captured_by_name,
        at: asset.location_captured_at,
        dot: t.accent,
      },
      asset.no_access_logged_at && {
        title: "Logged as no access",
        by: asset.no_access_logged_by_name,
        at: asset.no_access_logged_at,
        dot: t.bad,
      },
      asset.approved_at && {
        title: "Approved",
        by: asset.approved_by_name,
        at: asset.approved_at,
        dot: t.ok,
      },
    ].filter(Boolean) as { title: string; by: string | null; at: string; dot: string }[]
  ).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  return (
    <View style={s.screen}>
      <DetailTop
        topInset={topInset}
        title={asset.asset_id}
        subtitle={[asset.site_name || asset.site_code, meta.label].filter(Boolean).join(" · ")}
        onBack={onBack}
        right={<IconButton icon="bx-qr" label="View QR label" onPress={onViewQr} />}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          s.body,
          { paddingBottom: showApprove ? bottomBarSpace(bottomInset) : Math.max(bottomInset, 12) + 28 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.pills}>
          <StatusPill label={status.label} tone={status.tone} height={24} />
          {critical ? <StatusPill label={critical.label} tone={critical.tone} solid={critical.solid} height={24} /> : null}
          {asset.nameplate_processing ? <StatusPill label={PROCESSING.label} tone={PROCESSING.tone} height={24} /> : null}
        </View>
        <Text style={s.title} selectable>
          {asset.asset_name}
        </Text>

        <InfoGrid
          items={[
            { label: "Floor", value: asset.floor || "—" },
            { label: "Area", value: asset.location || "—" },
            { label: "Type", value: meta.label },
            { label: "Side", value: sideLabel(asset) || "—" },
            { label: "Criticality", value: asset.criticality || "—" },
            { label: "QR", value: qrValue(asset) },
          ]}
        />

        {/* Review / approved state */}
        {asset.mapping_status === "review" ? (
          <SectionCard title="Approval" meta="Waiting" metaTone="info">
            <HintRow icon="bx-hourglass">
              {canApprove
                ? "Check the photos and nameplate data, then approve below."
                : "Documentation is complete and waiting for a manager to approve."}
            </HintRow>
          </SectionCard>
        ) : null}

        {asset.mapping_status === "completed" ? (
          <SectionCard title="Approval" meta="Approved" metaTone="ok">
            <HintRow icon="bxs-check-circle" tone="ok">
              {`Approved${asset.approved_by_name ? ` by ${asset.approved_by_name}` : ""}${
                asset.approved_at ? ` · ${formatISTDateTime(asset.approved_at)}` : ""
              }`}
            </HintRow>
          </SectionCard>
        ) : null}

        {noAccess ? (
          <SectionCard title="No access" meta="Logged" metaTone="bad">
            <Text style={s.reason}>{asset.no_access_reason}</Text>
            {asset.no_access_notes ? <Text style={s.notes}>{asset.no_access_notes}</Text> : null}
          </SectionCard>
        ) : (
          <SectionCard title="Documentation" meta={`${captured} of 2 captured`}>
            <ProgressBar pct={captured * 50} color={captured === 2 ? t.ok : t.accent} />
            <DocRow
              icon="bx-id-card"
              title="Nameplate photo"
              done={hasNameplate}
              note={
                asset.nameplate_processing
                  ? { text: "Uploaded — reading in the background", tone: "info" }
                  : nameplateFailed
                    ? { text: "Couldn't be read — upload again", tone: "bad" }
                    : undefined
              }
              onSource={onNameplatePhoto}
            />
            <DocRow icon="bx-map" title="Location photo" done={hasLocation} onSource={onLocationPhoto} divider />
            {nameplateFailed ? (
              <>
                <HintRow icon="bx-error-circle" tone="bad" style={{ marginTop: 12 }}>
                  {asset.nameplate_data?.failure_reason ?? "AI couldn't read the plate. Upload a clearer photo."}
                </HintRow>
                <View style={s.actionRow}>
                  <ActionPill icon="bxs-keyboard" label="Enter specs by hand" onPress={onEnterSpecs} />
                </View>
              </>
            ) : null}
          </SectionCard>
        )}

        {photos.length > 0 ? (
          <SectionCard title="Photos" meta="Tap to preview">
            <View style={s.photos}>
              {photos.map((ph) => (
                <TouchableOpacity
                  key={ph.title}
                  onPress={() => onPreview(ph.url, ph.title)}
                  activeOpacity={0.85}
                  style={s.photo}
                  accessibilityRole="imagebutton"
                  accessibilityLabel={`Preview ${ph.title}`}
                >
                  <Image source={{ uri: ph.url }} style={s.photoImage} />
                  <Text style={s.photoLabel} numberOfLines={1}>
                    {ph.title}
                  </Text>
                </TouchableOpacity>
              ))}
              {/* Keep thumbnails a third wide when there are fewer than three. */}
              {Array.from({ length: 3 - photos.length }).map((_, i) => (
                <View key={`pad-${i}`} style={s.photo} />
              ))}
            </View>
          </SectionCard>
        ) : null}

        {specs.length > 0 ? (
          <SectionCard
            title="Nameplate data"
            meta={asset.nameplate_data?.state === "manual" ? "Entered manually" : "Read by AI"}
          >
            <SpecGrid specs={specs} />
            <View style={s.actionRow}>
              <ActionPill icon="bx-pencil" label="Edit details" onPress={onEditSpecs} />
            </View>
          </SectionCard>
        ) : null}

        <EquipmentCard asset={asset} onOpen={equipment.onOpen} onAdd={equipment.onAdd} />

        {!noAccess ? (
          <Card radius={22} style={s.linkRow} onPress={onCannotAccess} accessibilityLabel="I cannot access this asset">
            <View style={[s.linkIcon, { backgroundColor: t.badTint }]}>
              <Bx name="bx-block" size={18} color={t.bad} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.linkTitle}>I cannot access this asset</Text>
              <Text style={s.linkSub}>Log it with a reason and a proof photo</Text>
            </View>
            <Bx name="bx-chevron-right" size={20} color={t.faint} />
          </Card>
        ) : null}

        {activity.length > 0 ? (
          <SectionCard title="Activity">
            <Timeline
              items={activity.map((a) => ({
                key: `${a.title}-${a.at}`,
                title: a.title,
                meta: [a.by, formatISTDateTime(a.at)].filter(Boolean).join(" · "),
                dot: a.dot,
              }))}
            />
          </SectionCard>
        ) : null}
      </ScrollView>

      {showApprove ? (
        <BottomBar bottomInset={bottomInset}>
          <PrimaryButton label="Approve" icon="bx-check" busy={approving} onPress={onApprove} />
        </BottomBar>
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
  const s = useStyles();
  const t = useJoTheme();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [focused, setFocused] = useState(false);
  const items = asset.equipment ?? [];

  const submit = () => {
    const next = name.trim();
    if (!next) return;
    onAdd(next);
    setName("");
    setAdding(false);
  };

  return (
    <SectionCard title="Equipment" meta={items.length ? `${items.length}` : "None yet"}>
      {items.map((item, i) => {
        const ocr = equipmentTone(item);
        const details = item.nameplate_data?.fields?.length ?? 0;
        const note = details > 0 ? `${details} details` : "No details yet";
        return (
          <TouchableOpacity
            key={item.id}
            onPress={() => onOpen(item.id)}
            activeOpacity={0.8}
            style={[s.equipRow, i > 0 && s.divider]}
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${ocr.label}`}
          >
            {item.nameplate_photo_url ? (
              <Image source={{ uri: item.nameplate_photo_url }} style={s.equipThumb} />
            ) : (
              <View style={[s.equipThumb, s.center]}>
                <Bx name="bx-id-card" size={18} color={t.ink2} />
              </View>
            )}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.equipName} numberOfLines={1}>
                {item.name}
              </Text>
              <View style={s.equipMeta}>
                <StatusPill label={ocr.label} tone={ocr.tone} height={20} />
                <Text style={s.equipNote} numberOfLines={1}>
                  {note}
                  {item.photos.length > 0 ? ` · ${item.photos.length} photo${item.photos.length === 1 ? "" : "s"}` : ""}
                </Text>
              </View>
            </View>
            <Bx name="bx-chevron-right" size={20} color={t.faint} />
          </TouchableOpacity>
        );
      })}

      {adding ? (
        <View style={[s.addRow, items.length > 0 && { marginTop: 12 }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Equipment name"
            placeholderTextColor={t.faint}
            style={[s.addInput, { borderColor: focused ? t.accent : "transparent" }]}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submit}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            accessibilityLabel="Equipment name"
          />
          <ActionPill label="Add" variant="accent" onPress={submit} disabled={!name.trim()} accessibilityLabel="Add equipment" />
          <TouchableOpacity
            onPress={() => {
              setName("");
              setAdding(false);
            }}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cancel adding equipment"
          >
            <Bx name="bx-x" size={20} color={t.muted} />
          </TouchableOpacity>
        </View>
      ) : (
        <ActionPill
          icon="bx-plus"
          label="Add equipment"
          variant="dashed"
          onPress={() => setAdding(true)}
          style={{ marginTop: items.length ? 12 : 0 }}
        />
      )}
    </SectionCard>
  );
}

function DocRow({
  icon,
  title,
  done,
  note,
  onSource,
  divider,
}: {
  icon: BxName;
  title: string;
  done: boolean;
  /** Overrides the captured / not-captured line (reading, failed). */
  note?: { text: string; tone: "info" | "bad" };
  onSource: (source: PhotoSource) => void;
  divider?: boolean;
}) {
  const s = useStyles();
  const t = useJoTheme();
  const noteColor = note ? t[note.tone] : done ? t.ok : t.muted;
  return (
    <View style={[s.docRow, divider && s.divider]}>
      <View style={[s.docIcon, { backgroundColor: done ? t.okTint : t.raised }]}>
        <Bx name={done ? "bx-check" : icon} size={18} color={done ? t.ok : t.ink2} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={s.docTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={[s.docNote, { color: noteColor }]} numberOfLines={2}>
          {note?.text ?? (done ? "Captured" : "Not captured yet")}
        </Text>
      </View>
      <RoundAction icon="bx-image" onPress={() => onSource("library")} label={`Upload ${title} from gallery`} />
      <ActionPill
        icon="bx-camera"
        label={done ? "Retake" : "Capture"}
        variant={done ? "outline" : "accent"}
        onPress={() => onSource("camera")}
        accessibilityLabel={`${done ? "Retake" : "Capture"} ${title} with the camera`}
      />
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  body: { paddingHorizontal: 16, paddingTop: 4 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  title: { ...f.d(26, -0.025, 1.12), color: t.ink, marginTop: 10 },
  reason: { ...f.t(14, 500), color: t.ink, lineHeight: 20 },
  notes: { ...f.t(12.5), color: t.muted, lineHeight: 18, marginTop: 6 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  divider: { borderTopWidth: 1, borderTopColor: t.line },
  center: { alignItems: "center", justifyContent: "center" },
  docRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  docIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  docTitle: { ...f.t(13.5, 600), color: t.ink },
  docNote: { ...f.t(11.5), marginTop: 2 },
  photos: { flexDirection: "row", gap: 8 },
  photo: { flex: 1, minWidth: 0 },
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: 16,
    backgroundColor: t.raised,
    marginBottom: 6,
  },
  photoLabel: { ...f.t(11.5, 500), color: t.ink2 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  linkIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  linkTitle: { ...f.t(13.5, 600), color: t.ink },
  linkSub: { ...f.t(11.5), color: t.muted, marginTop: 2 },
  equipRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  equipThumb: { width: 42, height: 42, borderRadius: 14, backgroundColor: t.raised },
  equipName: { ...f.t(14, 600), color: t.ink },
  equipMeta: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  equipNote: { ...f.t(11.5), color: t.muted, flexShrink: 1 },
  addRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  addInput: {
    ...f.t(14),
    flex: 1,
    height: 44,
    borderRadius: 18,
    backgroundColor: t.raised,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 0,
    color: t.ink,
  },
}));
