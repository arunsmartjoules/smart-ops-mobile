/**
 * Asset Mapping — one equipment line item under an asset (a chiller's own
 * units, a plant room's pumps…), in the same detail layout as the asset:
 * its name, its own nameplate photo read by AI in the background, the
 * extracted specs (editable), and any number of extra photos.
 */
import React, { useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import {
  Camera,
  CircleAlert,
  IdCard,
  ImagePlus,
  Keyboard,
  Pencil,
  Trash2,
  Upload,
} from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import { formatISTDateTime } from "@/utils/istDate";
import {
  AttachButton,
  Badge,
  CardHead,
  DetailCard,
  DetailHeader,
  Field,
  SectionTitle,
  StatusHint,
  soRadius,
} from "@/components/tickets/TicketDetailUI";
import type { MappedAsset, MappingEquipment } from "@/services/AssetMappingService";
import type { PhotoSource } from "./AssetDetailView";
import { equipmentTone } from "./lib";

interface Props {
  topInset: number;
  asset: MappedAsset;
  equipment: MappingEquipment;
  busy: boolean;
  onBack: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
  onNameplatePhoto: (source: PhotoSource) => void;
  onEditSpecs: () => void;
  onAddPhoto: (source: PhotoSource) => void;
  onRemovePhoto: (url: string) => void;
  onPreview: (url: string, title: string) => void;
}

export default function EquipmentDetailView({
  topInset,
  asset,
  equipment,
  busy,
  onBack,
  onRename,
  onDelete,
  onNameplatePhoto,
  onEditSpecs,
  onAddPhoto,
  onRemovePhoto,
  onPreview,
}: Props) {
  const styles = useStyles();
  const ds = useDs();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(equipment.name);

  const data = equipment.nameplate_data;
  const processing = data?.state === "processing";
  const failed = data?.state === "failed";
  const specs = data?.fields ?? [];
  const hasNameplate = !!equipment.nameplate_photo_url;

  return (
    <View style={styles.screen}>
      <DetailHeader
        topInset={topInset}
        title={equipment.name}
        subtitle={`Equipment · ${asset.asset_name}`}
        onBack={onBack}
      />

      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        {/* Name */}
        <DetailCard>
          <CardHead label="Equipment name" hint={renaming ? "Editing" : undefined} />
          {renaming ? (
            <>
              <Field value={name} onChangeText={setName} placeholder="e.g. Chiller 1 compressor" autoFocus />
              <View style={styles.actionRow}>
                <AttachButton
                  icon={Pencil}
                  label="Save name"
                  active
                  onPress={() => {
                    const next = name.trim();
                    if (next && next !== equipment.name) onRename(next);
                    setRenaming(false);
                  }}
                />
                <AttachButton
                  icon={Trash2}
                  label="Cancel"
                  onPress={() => {
                    setName(equipment.name);
                    setRenaming(false);
                  }}
                />
              </View>
            </>
          ) : (
            <>
              <View style={styles.nameRow}>
                <Text style={styles.name}>{equipment.name}</Text>
                <Badge {...equipmentTone(equipment, ds)} />
              </View>
              <Text style={styles.added}>
                Added{equipment.created_by_name ? ` by ${equipment.created_by_name}` : ""} ·{" "}
                {formatISTDateTime(equipment.created_at)}
              </Text>
              <View style={styles.actionRow}>
                <AttachButton icon={Pencil} label="Rename" onPress={() => setRenaming(true)} />
                <AttachButton icon={Trash2} label="Remove" onPress={onDelete} />
              </View>
            </>
          )}
        </DetailCard>

        {/* Nameplate */}
        <DetailCard>
          <CardHead
            label="Nameplate"
            hint={
              processing ? "Reading…" : failed ? "Not read" : hasNameplate ? "Captured" : "Not captured"
            }
            hintTone={failed ? "error" : "muted"}
          />
          {equipment.nameplate_photo_url ? (
            <TouchableOpacity
              onPress={() => onPreview(equipment.nameplate_photo_url!, `${equipment.name} nameplate`)}
              activeOpacity={0.85}
              accessibilityRole="imagebutton"
            >
              <Image source={{ uri: equipment.nameplate_photo_url }} style={styles.nameplate} />
            </TouchableOpacity>
          ) : (
            <StatusHint icon={IdCard}>
              Photograph this equipment&apos;s nameplate — the details are read automatically.
            </StatusHint>
          )}
          {processing ? (
            <StatusHint icon={IdCard}>Uploaded — reading the details in the background.</StatusHint>
          ) : null}
          {failed ? (
            <View style={styles.inline}>
              <CircleAlert size={14} color={ds.flame[100]} strokeWidth={2.2} />
              <Text style={[styles.inlineText, { color: ds.flame[100] }]}>
                {data?.failure_reason ?? "The nameplate couldn't be read. Upload a clearer photo."}
              </Text>
            </View>
          ) : null}
          <View style={styles.actionRow}>
            <AttachButton
              icon={Camera}
              label={hasNameplate ? "Retake" : "Capture"}
              active={!hasNameplate}
              onPress={() => onNameplatePhoto("camera")}
            />
            <AttachButton icon={Upload} label="Upload" onPress={() => onNameplatePhoto("library")} />
          </View>
        </DetailCard>

        {/* Extracted specs */}
        <DetailCard>
          <CardHead
            label="Nameplate data"
            hint={
              specs.length === 0
                ? "Nothing yet"
                : data?.state === "manual"
                  ? "Entered by hand"
                  : "Read by AI"
            }
          />
          {specs.length > 0 ? (
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
          ) : (
            <StatusHint icon={Keyboard}>
              {hasNameplate
                ? "No details saved yet — edit them by hand if the read didn't work."
                : "Capture the nameplate, or enter the details by hand."}
            </StatusHint>
          )}
          <View style={styles.actionRow}>
            <AttachButton
              icon={Keyboard}
              label={specs.length > 0 ? "Edit details" : "Enter details"}
              onPress={onEditSpecs}
            />
          </View>
        </DetailCard>

        {/* Extra photos */}
        <DetailCard>
          <CardHead label="Additional photos" hint={`${equipment.photos.length}`} />
          {equipment.photos.length > 0 ? (
            <View style={styles.photoGrid}>
              {equipment.photos.map((url, i) => (
                <View key={url} style={styles.photo}>
                  <TouchableOpacity
                    onPress={() => onPreview(url, `${equipment.name} photo ${i + 1}`)}
                    activeOpacity={0.85}
                    accessibilityRole="imagebutton"
                  >
                    <Image source={{ uri: url }} style={styles.photoImage} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRemovePhoto(url)}
                    style={styles.photoRemove}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1}`}
                  >
                    <Trash2 size={13} color={ds.onAccent} strokeWidth={2.2} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <SectionTitle style={styles.emptyPhotos}>No extra photos yet</SectionTitle>
          )}
          <View style={styles.actionRow}>
            <AttachButton icon={Camera} label="Capture" onPress={() => onAddPhoto("camera")} />
            <AttachButton icon={ImagePlus} label="Upload" onPress={() => onAddPhoto("library")} />
          </View>
        </DetailCard>

        {busy ? <StatusHint icon={IdCard}>Working…</StatusHint> : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  screen: { flex: 1, backgroundColor: ds.pageBg },
  body: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, fontSize: 15, fontWeight: "600", color: ds.carbon[100] },
  added: { fontSize: 10.5, color: ds.carbon[400], marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 12 },
  nameplate: {
    width: "100%",
    aspectRatio: 4 / 3,
    borderRadius: soRadius.sm,
    backgroundColor: ds.carbon[1000],
  },
  inline: { flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 10 },
  inlineText: { flex: 1, fontSize: 12, lineHeight: 17 },
  eyebrow: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  specGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  specCell: { width: "50%", paddingRight: 12 },
  specValue: { fontSize: 12.5, color: ds.carbon[100], marginTop: 3 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  photo: { width: "30%" },
  photoImage: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: soRadius.sm,
    backgroundColor: ds.carbon[1000],
  },
  photoRemove: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: soRadius.pill,
    backgroundColor: ds.flame[100],
    alignItems: "center",
    justifyContent: "center",
  },
  emptyPhotos: { fontSize: 12, fontWeight: "500", color: ds.carbon[400], marginBottom: 0 },
}));
