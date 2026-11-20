/**
 * Trend Sheet › fuel entry (artboard "6 Diesel entry").
 *
 * One screen serves PNG, Diesel, LPG and Bio-Diesel with the category's own
 * unit, and Solar and Wind with units generated. One quantity per block, and
 * a "none today" choice that stores zero on purpose.
 *
 * Two variants have no artboard and are built as fields here, as the spec
 * describes them: PNG on a site billed by the hour gets a "Run hours today"
 * field (its baseline is the baseline per hour times those hours), and Solar
 * and Wind show the Electricity saving in the footer, because their units
 * count as consumption exactly as DG's do.
 */
import React, { useEffect, useState } from "react";
import { Text } from "react-native";
import { Card, f, useJoTheme } from "@/components/jo/ui";
import { NumberField, ReadOnlyEntry } from "@/components/sitelogs/LogsKit";
import {
  ChoiceToggle,
  EntryActions,
  EntryFrame,
  FieldError,
  FooterPanel,
  MissingSite,
  SavingReadout,
  StatGrid,
  backToHub,
  baselineLabel,
  confirmLeave,
  dayStateScreen,
  openCategory,
  routeForCategory,
  safeDate,
  useCategorySave,
  useEntryForm,
  useKeyboardOpen,
  useTrendDay,
  useTrendParams,
} from "@/components/trend/TrendKit";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import syncEngine from "@/services/SyncEngine";
import type { TrendSaveFields } from "@/services/TrendSheetService";
import { CALC_VERSION, type TrendCategory } from "@/utils/trendCalc";
import {
  fieldText,
  formatIndian,
  inSentence,
  parseTyped,
  previewSave,
  savingSummary,
  type TrendDayView,
  type TrendViewCategory,
} from "@/utils/trendSheet";

export default function TrendFuel() {
  const { canEdit } = useAttendanceGate();
  if (!canEdit) return <ReadOnlyEntry what="trend sheet readings" />;
  return <FuelScreen />;
}

function FuelScreen() {
  const params = useTrendParams("/trend-fuel");
  const siteCode = params.siteCode ?? null;
  const date = safeDate(params.date);
  const day = useTrendDay(siteCode, date);
  // Moving between two fuels stays on this route, so the open category is state, not a param.
  const [open, setOpen] = useState<string | undefined>(params.category);

  // A background pull must not replace the day under what is being typed.
  useEffect(() => syncEngine.holdPulls("trend-entry"), []);

  if (!siteCode) return <MissingSite title="Fuel" />;
  const waiting = dayStateScreen("Fuel", date, day);
  if (waiting || !day.view) return waiting;
  const category =
    day.view.categories.find((c) => c.category === open && routeForCategory(c) === "/trend-fuel") ??
    day.view.categories.find((c) => routeForCategory(c) === "/trend-fuel");
  if (!category) {
    return dayStateScreen("Fuel", date, {
      ...day,
      view: null,
      status: "error",
      error: "No fuel or generation category is set up for this site on this day.",
    });
  }
  return (
    <FuelForm
      // A different category is a different form: typed values never cross over.
      key={category.category}
      view={day.view}
      category={category}
      siteCode={siteCode}
      onSwitch={(c) => setOpen(c)}
    />
  );
}

interface Form {
  notUsed: boolean;
  runHours: string;
  blocks: Record<string, string>;
}

function initialForm(c: TrendViewCategory): Form {
  const blocks: Record<string, string> = {};
  for (const b of c.blocks) {
    const sent = c.draft?.blocks.find((s) => s.block_id === b.block_id);
    blocks[b.block_id] = c.draft ? fieldText(sent?.quantity) : c.entered && !c.not_used ? fieldText(b.quantity) : "";
  }
  return {
    notUsed: c.draft ? c.draft.not_used === true : c.entered && c.not_used,
    runHours: c.draft ? fieldText(c.draft.run_hours) : c.entered ? fieldText(c.run_hours) : "",
    blocks,
  };
}

