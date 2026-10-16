/**
 * One question per screen for whatever the RCA report left unclear. The
 * Recommended option is already selected, so most questions are a single tap
 * on Next.
 */
import React, { useEffect, useMemo } from "react";
import { ScrollView, Text, View } from "react-native";
import { Search, Sparkles, UserSearch } from "lucide-react-native";
import { makeThemedStyles, useDs } from "@/hooks/useDs";
import FullscreenPicker from "@/components/FullscreenPicker";
import { Field } from "@/components/tickets/TicketDetailUI";
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
  const ds = useDs();
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
              <Notice icon={question.kind === "user" ? UserSearch : Search} style={{ marginBottom: 14 }}>
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
                <FullscreenPicker
                  label="Not in the list?"
                  placeholder="Search all people at this site"
                  options={peopleOptions}
                  value=""
                  onChange={(v) => setField("assigned_to", v)}
                  searchPlaceholder="Search people..."
                  emptyMessage="No people found for this site"
                />
              ) : (
                <FullscreenPicker
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
          <Field
            placeholder="Type your answer"
            value={(value as string | null) ?? ""}
            onChangeText={(v) => setField(question.field, v as never)}
            multiline
            textAlignVertical="top"
            minHeight={120}
            accessibilityLabel={question.title}
          />
        ) : null}
      </View>

      {question.kind === "choice" && (question.options ?? []).some((o) => o.recommended) ? (
        <View style={styles.aiNote}>
          <Sparkles size={12} color={ds.carbon[500]} strokeWidth={2} />
          <Text style={styles.aiNoteText}>
            We picked the Recommended answer from the report. Tap another one to change it.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const useStyles = makeThemedStyles((ds) => ({
  body: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 18,
  },
  counter: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    color: ds.carbon[500],
  },
  title: {
    fontSize: 21,
    lineHeight: 28,
    fontWeight: "700",
    color: ds.carbon[100],
    letterSpacing: 0.1,
  },
  help: { fontSize: 14, lineHeight: 20, color: ds.carbon[500], marginTop: 8 },
  optional: {
    alignSelf: "flex-start",
    marginTop: 10,
    fontSize: 11,
    fontWeight: "600",
    color: ds.carbon[400],
    backgroundColor: ds.carbon[1000],
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 99,
    overflow: "hidden",
  },
  listLabel: {
    fontSize: 9,
    fontWeight: "600",
    letterSpacing: 1.08,
    textTransform: "uppercase",
    color: ds.carbon[500],
    marginBottom: 8,
  },
  aiNote: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 6 },
  aiNoteText: { flex: 1, fontSize: 12, lineHeight: 17, color: ds.carbon[500] },
}));
