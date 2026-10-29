/**
 * One question per screen for whatever the RCA report left unclear. The
 * Recommended option is already selected, so most questions are a single tap
 * on Next.
 */
import React, { useEffect, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { IncPicker, TextField } from "./IncFields";
import type { SelectOption } from "@/components/SearchableSelect";
import type {
  RcaAssetCandidate,
  RcaFields,
  RcaQuestion,
} from "@/services/RcaImportService";
import { DateTimeTiles, Notice, OptionCard, StepDots } from "./RcaImportParts";
import { parseLocal } from "./rcaImportLib";

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
  /**
   * Extra control under a free-text answer (the Create RCA flow's "Polish"
   * button). Absent in the upload flow, which renders exactly as before.
   */
  renderTextAccessory?: (args: {
    question: RcaQuestion;
    value: string;
    setValue: (next: string) => void;
  }) => React.ReactNode;
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
  renderTextAccessory,
}: Props) {
  const styles = useStyles();
  const t = useJoTheme();
  const value = fields[question.field];

  // Asset / person: pre-select the recommended match when nothing is chosen
  // yet (including after the site answer changed and cleared it).
  const picksFrom = question.kind === "asset" || question.kind === "user";
  const pickField = question.kind === "user" ? "assigned_to" : "asset_location";
  const candidates = question.kind === "user" ? personCandidates : assetCandidates;
  const picked = picksFrom ? ((fields[pickField] as string | null) ?? "") : "";
  const recommendedPick = candidates.find((a) => a.recommended)?.value;
  useEffect(() => {
    if (!picksFrom) return;
    if (!picked && recommendedPick) setField(pickField, recommendedPick);
  }, [picksFrom, pickField, picked, recommendedPick, setField]);

  const shownCandidates = useMemo(() => candidates.slice(0, MAX_CANDIDATES), [candidates]);
  const pickedOutsideList = picksFrom && !!picked && !shownCandidates.some((a) => a.value === picked);
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

        {picksFrom ? (
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
          <>
            <TextField
              placeholder="Type your answer"
              value={(value as string | null) ?? ""}
              onChangeText={(v) => setField(question.field, v as never)}
              multiline
              minHeight={120}
              accessibilityLabel={question.title}
            />
            {renderTextAccessory?.({
              question,
              value: (value as string | null) ?? "",
              setValue: (next) => setField(question.field, next as never),
            })}
          </>
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
  aiNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6, paddingHorizontal: 4 },
  aiNoteText: { ...f.t(12), flex: 1, lineHeight: 17, color: t.muted },
}));