function FuelForm({
  view,
  category,
  siteCode,
  onSwitch,
}: {
  view: TrendDayView;
  category: TrendViewCategory;
  siteCode: string;
  onSwitch: (category: TrendCategory) => void;
}) {
  const t = useJoTheme();
  const keyboardOpen = useKeyboardOpen();
  const date = view.date;
  const id = category.category;
  const generation = category.kind === "generation";
  const hourly = category.hourly === true;
  const name = inSentence(category.label);
  const { busy, saved, dirty, isDirty, markDirty, save, refuse } = useCategorySave(siteCode, date, id);

  const [form, setForm] = useEntryForm(category, isDirty, initialForm);
  const [touched, setTouched] = useState(false);

  const parsed = category.blocks.map((b) => ({ block: b, value: parseTyped(form.blocks[b.block_id]) }));
  const hours = parseTyped(form.runHours);
  const hoursMissing = hourly && !form.notUsed && hours.state !== "ok";
  const missing = form.notUsed ? 0 : parsed.filter((p) => p.value.state !== "ok").length + (hoursMissing ? 1 : 0);
  const fixing =
    !form.notUsed && (parsed.some((p) => p.value.state === "invalid") || (hourly && hours.state === "invalid"));
  const ready = missing === 0 && (form.notUsed || parsed.length > 0);

  const fields: TrendSaveFields = {
    not_used: form.notUsed,
    ...(hourly && !form.notUsed && hours.state === "ok" ? { run_hours: hours.value } : {}),
    blocks: form.notUsed
      ? []
      : parsed.flatMap((p) => (p.value.state === "ok" ? [{ block_id: p.block.block_id, quantity: p.value.value }] : [])),
  };

  // The day as it would read once saved: the phone's twin of the server's preview.
  const after = ready ? previewSave(view, id, { ...fields, client_saved_at: "", calc_version: CALC_VERSION }) : null;

  // A fuel shows its own saving; Solar and Wind show what they do to Electricity's.
  const own = after?.categories.find((c) => c.category === id) ?? null;
  const electricity =
    (after ?? view).categories.find((c) => c.category === "electricity") ?? null;
  const used = form.notUsed
    ? 0
    : parsed.reduce((sum, p) => sum + (p.value.state === "ok" ? p.value.value : 0), 0);

  const summary = generation
    ? electricity?.entered
      ? {
          ...savingSummary(electricity),
          note: !ready
            ? `${category.label} units count as consumption`
            : electricity.saving_is_manual
              ? `The saving is typed by hand, so ${name} does not change it`
              : used === 0
                ? `No ${name} units today. Saving unchanged`
                : `${category.label} adds ${formatIndian(used)} ${category.unit} to consumption`,
        }
      : null
    : savingSummary(own ?? category, { missing, fixing, noun: "value" });

  // Another fuel is this same route, so it is switched in place; anything else is a new screen.
  const open = (c: TrendViewCategory) => {
    if (routeForCategory(c) === "/trend-fuel") onSwitch(c.category);
    else openCategory(siteCode, date, c, true);
  };
  const pick = (c: TrendViewCategory) => confirmLeave(dirty.current, () => open(c));

  const onSave = () => {
    if (!ready) {
      setTouched(true);
      refuse();
      return;
    }
    void save(fields);
  };

  const blockError = (state: "empty" | "invalid" | "ok") =>
    state === "ok"
      ? null
      : state === "invalid"
        ? "Use numbers only, like 120.5."
        : generation
          ? `Enter the units generated, or mark that there was no ${name} today.`
          : `Enter the ${name} used, or mark that none was used.`;

  return (
    <EntryFrame
      title={category.label}
      view={view}
      current={id}
      onPick={pick}
      onBack={() => confirmLeave(dirty.current, backToHub)}
      footer={
        <FooterPanel>
          {summary ? (
            <SavingReadout
              label={
                generation
                  ? ready
                    ? `Electricity saved after ${name}`
                    : `Electricity saved, before ${name}`
                  : `${category.label} saved today`
              }
              summary={summary}
              unit={generation ? (electricity?.unit ?? category.unit) : category.unit}
              barOf={generation ? undefined : `the ${name} baseline`}
              compact={keyboardOpen}
            />
          ) : (
            <Text style={[f.t(13), { color: t.muted, lineHeight: 18 }]}>
              Electricity is not entered yet. {category.label} units are added to its consumption once it is.
            </Text>
          )}
          {keyboardOpen ? null : (
            <>
              {generation ? null : (
                <StatGrid
                  items={[
                    {
                      label: baselineLabel(own ?? category),
                      value:
                        (own ?? category).baseline != null
                          ? `${formatIndian((own ?? category).baseline as number)} ${category.unit}`
                          : "—",
                    },
                    { label: "Used", value: ready ? `${formatIndian(used)} ${category.unit}` : "—" },
                  ]}
                />
              )}
              <EntryActions
                view={view}
                category={category}
                siteCode={siteCode}
                saved={saved}
                busy={busy}
                onSave={onSave}
                onOpen={open}
              />
            </>
          )}
        </FooterPanel>
      }
    >
      {hourly ? (
        <Card radius={24} style={{ padding: 16, gap: 8 }}>
          <NumberField
            label="Run hours today"
            value={form.notUsed ? "0" : form.runHours}
            onChangeText={(v) => {
              markDirty();
              setTouched(false);
              setForm((prev) => ({ ...prev, notUsed: false, runHours: v }));
            }}
            onBlur={() => setTouched(true)}
            unit="h"
            placeholder="0.0"
            size="sm"
            editable={!form.notUsed}
            error={touched && hoursMissing}
          />
          {touched && hoursMissing ? (
            <FieldError>
              {hours.state === "invalid" ? "Use numbers only, like 6.5." : "Enter today’s run hours."}
            </FieldError>
          ) : null}
          <Text style={[f.t(12), { color: t.muted, lineHeight: 16, paddingHorizontal: 4 }]}>
            {category.baseline_per_hour != null
              ? `Today’s baseline is ${formatIndian(category.baseline_per_hour)} ${category.unit} for each hour run.`
              : "Today’s baseline is worked out from the hours run."}
          </Text>
        </Card>
      ) : null}

      {parsed.map(({ block, value }) => {
        const error = touched && !form.notUsed ? blockError(value.state) : null;
        return (
          <Card key={block.block_id} radius={24} style={{ padding: 16, gap: 10 }}>
            <Text accessibilityRole="header" style={[f.t(16, 600), { color: t.ink }]} numberOfLines={2}>
              {block.name}
            </Text>
            <NumberField
              label={generation ? "Units generated" : `${category.label} used`}
              value={form.notUsed ? "0" : (form.blocks[block.block_id] ?? "")}
              onChangeText={(v) => {
                markDirty();
                setTouched(false);
                setForm((prev) => ({ ...prev, notUsed: false, blocks: { ...prev.blocks, [block.block_id]: v } }));
              }}
              onBlur={() => setTouched(true)}
              unit={category.unit}
              placeholder="0.00"
              size="sm"
              editable={!form.notUsed}
              error={!!error}
            />
            {error ? <FieldError>{error}</FieldError> : null}
          </Card>
        );
      })}

      {category.blocks.length === 0 ? (
        <Card radius={24} style={{ padding: 16 }}>
          <Text style={[f.t(13), { color: t.muted, lineHeight: 19 }]}>
            Nothing is set up for {name} at this site on this day. Add its blocks in Baseline first.
          </Text>
        </Card>
      ) : null}

      <ChoiceToggle
        label={generation ? `No ${name} units today` : `No ${name} used today`}
        on={form.notUsed}
        onPress={() => {
          markDirty();
          setTouched(false);
          setForm((prev) => ({ ...prev, notUsed: !prev.notUsed }));
        }}
      />
    </EntryFrame>
  );
}
