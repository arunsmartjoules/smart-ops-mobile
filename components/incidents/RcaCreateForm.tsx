/**
 * "Create RCA": the whole form on one scrolling screen — the incident details
 * (every question as a labelled field), then the RCA itself (one block per
 * section). Validation, uploads and the Create button live in the modal; this
 * only lays the fields out and tells the modal where each one sits so it can
 * scroll to the first problem.
 */
import React from "react";
import { ScrollView, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import type { SelectOption } from "@/components/SearchableSelect";
import type { RcaSection } from "@/services/RcaCreateService";
import type { RcaFields, RcaQuestion } from "@/services/RcaImportService";
import { Panel } from "./IncFields";
import { DetailField, type AnchorRef } from "./RcaCreateFields";
import RcaCreateSectionBlock, { type PickedAsset } from "./RcaCreateSectionBlock";
import { emptyAnswer, fieldAnchor, sectionAnchor, totalPhotoCount, type AnswerMap } from "./rcaCreateLib";
import type { Dictation } from "./useRcaDictation";

interface Props {
  scrollRef: React.RefObject<ScrollView | null>;
  onScroll: (e: NativeSyntheticEvent<NativeScrollEvent>) => void;
  anchorRef: AnchorRef;
  siteLabel: string;
  fields: RcaFields;
  setField: <K extends keyof RcaFields>(field: K, value: RcaFields[K]) => void;
  /** Visible questions only (`only_if` already applied). */
  questions: RcaQuestion[];
  sections: RcaSection[];
  answers: AnswerMap;
  /** Problem text by anchor id (fieldAnchor / sectionAnchor); empty until Create was tried. */
  errors: Record<string, string>;
  assetSearchOptions: SelectOption[];
  assetsLoading: boolean;
  assetSearch: string;
  onAssetSearch: (q: string) => void;
  peopleOptions: SelectOption[];
  dictation: Dictation;
  offline: boolean;
  onText: (sectionId: string, text: string) => void;
  onPhotosPicked: (sectionId: string, assets: PickedAsset[]) => string[];
  onCaption: (sectionId: string, photoId: string, caption: string) => void;
  onRemovePhoto: (sectionId: string, photoId: string) => void;
  onRetryPhoto: (sectionId: string, photoId: string) => void;
}

export default function RcaCreateForm({
  scrollRef,
  onScroll,
  anchorRef,
  siteLabel,
  fields,
  setField,
  questions,
  sections,
  answers,
  errors,
  assetSearchOptions,
  assetsLoading,
  assetSearch,
  onAssetSearch,
  peopleOptions,
  dictation,
  offline,
  onText,
  onPhotosPicked,
  onCaption,
  onRemovePhoto,
  onRetryPhoto,
}: Props) {
  const s = useStyles();
  const t = useJoTheme();
  const total = totalPhotoCount(answers);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1 }}
      contentContainerStyle={s.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      onScroll={onScroll}
      scrollEventThrottle={16}
    >
      <Text style={s.site}>
        Site · <Text style={{ color: t.ink }}>{siteLabel}</Text>
      </Text>

      <Panel title="Incident details" style={{ marginTop: 8 }}>
        {questions.map((q) => (
          <View
            key={q.id}
            ref={anchorRef(fieldAnchor(q.field))}
            collapsable={false}
            style={s.field}
          >
            <DetailField
              question={q}
              fields={fields}
              setField={setField}
              error={errors[fieldAnchor(q.field)]}
              assetSearchOptions={assetSearchOptions}
              assetsLoading={assetsLoading}
              assetSearch={assetSearch}
              onAssetSearch={onAssetSearch}
              peopleOptions={peopleOptions}
              dictation={dictation}
              offline={offline}
            />
          </View>
        ))}
      </Panel>

      <Panel title="RCA">
        {sections.map((sec, i) => (
          <View
            key={sec.id}
            ref={anchorRef(sectionAnchor(sec.id))}
            collapsable={false}
            style={i > 0 ? s.sectionDivider : undefined}
          >
            <RcaCreateSectionBlock
              section={sec}
              index={i}
              count={sections.length}
              answer={answers[sec.id] ?? emptyAnswer()}
              totalPhotos={total}
              offline={offline}
              dictation={dictation}
              error={errors[sectionAnchor(sec.id)]}
              onText={(text) => onText(sec.id, text)}
              onPhotosPicked={(assets) => onPhotosPicked(sec.id, assets)}
              onCaption={(photoId, c) => onCaption(sec.id, photoId, c)}
              onRemovePhoto={(photoId) => onRemovePhoto(sec.id, photoId)}
              onRetryPhoto={(photoId) => onRetryPhoto(sec.id, photoId)}
            />
          </View>
        ))}
      </Panel>
    </ScrollView>
  );
}

const useStyles = makeJoStyles((t) => ({
  body: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 28 },
  site: { ...f.t(12.5), color: t.muted, paddingHorizontal: 4 },
  field: { marginTop: 18 },
  sectionDivider: { borderTopWidth: 1, borderTopColor: t.line },
}));
