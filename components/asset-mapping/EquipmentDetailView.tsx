/**
 * Asset Mapping — one equipment line item under an asset (a chiller's own
 * units, a plant room's pumps…), in the same detail language as the asset:
 * its name (rename / remove), its own nameplate photo read by AI in the
 * background, the extracted specs (editable), and any number of extra photos.
 */
import React, { useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, StatusPill, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { formatISTDateTime } from "@/utils/istDate";
import type { MappedAsset, MappingEquipment } from "@/services/AssetMappingService";
import type { PhotoSource } from "./AssetDetailView";
import { ActionPill, DetailTop, HintRow, PhotoSlot, SectionCard, SpecGrid } from "./ui";
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
  const s = useStyles();
  const t = useJoTheme();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(equipment.name);
  const [focused, setFocused] = useState(false);

  const data = equipment.nameplate_data;
  const processing = data?.state === "processing";
  const failed = data?.state === "failed";
  const specs = data?.fields ?? [];
  const hasNameplate = !!equipment.nameplate_photo_url;
  const ocr = equipmentTone(equipment);

  return (
    <View style={s.screen}>
      <DetailTop
        topInset={topInset}
        title={equipment.name}
        subtitle={`Equipment · ${asset.asset_name}`}
        onBack={onBack}
      />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.body}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Name */}
        {renaming ? (
          <SectionCard title="Equipment name" meta="Editing" style={{ marginTop: 0 }}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g. Chiller 1 compressor"
              placeholderTextColor={t.faint}
              autoFocus
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              style={[s.input, { borderColor: focused ? t.accent : "transparent" }]}
              accessibilityLabel="Equipment name"
            />
            <View style={s.actionRow}>
              <ActionPill
                icon="bx-check"
                label="Save name"
                variant="accent"
                onPress={() => {
                  const next = name.trim();
                  if (next && next !== equipment.name) onRename(next);
                  setRenaming(false);
                }}
              />
              <ActionPill
                label="Cancel"
                onPress={() => {
                  setName(equipment.name);
                  setRenaming(false);
                }}
              />
            </View>
          </SectionCard>
        ) : (
          <>
            <View style={s.pills}>
              <StatusPill label={ocr.label} tone={ocr.tone} height={24} />
            </View>
            <Text style={s.title} selectable>
              {equipment.name}
            </Text>
            <Text style={s.added}>
              Added{equipment.created_by_name ? ` by ${equipment.created_by_name}` : ""} ·{" "}
              {formatISTDateTime(equipment.created_at)}
            </Text>
            <View style={s.actionRow}>
              <ActionPill icon="bx-pencil" label="Rename" onPress={() => setRenaming(true)} />
              <ActionPill icon="bx-trash" label="Remove" tone="bad" onPress={onDelete} />
            </View>
          </>
        )}

        {/* Nameplate */}
        <SectionCard
          title="Nameplate"
          meta={processing ? "Reading…" : failed ? "Not read" : hasNameplate ? "Captured" : "Not captured"}
          metaTone={failed ? "bad" : processing ? "info" : undefined}
        >
          {equipment.nameplate_photo_url ? (
            <TouchableOpacity
              onPress={() => onPreview(equipment.nameplate_photo_url!, `${equipment.name} nameplate`)}
              activeOpacity={0.85}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Preview ${equipment.name} nameplate`}
            >
              <Image source={{ uri: equipment.nameplate_photo_url }} style={s.nameplate} />
            </TouchableOpacity>
          ) : (
            <HintRow icon="bx-id-card">
              Photograph this equipment&apos;s nameplate — the details are read automatically.
            </HintRow>
          )}
          {processing ? (
            <HintRow icon="bx-loader-alt" tone="info" style={{ marginTop: 10 }}>
              Uploaded — reading the details in the background.
            </HintRow>
          ) : null}
          {failed ? (
            <HintRow icon="bx-error-circle" tone="bad" style={{ marginTop: 10 }}>
              {data?.failure_reason ?? "The nameplate couldn't be read. Upload a clearer photo."}
            </HintRow>
          ) : null}
          <View style={[s.slots, { marginTop: 12 }]}>
            <PhotoSlot
              icon="bx-camera"
              label={hasNameplate ? "Retake" : "Capture"}
              primary
              onPress={() => onNameplatePhoto("camera")}
            />
            <PhotoSlot icon="bx-image" label="Gallery" onPress={() => onNameplatePhoto("library")} />
          </View>
        </SectionCard>

        {/* Extracted specs */}
        <SectionCard
          title="Nameplate data"
          meta={specs.length === 0 ? "Nothing yet" : data?.state === "manual" ? "Entered by hand" : "Read by AI"}
        >
          {specs.length > 0 ? (
            <SpecGrid specs={specs} />
          ) : (
            <HintRow icon="bxs-keyboard">
              {hasNameplate
                ? "No details saved yet — edit them by hand if the read didn't work."
                : "Capture the nameplate, or enter the details by hand."}
            </HintRow>
          )}
          <View style={s.actionRow}>
            <ActionPill
              icon={specs.length > 0 ? "bx-pencil" : "bxs-keyboard"}
              label={specs.length > 0 ? "Edit details" : "Enter details"}
              onPress={onEditSpecs}
            />
          </View>
        </SectionCard>

        {/* Extra photos */}
        <SectionCard title="Additional photos" meta={`${equipment.photos.length}`}>
          {equipment.photos.length > 0 ? (
            <View style={s.photoGrid}>
              {equipment.photos.map((url, i) => (
                <View key={url} style={s.photo}>
                  <TouchableOpacity
                    onPress={() => onPreview(url, `${equipment.name} photo ${i + 1}`)}
                    activeOpacity={0.85}
                    accessibilityRole="imagebutton"
                    accessibilityLabel={`Preview photo ${i + 1}`}
                  >
                    <Image source={{ uri: url }} style={s.photoImage} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => onRemovePhoto(url)}
                    style={s.photoRemove}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove photo ${i + 1}`}
                  >
                    <GlossFill color={t.bad} fg={t.onAccent} radius={13} />
                    <Bx name="bx-trash" size={14} color={t.onAccent} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : (
            <Text style={s.empty}>No extra photos yet</Text>
          )}
          <View style={[s.slots, { marginTop: 12 }]}>
            <PhotoSlot icon="bx-camera" label="Capture" primary onPress={() => onAddPhoto("camera")} />
            <PhotoSlot icon="bx-image-add" label="Gallery" onPress={() => onAddPhoto("library")} />
          </View>
        </SectionCard>

        {busy ? (
          <View style={s.busy}>
            <ActivityIndicator size="small" color={t.muted} />
            <Text style={[f.t(12), { color: t.muted }]}>Working…</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  screen: { flex: 1, backgroundColor: t.page },
  body: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
  pills: { flexDirection: "row", gap: 6 },
  title: { ...f.d(26, -0.025, 1.12), color: t.ink, marginTop: 10 },
  added: { ...f.t(12), color: t.muted, marginTop: 6 },
  actionRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
  input: {
    ...f.t(14),
    height: 48,
    borderRadius: 18,
    backgroundColor: t.raised,
    borderWidth: 1.5,
    paddingHorizontal: 14,
    paddingVertical: 0,
    color: t.ink,
  },
  nameplate: { width: "100%", aspectRatio: 4 / 3, borderRadius: 18, backgroundColor: t.raised },
  slots: { flexDirection: "row", gap: 8 },
  photoGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  photo: { width: "31.5%" },
  photoImage: { width: "100%", aspectRatio: 1, borderRadius: 16, backgroundColor: t.raised },
  photoRemove: {
    position: "absolute",
    top: 5,
    right: 5,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: t.bad,
    alignItems: "center",
    justifyContent: "center",
  },
  empty: { ...f.t(12.5), color: t.muted },
  busy: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 14 },
}));
