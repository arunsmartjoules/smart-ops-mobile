/**
 * One checklist task on the PM execution screen — artboard `v_pxTasks`
 * (app.dc.html 676–692): a 28px tri-state box (Done → Not Done → clear),
 * the task name with a red asterisk when something on it is mandatory, a
 * round camera chip, then the reading + remarks fields indented under the
 * name. Behaviour (reading nudge, merged Number/Text value box, locks,
 * required-field outlines) is unchanged from the previous TaskRow.
 */
import React, { useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { Bx } from "@/components/jo/Bx";
import { Shimmer, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { pmChecklistItems } from "@/database";

export type PMChecklistItemRow = typeof pmChecklistItems.$inferSelect;

export interface PMResponse {
  response_value: string | null;
  readings: string | null;
  remarks: string | null;
  image_url: string | null;
}

/**
 * Editable fields on a checklist response. `"value"` is the merged
 * reading+response used by Number/Text tasks: one box writes both columns, so
 * the row counts as answered (backend completion requires `response_value`)
 * while the server still gets its `readings` value.
 */
export type ResponseField = "response_value" | "remarks" | "readings" | "value";

/** Checklist row image: menu, direct camera/library, or null to remove */
export type ChecklistImageAction = "MENU" | "CAMERA" | "LIBRARY" | null;

// The checklist box cycles through these three states on tap, matching the
// artboard's NEXT map: unanswered → Done → Not Done → unanswered.
const CYCLE_NEXT: Record<string, string | null> = {
  "": "Done",
  Done: "Not Done",
  "Not Done": null,
};

/** "IMG_1234.jpg · queued" style caption under a task photo. */
const photoCaption = (url: string) => {
  const name = (url.split("?")[0] || "").split("/").pop() || "photo.jpg";
  const trimmed = name.length > 26 ? `${name.slice(0, 23)}…` : name;
  const isLocal = !/^https?:/i.test(url);
  return isLocal ? `${trimmed} · queued` : trimmed;
};

const useStyles = makeJoStyles((t) => ({
  card: {
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  top: { flexDirection: "row", gap: 12 },
  boxHit: { alignSelf: "flex-start" },
  box: {
    width: 28,
    height: 28,
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  nameHit: { flex: 1, minWidth: 0 },
  name: { ...f.t(13.5, 500), color: t.ink, lineHeight: 18.2, paddingTop: 4 },
  cam: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderWidth: 1,
    borderColor: "transparent",
  },
  inputs: { flexDirection: "row", gap: 6, marginTop: 10, paddingLeft: 40 },
  field: {
    height: 40,
    borderRadius: 12,
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
  },
  readingField: { width: 104, flexShrink: 0 },
  wideField: { flex: 1, minWidth: 0 },
  readingInput: {
    ...f.t(13, 600),
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: t.ink,
  },
  remarksInput: {
    ...f.t(12.5),
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    color: t.ink,
  },
  nudge: { ...f.t(11.5, 600), color: t.bad, marginTop: 6, paddingLeft: 40 },
  photoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    paddingLeft: 40,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: "hidden",
    backgroundColor: t.raised,
    borderWidth: 1,
    borderColor: t.lineMid,
  },
  caption: { ...f.t(11.5), color: t.muted, flex: 1 },
}));

export const PMTaskRow = React.memo(
  ({
    item,
    response,
    onResponseChange,
    onImageChange,
    onPreview,
    isUploading,
    answerLocked,
    textLocked,
    imageRequired,
    showRequiredErrors,
    missingEvidenceImage,
    missingRemarks,
    missingResponse,
    missingReadings,
  }: {
    item: PMChecklistItemRow;
    response?: PMResponse;
    onResponseChange: (
      itemId: string,
      field: ResponseField,
      value: string | null,
    ) => void;
    onImageChange: (itemId: string, action: ChecklistImageAction) => void;
    onPreview: (uri: string) => void;
    isUploading?: boolean;
    /** Checkbox + photo are frozen (PM signed off, or edits gated off). */
    answerLocked?: boolean;
    /** Readings + remarks are frozen. A Completed PM leaves these editable. */
    textLocked?: boolean;
    /** The task's photo is enforced for completion (drives the asterisk). */
    imageRequired?: boolean;
    showRequiredErrors?: boolean;
    missingEvidenceImage?: boolean;
    missingRemarks?: boolean;
    missingResponse?: boolean;
    missingReadings?: boolean;
  }) => {
    const t = useJoTheme();
    const s = useStyles();
    const value = response?.response_value || null;
    const fieldType = item.field_type || "Multiple Choice";
    const isChoice = fieldType === "Multiple Choice";
    // Free-text/number tasks have no Done/Not-Done vocabulary — the box just
    // reflects "answered" for them.
    const isDone = isChoice ? value === "Done" : !!value;
    const isNotDone = isChoice && value === "Not Done";
    // Number/Text tasks have ONE value box, and it is the reading: it writes
    // both `readings` and `response_value` (the backend rejects completion
    // while any row has no response_value; the server reads `readings`).
    // Multiple-Choice rows keep an optional reading box, required only when
    // the checklist marks the task readings_mandatory.
    const readingsRequired = isChoice ? Boolean(item.readings_mandatory) : true;
    // Legacy rows stored the measurement in response_value only — fall back to
    // it so an already-answered task still shows its value in the merged box.
    const readingsValue = isChoice
      ? response?.readings || ""
      : response?.readings || response?.response_value || "";
    // Read-only rows can't be fixed, so don't paint them red.
    const isReadingsMissing =
      readingsRequired && !readingsValue.trim() && !textLocked;
    const hasPhoto = !!response?.image_url;
    const required =
      readingsRequired || Boolean(item.remarks_mandatory) || !!imageRequired;
    const rowHasError = Boolean(
      showRequiredErrors &&
        (missingResponse ||
          isReadingsMissing ||
          missingReadings ||
          missingRemarks ||
          missingEvidenceImage),
    );

    // Artboard box: accent fill when Done, BAD outline + tint when Not Done,
    // a quiet outline when still unanswered.
    const boxStyle = isDone
      ? { backgroundColor: t.accent, borderColor: t.accent }
      : isNotDone
        ? { backgroundColor: t.badTint, borderColor: t.bad }
        : { backgroundColor: "transparent", borderColor: t.disabled };

    // Set when the operator tried to tick the task with its required reading
    // still blank — shows the hint until a reading is typed.
    const [readingNudge, setReadingNudge] = useState(false);
    const readingsInputRef = useRef<TextInput>(null);

    const cycleResponse = () => {
      if (answerLocked || !isChoice) return;
      const nextValue = CYCLE_NEXT[value ?? ""] ?? null;
      // A task with a mandatory reading can't be ticked Done until the reading
      // is entered — take the operator straight to the field instead.
      if (nextValue === "Done" && readingsRequired && !readingsValue.trim()) {
        Haptics.notificationAsync(
          Haptics.NotificationFeedbackType.Warning,
        ).catch(() => {});
        setReadingNudge(true);
        if (!textLocked) readingsInputRef.current?.focus();
        return;
      }
      onResponseChange(item.id, "response_value", nextValue);
    };
    const showReadingNudge =
      readingNudge && readingsRequired && !readingsValue.trim();

    const onCameraPress = () => {
      // Completed PMs are preview-only — never re-open the add/replace menu
      // once the instance is signed off.
      if (answerLocked) {
        if (hasPhoto) onPreview(response!.image_url!);
        return;
      }
      onImageChange(item.id, "MENU");
    };

    const cardBorder = rowHasError
      ? t.bad
      : isNotDone
        ? t.badBorder
        : t.cardBorder;

    return (
      <View style={[s.card, { borderColor: cardBorder }]}>
        <View style={s.top}>
          {/* The hit area extends past the 28px box — it was too small to hit
              reliably with gloves or on the move. */}
          <TouchableOpacity
            onPress={cycleResponse}
            disabled={answerLocked || !isChoice}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 12, right: 6 }}
            accessibilityRole="checkbox"
            accessibilityState={{
              checked: isNotDone ? "mixed" : isDone,
              disabled: !!answerLocked || !isChoice,
            }}
            accessibilityLabel={`${item.task_name} — ${value || "not answered"}`}
            style={s.boxHit}
          >
            <View
              style={[
                s.box,
                boxStyle,
                showRequiredErrors && missingResponse && { borderColor: t.bad },
              ]}
            >
              {isNotDone ? (
                <Bx name="bx-x" size={18} color={t.bad} />
              ) : isDone ? (
                <Bx name="bx-check" size={18} color={t.onAccent} />
              ) : null}
            </View>
          </TouchableOpacity>

          {/* Tapping the task name ticks it too — a far bigger target. */}
          <TouchableOpacity
            onPress={cycleResponse}
            disabled={answerLocked || !isChoice}
            activeOpacity={0.6}
            accessible={false}
            style={s.nameHit}
          >
            <Text style={s.name}>
              {item.task_name}
              {required ? <Text style={{ color: t.bad }}> *</Text> : null}
            </Text>
          </TouchableOpacity>

          {isUploading ? (
            <View style={[s.cam, { backgroundColor: t.raised }]}>
              <ActivityIndicator size="small" color={t.muted} />
            </View>
          ) : (
            <TouchableOpacity
              onPress={onCameraPress}
              disabled={answerLocked && !hasPhoto}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={hasPhoto ? "Task photo, view or replace" : "Add task photo"}
              style={[
                s.cam,
                { backgroundColor: hasPhoto ? t.okTint : t.raised },
                showRequiredErrors &&
                  missingEvidenceImage && { borderColor: t.bad },
                answerLocked && !hasPhoto && { opacity: 0.5 },
              ]}
            >
              <Bx name="bx-camera" size={16} color={hasPhoto ? t.ok : t.muted} />
            </TouchableOpacity>
          )}
        </View>

        <View style={s.inputs}>
          {/* Readings — the single value box for Number/Text tasks. A
              required-but-empty field is outlined in red on sight, not only
              after a blocked completion. */}
          <View
            style={[
              s.field,
              isChoice || fieldType === "Number" ? s.readingField : s.wideField,
              isReadingsMissing && { borderColor: t.bad },
            ]}
          >
            <TextInput
              ref={readingsInputRef}
              value={readingsValue}
              onChangeText={(val) =>
                onResponseChange(item.id, isChoice ? "readings" : "value", val)
              }
              editable={!textLocked}
              placeholder={readingsRequired ? "Required" : "Reading"}
              placeholderTextColor={t.faint}
              keyboardType={
                isChoice || fieldType === "Number" ? "decimal-pad" : "default"
              }
              accessibilityLabel={`Reading for ${item.task_name}${readingsRequired ? ", required" : ""}`}
              style={s.readingInput}
            />
          </View>

          <View
            style={[
              s.field,
              s.wideField,
              showRequiredErrors && missingRemarks && { borderColor: t.bad },
            ]}
          >
            <TextInput
              value={response?.remarks || ""}
              onChangeText={(val) =>
                onResponseChange(item.id, "remarks", val || null)
              }
              editable={!textLocked}
              placeholder={item.remarks_mandatory ? "Reason required" : "Remarks"}
              placeholderTextColor={t.faint}
              accessibilityLabel={`Remarks for ${item.task_name}${item.remarks_mandatory ? ", required" : ""}`}
              style={s.remarksInput}
            />
          </View>
        </View>

        {showReadingNudge ? (
          <Text style={s.nudge}>Enter the reading before ticking this task.</Text>
        ) : null}

        {hasPhoto ? (
          <View style={s.photoRow}>
            <TouchableOpacity
              onPress={() => onPreview(response!.image_url!)}
              style={s.thumb}
              activeOpacity={0.8}
              accessibilityRole="imagebutton"
              accessibilityLabel="Preview task photo"
            >
              <Image
                source={{ uri: response!.image_url! }}
                style={{ width: "100%", height: "100%" }}
              />
            </TouchableOpacity>
            <Text style={s.caption} numberOfLines={1}>
              {photoCaption(response!.image_url!)}
            </Text>
            {!answerLocked ? (
              <TouchableOpacity
                onPress={() => onImageChange(item.id, null)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
              >
                <Bx name="bx-x" size={16} color={t.muted} />
              </TouchableOpacity>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  },
  (prev, next) =>
    prev.item.id === next.item.id &&
    prev.response?.response_value === next.response?.response_value &&
    prev.response?.readings === next.response?.readings &&
    prev.response?.remarks === next.response?.remarks &&
    prev.response?.image_url === next.response?.image_url &&
    prev.isUploading === next.isUploading &&
    prev.answerLocked === next.answerLocked &&
    prev.textLocked === next.textLocked &&
    prev.imageRequired === next.imageRequired &&
    prev.showRequiredErrors === next.showRequiredErrors &&
    prev.missingResponse === next.missingResponse &&
    prev.missingReadings === next.missingReadings &&
    prev.missingRemarks === next.missingRemarks &&
    prev.missingEvidenceImage === next.missingEvidenceImage,
);

PMTaskRow.displayName = "PMTaskRow";

/** Loading placeholder shaped like the task cards. */
export function PMChecklistSkeleton() {
  return (
    <View style={{ paddingHorizontal: 16, paddingTop: 4, gap: 8 }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <Shimmer height={76} radius={20} style={{ flex: 1 }} />
        <Shimmer height={76} radius={20} style={{ flex: 1 }} />
      </View>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <Shimmer key={i} height={112} radius={22} />
      ))}
    </View>
  );
}
