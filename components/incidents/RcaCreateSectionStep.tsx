/**
 * "Create RCA": one section of the RCA per screen. The prompt is the question,
 * then a text answer and/or photo rows depending on the section's kind.
 *
 * Photos are added from the camera or the gallery; this screen only picks and
 * reports them (the modal checks JPG/PNG and the limits, then uploads), so
 * answers survive Back/Next and an upload that fails never loses anything.
 */
import React, { useState } from "react";
import { ActivityIndicator, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { RcaSection } from "@/services/RcaCreateService";
import { FieldLabel, TextField } from "./IncFields";
import { InlineError, StepDots } from "./RcaImportParts";
import PolishButton from "./PolishButton";
import {
  CAPTION_MAX,
  PHOTOS_PER_SECTION,
  PHOTOS_TOTAL,
  SECTION_TEXT_MAX,
  isSectionRequired,
  photoSlots,
  sectionAsksPhotos,
  sectionAsksText,
  type PhotoItem,
  type SectionAnswer,
} from "./rcaCreateLib";

export interface PickedAsset {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  fileSize?: number | null;
}

interface Props {
  section: RcaSection;
  index: number;
  count: number;
  answer: SectionAnswer;
  /** Photos across the whole RCA — the overall limit. */
  totalPhotos: number;
  offline: boolean;
  onText: (text: string) => void;
  /** Returns plain-language notes about photos that weren't added. */
  onPhotosPicked: (assets: PickedAsset[]) => string[];
  onCaption: (photoId: string, caption: string) => void;
  onRemovePhoto: (photoId: string) => void;
  onRetryPhoto: (photoId: string) => void;
}

const tap = () => Haptics.selectionAsync().catch(() => {});
const toAsset = (a: ImagePicker.ImagePickerAsset): PickedAsset => ({
  uri: a.uri,
  mimeType: a.mimeType,
  fileName: a.fileName,
  fileSize: a.fileSize,
});

export default function RcaCreateSectionStep({
  section,
  index,
  count,
  answer,
  totalPhotos,
  offline,
  onText,
  onPhotosPicked,
  onCaption,
  onRemovePhoto,
  onRetryPhoto,
}: Props) {
  const s = useStyles();
  const [pickNotes, setPickNotes] = useState<string[]>([]);
  const [picking, setPicking] = useState(false);

  const required = isSectionRequired(section);
  const asksText = sectionAsksText(section);
  const asksPhotos = sectionAsksPhotos(section);
  const slots = photoSlots(answer.photos.length, totalPhotos);

  const pick = async (source: "camera" | "gallery") => {
    if (picking) return;
    tap();
    setPickNotes([]);
    if (slots === 0) {
      setPickNotes([
        answer.photos.length >= PHOTOS_PER_SECTION
          ? `You can add up to ${PHOTOS_PER_SECTION} photos in each section.`
          : `An RCA can have up to ${PHOTOS_TOTAL} photos in total.`,
      ]);
      return;
    }
    setPicking(true);
    try {
      let result: ImagePicker.ImagePickerResult;
      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (perm.status !== "granted") {
          setPickNotes(["Allow camera access in your phone's Settings to take a photo."]);
          return;
        }
        // No crop step and a 0.7 JPEG quality, like every other photo in the app:
        // it keeps uploads small on site connections and under the 5 MB limit.
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          quality: 0.7,
        });
      } else {
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          allowsEditing: false,
          allowsMultipleSelection: slots > 1,
          selectionLimit: slots,
          quality: 0.7,
        });
      }
      if (result.canceled) return;
      setPickNotes(onPhotosPicked(result.assets.map(toAsset)));
    } catch {
      setPickNotes([
        source === "camera"
          ? "We couldn't open the camera. Please try again."
          : "We couldn't open your photos. Please try again.",
      ]);
    } finally {
      setPicking(false);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={s.progressRow}>
        <Text style={s.counter}>
          Section {index + 1} of {count}
        </Text>
        <StepDots count={count} index={index} />
      </View>

      <Text style={s.eyebrow}>{section.title}</Text>
      <Text style={s.title} accessibilityRole="header">
        {section.prompt || section.title}
      </Text>
      {section.help ? <Text style={s.help}>{section.help}</Text> : null}
      <Text style={required ? s.required : s.optional}>{required ? "Required" : "Optional"}</Text>

      {asksText ? (
        <View style={{ marginTop: 18 }}>
          <TextField
            placeholder="Type your answer"
            value={answer.text}
            onChangeText={onText}
            multiline
            minHeight={150}
            maxLength={SECTION_TEXT_MAX}
            accessibilityLabel={section.title}
          />
          {answer.text.length >= SECTION_TEXT_MAX - 500 ? (
            <Text style={s.count}>
              {answer.text.length.toLocaleString("en-US")} / {SECTION_TEXT_MAX.toLocaleString("en-US")}
            </Text>
          ) : null}
          <PolishButton value={answer.text} onChange={onText} offline={offline} />
        </View>
      ) : null}

      {asksPhotos ? (
        <View style={{ marginTop: asksText ? 24 : 18 }}>
          <View style={s.photosHead}>
            <FieldLabel label={asksText ? "Photos (optional)" : "Photos"} required={!asksText && required} />
            <Text style={s.photoCount}>
              {answer.photos.length} of {PHOTOS_PER_SECTION}
            </Text>
          </View>

          {answer.photos.map((p, i) => (
            <PhotoRow
              key={p.id}
              photo={p}
              position={i + 1}
              onCaption={(c) => onCaption(p.id, c)}
              onRemove={() => onRemovePhoto(p.id)}
              onRetry={() => onRetryPhoto(p.id)}
            />
          ))}

          <View style={s.addRow}>
            <AddButton
              icon="bx-camera"
              label="Take photo"
              onPress={() => void pick("camera")}
              disabled={slots === 0 || picking || offline}
            />
            <AddButton
              icon="bx-image-add"
              label="From gallery"
              onPress={() => void pick("gallery")}
              disabled={slots === 0 || picking || offline}
            />
          </View>
          <Text style={s.hint}>JPG or PNG photos, up to 5 MB each.</Text>
          {pickNotes.map((n) => (
            <InlineError key={n} text={n} style={{ marginTop: 8 }} />
          ))}
          {offline ? <InlineError text="You're offline. Photos can't be uploaded right now." style={{ marginTop: 8 }} /> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

/* ── Photo row ───────────────────────────────────────────────────────────── */

function PhotoRow({
  photo,
  position,
  onCaption,
  onRemove,
  onRetry,
}: {
  photo: PhotoItem;
  position: number;
  onCaption: (c: string) => void;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const s = useStyles();
  const t = useJoTheme();
  const failed = photo.status === "failed";
  return (
    <View style={[s.photoRow, failed && { borderColor: t.bad }]}>
      <View style={s.thumbWrap}>
        <Image
          source={{ uri: photo.localUri }}
          style={s.thumb}
          accessibilityIgnoresInvertColors
          accessibilityLabel={`Photo ${position}`}
        />
        {photo.status === "uploading" ? (
          <View style={s.thumbOverlay}>
            <ActivityIndicator color={t.onAccent} />
          </View>
        ) : null}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <TextField
          placeholder="Caption (optional)"
          value={photo.caption}
          onChangeText={onCaption}
          maxLength={CAPTION_MAX}
          returnKeyType="done"
          accessibilityLabel={`Caption for photo ${position}`}
        />
        <View style={s.statusRow}>
          {photo.status === "uploading" ? (
            <Text style={s.statusText}>Uploading…</Text>
          ) : failed ? (
            <>
              <Bx name="bx-error-circle" size={14} color={t.bad} />
              <Text style={[s.statusText, { color: t.bad }]}>Upload failed</Text>
              <TouchableOpacity
                onPress={onRetry}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={`Retry uploading photo ${position}`}
              >
                <Text style={s.retry}>Retry</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Bx name="bx-check" size={14} color={t.ok} />
              <Text style={s.statusText}>Uploaded</Text>
            </>
          )}
        </View>
      </View>
      <TouchableOpacity
        onPress={onRemove}
        hitSlop={8}
        style={s.removeBtn}
        accessibilityRole="button"
        accessibilityLabel={`Remove photo ${position}`}
      >
        <Bx name="bx-trash" size={17} color={t.ink2} />
      </TouchableOpacity>
    </View>
  );
}

function AddButton({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: "bx-camera" | "bx-image-add";
  label: string;
  onPress: () => void;
  disabled: boolean;
}) {
  const s = useStyles();
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      style={[s.addBtn, disabled && { opacity: 0.45 }]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <Bx name={icon} size={19} color={t.accentInk} />
      <Text style={s.addText}>{label}</Text>
    </TouchableOpacity>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
    paddingHorizontal: 4,
  },
  counter: { ...f.t(12, 600, 0.04), textTransform: "uppercase", color: t.muted },
  eyebrow: { ...f.t(12.5, 600), color: t.accentInk, paddingHorizontal: 4, marginBottom: 6 },
  title: { ...f.d(24, -0.02, 1.18), color: t.ink, paddingHorizontal: 4 },
  help: { ...f.t(14), lineHeight: 20, color: t.muted, marginTop: 8, paddingHorizontal: 4 },
  optional: {
    alignSelf: "flex-start",
    marginTop: 10,
    marginLeft: 4,
    ...f.t(11, 600),
    color: t.ink2,
    backgroundColor: t.muteTint,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
    overflow: "hidden",
  },
  required: {
    alignSelf: "flex-start",
    marginTop: 10,
    marginLeft: 4,
    ...f.t(11, 600),
    color: t.accentInk,
    backgroundColor: t.accentTint,
    paddingVertical: 3,
    paddingHorizontal: 9,
    borderRadius: 99,
    overflow: "hidden",
  },
  count: { ...f.t(11.5), color: t.muted, textAlign: "right", marginTop: 6 },

  photosHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8, paddingHorizontal: 4 },
  photoCount: { ...f.t(12), color: t.muted },
  photoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 10,
    marginBottom: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: t.cardBorder,
    backgroundColor: t.card,
  },
  thumbWrap: { width: 64, height: 64, borderRadius: 14, overflow: "hidden", backgroundColor: t.track },
  thumb: { width: 64, height: 64 },
  thumbOverlay: {
    ...({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 } as const),
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6, paddingHorizontal: 2 },
  statusText: { ...f.t(11.5), color: t.muted },
  retry: { ...f.t(12, 700), color: t.accentInk, marginLeft: 6 },
  removeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: t.raised,
    alignItems: "center",
    justifyContent: "center",
  },

  addRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  addBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 52,
    borderRadius: 20,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: t.lineStrong,
    backgroundColor: t.raised,
  },
  addText: { ...f.t(13.5, 600), color: t.ink },
  hint: { ...f.t(12), color: t.muted, marginTop: 8, paddingHorizontal: 4 },
}));
