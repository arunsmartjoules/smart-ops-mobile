/**
 * One question per screen for whatever the RCA report left unclear. The
 * Recommended option is already selected, so most questions are a single tap
 * on Next.
 */
import React, { useEffect, useMemo, useRef } from "react";
import { ScrollView, Text, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { IncMultiPicker, IncPicker, TextField } from "./IncFields";
import type { SelectOption } from "@/components/SearchableSelect";
import type {
  RcaAssetCandidate,
  RcaFields,
  RcaQuestion,
} from "@/services/RcaImportService";
import { DateTimeTiles, Notice, OptionCard, StepDots } from "./RcaImportParts";
import { parseLocal } from "./rcaImportLib";
import { incidentAssets, toggleAsset } from "@/utils/incidentAssets";

interface Props {
  question: RcaQuestion;
  index: number;
  count: number;
  fields: RcaFields;
  setField: <K extends keyof RcaFields>(field: K, value: RcaFields[K]) => void;
  /** Ranked matches for the chosen site (asset questions). */
  assetCandidates: RcaAssetCandidate[];
  /** People the report names, matched to the chosen site's users (user questions). */
  personCandidates: RcaAssetCandidate[];
  /** Everyone at the chosen site — "Search all people". */
  peopleOptions: SelectOption[];
  /** Remote "search all assets" results for the chosen site. */
  assetSearchOptions: SelectOption[];
  assetsLoading: boolean;
  assetSearch: string;
  onAssetSearch: (q: string) => void;
}

const MAX_CANDIDATES = 6;

export default function RcaQuestionStep({
  question,
  index,
  count,
  fields,
  setField,
  assetCandidates,
  personCandidates,
  peopleOptions,
  assetSearchOptions,
  assetsLoading,
  assetSearch,
  onAssetSearch,
}: Props) {
  const styles = useStyles();
  const t = useJoTheme();
  const value = fields[question.field];

  // Asset / person: pre-select the recommended match when nothing is chosen
  // yet (including after the site answer changed and cleared it).
  const picksFrom = question.kind === "asset" || question.kind === "user";
  // A server that marks the asset question `multiple` takes several assets;
  // without the flag it is the single pick it always was.
  const multiAsset = question.kind === "asset" && !!question.multiple;
  const singlePick = picksFrom && !multiAsset;
  const pickField = question.kind === "user" ? "assigned_to" : "asset_location";
  const candidates = question.kind === "user" ? personCandidates : assetCandidates;
  const picked = singlePick ? ((fields[pickField] as string | null) ?? "") : "";
  const recommendedPick = candidates.find((a) => a.recommended)?.value;
  useEffect(() => {
    if (!singlePick) return;
    if (!picked && recommendedPick) setField(pickField, recommendedPick);
  }, [singlePick, pickField, picked, recommendedPick, setField]);

  // Several assets: everything picked so far, primary first.
  const pickedAssets = multiAsset ? incidentAssets(fields) : [];
  const pickedAssetCount = pickedAssets.length;
  // Pre-select the recommended asset once per site — not again after the
  // person has deliberately un-ticked everything to choose others.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!multiAsset) return;
    const key = `${question.id}:${fields.site_code}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    if (pickedAssetCount === 0 && recommendedPick) setField("asset_locations", [recommendedPick]);
  }, [multiAsset, question.id, fields.site_code, pickedAssetCount, recommendedPick, setField]);

  const shownCandidates = useMemo(() => candidates.slice(0, MAX_CANDIDATES), [candidates]);
  const pickedOutsideList = singlePick && !!picked && !shownCandidates.some((a) => a.value === picked);
  const assetsOutsideList = pickedAssets.filter((v) => !shownCandidates.some((a) => a.value === v));
  const pickedLabel =
    question.kind === "user"
      ? (peopleOptions.find((o) => o.value === picked)?.label ?? picked)
      : picked;

  const datetimeFallback =
    question.kind === "datetime" && question.default && !parseLocal(question.default)
      ? question.default
      : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.progressRow}>
        <Text style={styles.counter}>
          Question {index + 1} of {count}
        </Text>
        <StepDots count={count} index={index} />
      </View>

      <Text style={styles.title} accessibilityRole="header">
        {question.title}
      </Text>
      {question.help ? <Text style={styles.help}>{question.help}</Text> : null}
      {!question.required ? <Text style={styles.optional}>Optional</Text> : null}

      <View style={{ marginTop: 18 }}>
        {question.kind === "choice"
          ? (question.options ?? []).map((o) => (
              <OptionCard
                key={o.value}
                label={o.label}
                hint={o.hint}
                recommended={o.recommended}
                selected={value === o.value}
                onPress={() => setField(question.field, o.value as never)}
              />
            ))
          : null}

        {multiAsset ? (
          <>
            {shownCandidates.length === 0 ? (
              <Notice icon="bx-search" style={{ marginBottom: 14 }}>
                We couldn&apos;t match the equipment automatically. Search for it below.
              </Notice>
            ) : (
              <Text style={styles.listLabel}>Best matches · tick all that apply</Text>
            )}
            {assetsOutsideList.map((v) => (
              <OptionCard
                key={`picked:${v}`}
                multi
                label={v}
                hint="Chosen from the asset list"
                badge="Your pick"
                selected
                onPress={() => setField("asset_locations", pickedAssets.filter((a) => a !== v))}
              />
            ))}
            {shownCandidates.map((a) => (
              <OptionCard
                key={a.value}
                multi
                label={a.label}
                hint={a.hint}
                recommended={a.recommended}
                selected={pickedAssets.includes(a.value)}
                onPress={() => setField("asset_locations", toggleAsset(pickedAssets, a.value))}
              />
            ))}
            <View style={{ marginTop: 8 }}>
              <IncMultiPicker
                label="Not in the list?"
                sheetTitle="Affected assets"
                trigger="button"
                placeholder="Search all assets at this site"
                options={assetSearchOptions}
                values={pickedAssets}
                onChange={(v) => setField("asset_locations", v)}
                loading={assetsLoading}
                searchPlaceholder="Search assets..."
                emptyMessage={assetsLoading ? "Searching…" : "No assets found"}
                searchValue={assetSearch}
                onSearchChange={onAssetSearch}
                remoteSearch
              />
            </View>
            {pickedAssetCount > 0 ? (
              <Text style={styles.pickedNote} accessibilityLiveRegion="polite">
                {pickedAssetCount === 1
                  ? `1 asset selected: ${pickedAssets[0]}.`
                  : `${pickedAssetCount} assets selected. ${pickedAssets[0]} is the main one.`}
              </Text>
            ) : null}
          </>
        ) : picksFrom ? (
          <>
            {shownCandidates.length === 0 ? (
              <Notice icon={question.kind === "user" ? "bx-user" : "bx-search"} style={{ marginBottom: 14 }}>
                {question.kind === "user"
                  ? "We couldn't match a person automatically. Search for them below."
                  : "We couldn't match the equipment automatically. Search for it below."}
              </Notice>
            ) : (
              <Text style={styles.listLabel}>Best matches</Text>
            )}
            {pickedOutsideList ? (
              <OptionCard
                label={pickedLabel}
                hint={question.kind === "user" ? "Chosen from the site's people" : "Chosen from the asset list"}
                badge="Your pick"
                selected
                onPress={() => {}}
              />
            ) : null}
            {shownCandidates.map((a) => (
              <OptionCard
                key={a.value}
                label={a.label}
                hint={a.hint}
                recommended={a.recommended}
                selected={picked === a.value}
                onPress={() => setField(pickField, a.value)}
              />
            ))}
            <View style={{ marginTop: 8 }}>
              {question.kind === "user" ? (
                <IncPicker
                  label="Not in the list?"
                  placeholder="Search all people at this site"
                  options={peopleOptions}
                  value=""
                  onChange={(v) => setField("assigned_to", v)}
                  searchPlaceholder="Search people..."
                  emptyMessage="No people found for this site"
                />
              ) : (
                <IncPicker
                  label="Not in the list?"
                  placeholder="Search all assets at this site"
                  options={assetSearchOptions}
                  value=""
                  onChange={(v) => setField("asset_location", v)}
                  loading={false}
                  searchPlaceholder="Search assets..."
                  emptyMessage={assetsLoading ? "Searching…" : "No assets found"}
                  searchValue={assetSearch}
                  onSearchChange={onAssetSearch}
                  remoteSearch
                />
              )}
            </View>
          </>
        ) : null}

        {question.kind === "datetime" ? (
          <DateTimeTiles
            large
            value={(value as string | null) ?? null}
            fallbackDate={datetimeFallback}
            onChange={(v) => setField(question.field, v as never)}
          />
        ) : null}

        {question.kind === "text" ? (
          <TextField
            placeholder="Type your answer"
            value={(value as string | null) ?? ""}
            onChangeText={(v) => setField(question.field, v as never)}
            multiline
            minHeight={120}
            accessibilityLabel={question.title}
          />
        ) : null}
      </View>

      {question.kind === "choice" && (question.options ?? []).some((o) => o.recommended) ? (
        <View style={styles.aiNote}>
          <Bx name="bxs-magic-wand" size={13} color={t.muted} />
          <Text style={styles.aiNoteText}>
            We picked the Recommended answer from the report. Tap another one to change it.
          </Text>
        </View>
      ) : null}
    </ScrollView>
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
  listLabel: { ...f.t(12, 600, 0.04), textTransform: "uppercase", color: t.muted, marginBottom: 8, paddingHorizontal: 4 },
  pickedNote: { ...f.t(12.5), lineHeight: 18, color: t.muted, marginTop: 10, paddingHorizontal: 4 },
  aiNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6, paddingHorizontal: 4 },
  aiNoteText: { ...f.t(12), flex: 1, lineHeight: 17, color: t.muted },
}));
