/**
 * Trend Sheet › Electricity entry (artboards "2 Electricity entry", "3 Reading
 * check" and "4 Factor and adjustments").
 *
 * One field per meter: today's closing reading. Yesterday's reading, the
 * multiplying factor and both adjustments are carried forward and live in a
 * sheet, off the daily form. The saving, its percentage and the target bar
 * update on every keystroke from utils/trendCalc, the same arithmetic the
 * server stores the day with.
 *
 * Three variants have no artboard and are built as fields on this screen, as
 * the spec describes them: a "units typed" block shows one "Units today"
 * field in place of the reading pair; a site with a hand typed saving gets an
 * "Electricity saved today" field and its readings become optional.
 *
 * Saving never waits for the network (services/TrendSheetService).
 */
import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { Card, PrimaryButton, f, useJoTheme } from "@/components/jo/ui";
import { FormSheet, NumberField, ReadOnlyEntry } from "@/components/sitelogs/LogsKit";
import {
  EntryActions,
  EntryFrame,
  FieldError,
  FooterPanel,
  MissingSite,
  SavingReadout,
  StatGrid,
  TextLink,
  backToHub,
  baselineLabel,
  confirmLeave,
  dayStateScreen,
  openCategory,
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
import { CALC_VERSION, meterKwh, round2 } from "@/utils/trendCalc";
import {
  dayMonthLabel,
  factorLine,
  fieldText,
  formatIndian,
  formatSigned,
  lowerThanOpeningMessage,
  openingLabel,
  parseTyped,
  previewSave,
  savingSummary,
  typedValue,
  type TrendContextBlock,
  type TrendDayView,
  type TrendSaveBlock,
  type TrendViewCategory,
} from "@/utils/trendSheet";

export default function TrendElectricity() {
  const { canEdit } = useAttendanceGate();
  if (!canEdit) return <ReadOnlyEntry what="trend sheet readings" />;
  return <ElectricityScreen />;
}

function ElectricityScreen() {
  const params = useTrendParams("/trend-electricity");
  const siteCode = params.siteCode ?? null;
  const date = safeDate(params.date);
  const day = useTrendDay(siteCode, date);

  // A background pull must not replace the day under what is being typed.
  useEffect(() => syncEngine.holdPulls("trend-entry"), []);

  if (!siteCode) return <MissingSite title="Electricity" />;
  const waiting = dayStateScreen("Electricity", date, day);
  if (waiting || !day.view) return waiting;
  const category = day.view.categories.find((c) => c.category === "electricity");
  if (!category) {
    return dayStateScreen("Electricity", date, {
      ...day,
      view: null,
      status: "error",
      error: "Electricity is not set up for this site on this day.",
    });
  }
  return <ElectricityForm view={day.view} category={category} siteCode={siteCode} />;
}

/* ── Form state ────────────────────────────────────────────────────────── */

interface BlockForm {
  /** Today's closing reading, or the day's units on a "units typed" block. */
  reading: string;
  /** Set in the sheet; null means "as carried forward". */
  opening: string | null;
  mf: string | null;
  add: string | null;
  deduct: string | null;
  /**
   * The overrides above came from an entry this phone has not sent yet. The
   * day on screen already shows them (it is a preview of that entry), so they
   * cannot be told apart from carried values by comparing; they are sent
   * again as they are, or re-saving would quietly drop a meter swap.
   */
  sticky: boolean;
}

interface Form {
  blocks: Record<string, BlockForm>;
  /** A hand typed saving (only on sites that allow it); may be negative. */
  manual: string;
}

const isUnits = (b: TrendContextBlock) => b.entry_mode === "units";

/** The form a category opens with: this phone's unsent entry when there is one, else what is stored. */
function initialForm(c: TrendViewCategory): Form {
  const blocks: Record<string, BlockForm> = {};
  for (const b of c.blocks) {
    const sent = c.draft?.blocks.find((s) => s.block_id === b.block_id);
    if (c.draft) {
      blocks[b.block_id] = {
        reading: fieldText(isUnits(b) ? sent?.quantity : sent?.final_reading),
        opening: sent?.opening_source === "typed" ? fieldText(sent.initial_reading) : null,
        mf: sent?.mf != null ? fieldText(sent.mf) : null,
        add: sent?.add_adjustment != null ? fieldText(sent.add_adjustment) : null,
        deduct: sent?.deduct_adjustment != null ? fieldText(sent.deduct_adjustment) : null,
        sticky: true,
      };
    } else {
      blocks[b.block_id] = {
        reading: b.typed === null ? "" : fieldText(isUnits(b) ? b.quantity : b.final_reading),
        opening: null,
        mf: null,
        add: null,
        deduct: null,
        sticky: false,
      };
    }
  }
  const manual = c.draft
    ? fieldText(c.draft.manual_saving)
    : c.saving_is_manual
      ? fieldText(c.saving)
      : "";
  return { blocks, manual };
}

const EMPTY_BLOCK: BlockForm = { reading: "", opening: null, mf: null, add: null, deduct: null, sticky: false };

interface BlockState {
  block: TrendContextBlock;
  form: BlockForm;
  units: boolean;
  opening: number | null;
  /** The opening reading was changed in the sheet (a meter swap), not carried forward. */
  openingTyped: boolean;
  mf: number | null;
  add: number;
  deduct: number;
  /** The typed reading or units, when it is a usable number. */
  value: number | null;
  empty: boolean;
  kwh: number | null;
  /** Why this block cannot be saved yet; null when it can. */
  error: string | null;
  /** The error is a reading below its opening: offer the meter swap link. */
  low: boolean;
  /** The block needs its opening reading or factor set in the sheet first. */
  needsSetup: boolean;
}

function blockState(block: TrendContextBlock, form: BlockForm, date: string): BlockState {
  const units = isUnits(block);
  const opening = form.opening != null ? typedValue(form.opening) : block.opening_reading;
  const mf = form.mf != null ? typedValue(form.mf) : block.mf;
  const add = form.add != null ? (typedValue(form.add) ?? 0) : block.add_adjustment;
  const deduct = form.deduct != null ? (typedValue(form.deduct) ?? 0) : block.deduct_adjustment;
  const parsed = parseTyped(form.reading);
  const value = parsed.state === "ok" ? parsed.value : null;
  const openingTyped =
    !units && form.opening != null && opening != null && (form.sticky || opening !== block.opening_reading);
  const base: BlockState = {
    block,
    form,
    units,
    opening,
    openingTyped,
    mf,
    add,
    deduct,
    value,
    empty: parsed.state === "empty",
    kwh: null,
    error: null,
    low: false,
    needsSetup: false,
  };

  if (units) {
    if (parsed.state === "empty") return { ...base, error: "Enter today’s units." };
    if (value == null) return { ...base, error: "Use numbers only, like 9800." };
    return { ...base, kwh: Math.round(value * 1000) / 1000 };
  }

  if (opening == null) {
    return { ...base, needsSetup: true, error: "This block has no earlier reading. Set its opening reading first." };
  }
  if (mf == null || mf <= 0) {
    return { ...base, needsSetup: true, error: "Set the multiplying factor first." };
  }
  if (parsed.state === "empty") return { ...base, error: "Enter today’s reading." };
  if (value == null) return { ...base, error: `Use numbers only, like ${opening.toFixed(2)}.` };
  if (value < opening) {
    return {
      ...base,
      low: true,
      error: lowerThanOpeningMessage(opening, openingTyped ? null : block.opening_date, date),
    };
  }
  return { ...base, kwh: meterKwh(opening, value, mf) };
}

/** What the server is sent for one block: readings, plus only what the user changed in the sheet. */
function blockBody(s: BlockState): TrendSaveBlock | null {
  if (s.value == null) return null;
  const { block, form } = s;
  const out: TrendSaveBlock = { block_id: block.block_id };
  if (s.units) {
    out.quantity = s.value;
  } else {
    out.final_reading = s.value;
    out.opening_source = s.openingTyped ? "typed" : "carried";
    if (s.openingTyped) out.initial_reading = s.opening;
    if (form.mf != null && s.mf != null && (form.sticky || s.mf !== block.mf)) out.mf = s.mf;
  }
  // An adjustment the user did not touch is left out, so the server carries its own forward.
  if (form.add != null && (form.sticky || s.add !== block.add_adjustment)) out.add_adjustment = s.add;
  if (form.deduct != null && (form.sticky || s.deduct !== block.deduct_adjustment)) out.deduct_adjustment = s.deduct;
  return out;
}

/* ── Screen ────────────────────────────────────────────────────────────── */

interface SheetDraft {
  blockId: string;
  /** "Save changes" was pressed with a problem: show the errors. */
  tried: boolean;
  opening: string;
  mf: string;
  add: string;
  deduct: string;
}

function ElectricityForm({
  view,
  category,
  siteCode,
}: {
  view: TrendDayView;
  category: TrendViewCategory;
  siteCode: string;
}) {
  const t = useJoTheme();
  const keyboardOpen = useKeyboardOpen();
  const date = view.date;
  const { busy, saved, dirty, isDirty, markDirty, save, refuse } = useCategorySave(siteCode, date, "electricity");

  const [form, setForm] = useEntryForm(category, isDirty, initialForm);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [sheet, setSheet] = useState<SheetDraft | null>(null);

  const manualAllowed = category.manual_allowed === true;
  const manualParsed = parseTyped(form.manual, true);
  const manual = manualAllowed && manualParsed.state === "ok" ? manualParsed.value : null;
  const manualInvalid = manualAllowed && manualParsed.state === "invalid";

  const states = category.blocks.map((b) => blockState(b, form.blocks[b.block_id] ?? EMPTY_BLOCK, date));
  // With a typed saving a block left empty is fine; one that was started must still be right.
  const optional = (s: BlockState) => manual != null && s.empty;
  const blocking = states.filter((s) => s.error && !optional(s));
  const missing = manualInvalid ? Math.max(1, blocking.length) : blocking.length;
  const fixing = blocking.some((s) => !s.empty) || manualInvalid;

  const adjustment = round2(states.reduce((sum, s) => sum + s.add - s.deduct, 0));

  const fields: TrendSaveFields = {
    blocks: states.map(blockBody).filter((b): b is TrendSaveBlock => b !== null),
    ...(manual != null ? { manual_saving: manual } : {}),
  };

  // The day as it would read once saved: the phone's twin of the server's preview.
  const preview =
    missing > 0
      ? null
      : (previewSave(view, "electricity", {
          ...fields,
          client_saved_at: "",
          calc_version: CALC_VERSION,
        }).categories.find((c) => c.category === "electricity") ?? null);

  const summary = savingSummary(preview ?? category, { missing, fixing });

  const edit = (blockId: string, patch: Partial<BlockForm>) => {
    markDirty();
    setForm((prev) => ({
      ...prev,
      blocks: { ...prev.blocks, [blockId]: { ...(prev.blocks[blockId] ?? EMPTY_BLOCK), ...patch } },
    }));
  };

  const openSheet = (s: BlockState) =>
    setSheet({
      blockId: s.block.block_id,
      tried: false,
      opening: s.form.opening ?? fieldText(s.block.opening_reading),
      mf: s.form.mf ?? fieldText(s.block.mf),
      add: s.form.add ?? (s.block.add_adjustment ? fieldText(s.block.add_adjustment) : ""),
      deduct: s.form.deduct ?? (s.block.deduct_adjustment ? fieldText(s.block.deduct_adjustment) : ""),
    });

  const onSave = () => {
    if (missing > 0) {
      // Show every problem at once; nothing is sent.
      setTouched(Object.fromEntries(category.blocks.map((b) => [b.block_id, true])));
      refuse();
      return;
    }
    void save(fields);
  };

  const sheetState = sheet ? states.find((s) => s.block.block_id === sheet.blockId) : undefined;

  return (
    <>
      <EntryFrame
        title="Electricity"
        view={view}
        current="electricity"
        onPick={(c) => confirmLeave(dirty.current, () => openCategory(siteCode, date, c, true))}
        onBack={() => confirmLeave(dirty.current, backToHub)}
        footer={
          <FooterPanel>
            <SavingReadout
              label={manual != null ? "Saved today, typed" : "Saved today"}
              summary={summary}
              unit={category.unit}
              compact={keyboardOpen}
            />
            {keyboardOpen ? null : (
              <>
                <StatGrid
                  items={[
                    {
                      label: baselineLabel(category),
                      value: category.baseline != null ? formatIndian(category.baseline) : "—",
                    },
                    { label: "Used", value: preview?.used != null ? formatIndian(preview.used) : "—" },
                    { label: "Adjustment", value: manual != null ? "Not applied" : formatSigned(adjustment) },
                  ]}
                />
                <EntryActions
                  view={view}
                  category={category}
                  siteCode={siteCode}
                  saved={saved}
                  busy={busy}
                  onSave={onSave}
                />
              </>
            )}
          </FooterPanel>
        }
      >
        {manualAllowed ? (
          <Card radius={24} style={{ padding: 16, gap: 8 }}>
            <NumberField
              label={`Electricity saved today (${category.unit})`}
              value={form.manual}
              onChangeText={(v) => {
                markDirty();
                setForm((prev) => ({ ...prev, manual: v }));
              }}
              unit={category.unit}
              placeholder="0.00"
              size="sm"
              keyboardType="numbers-and-punctuation"
              error={manualInvalid}
            />
            {manualInvalid ? <FieldError>Use numbers only. A minus sign is allowed.</FieldError> : null}
            <Text style={[f.t(12), { color: t.muted, lineHeight: 16 }]}>
              This site types its saving. It is stored as typed, and adjustments are not added to it. Meter
              readings below are optional.
            </Text>
          </Card>
        ) : null}

        {states.map((s) => (
          <BlockCard
            key={s.block.block_id}
            s={s}
            date={date}
            unit={category.unit}
            optional={optional(s)}
            showError={!!touched[s.block.block_id]}
            onChange={(v) => {
              edit(s.block.block_id, { reading: v });
              // The error clears on the first corrective keystroke.
              setTouched((prev) => ({ ...prev, [s.block.block_id]: false }));
            }}
            onBlur={() => setTouched((prev) => ({ ...prev, [s.block.block_id]: true }))}
            onOpenSheet={() => openSheet(s)}
          />
        ))}

        {category.blocks.length === 0 ? (
          <Card radius={24} style={{ padding: 16 }}>
            <Text style={[f.t(13), { color: t.muted, lineHeight: 19 }]}>
              No electricity meters are set up for this site on this day. Add them in Baseline first.
            </Text>
          </Card>
        ) : null}
      </EntryFrame>

      <BlockSheet
        draft={sheet}
        state={sheetState}
        unit={category.unit}
        onChange={(patch) => setSheet((prev) => (prev ? { ...prev, ...patch } : prev))}
        onClose={() => setSheet(null)}
        onApply={(patch) => {
          if (sheet) edit(sheet.blockId, patch);
          setSheet(null);
        }}
      />
    </>
  );
}

/* ── One meter ─────────────────────────────────────────────────────────── */

function BlockCard({
  s,
  date,
  unit,
  optional,
  showError,
  onChange,
  onBlur,
  onOpenSheet,
}: {
  s: BlockState;
  date: string;
  unit: string;
  /** The site types its saving and this block was left empty: nothing to complain about. */
  optional: boolean;
  showError: boolean;
  onChange: (v: string) => void;
  onBlur: () => void;
  onOpenSheet: () => void;
}) {
  const t = useJoTheme();
  const { block } = s;
  const typedOpening = s.openingTyped;
  // A block that cannot take a reading yet says why straight away, not only after a blur.
  const error = optional ? null : s.needsSetup ? s.error : showError ? s.error : null;
  const line = factorLine({
    mf: s.mf,
    add_adjustment: s.add,
    deduct_adjustment: s.deduct,
    entry_mode: block.entry_mode,
  });

  return (
    <Card radius={24} style={{ paddingTop: 14, paddingHorizontal: 16, paddingBottom: 2, gap: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={[f.t(16, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
          {block.name}
        </Text>
        <Text accessibilityLiveRegion="polite" style={[f.t(15, 600), { color: s.kwh != null ? t.ink : t.muted }]}>
          {s.kwh != null ? `${formatIndian(s.kwh, 0, 2)} ${unit}` : "—"}
        </Text>
      </View>

      {s.units ? (
        <NumberField
          label="Units today"
          value={s.form.reading}
          onChangeText={onChange}
          onBlur={onBlur}
          unit={unit}
          placeholder="0.00"
          size="sm"
          error={!!error}
        />
      ) : (
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
            <Text style={[f.t(12.5, 500), { color: t.ink3, paddingHorizontal: 4 }]} numberOfLines={1}>
              {typedOpening ? "Opening, typed" : openingLabel(block.opening_date, date)}
            </Text>
            <View style={{ height: 54, justifyContent: "center", paddingHorizontal: 4 }}>
              <Text style={[f.t(18, 500), { color: t.muted }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {s.opening != null ? formatIndian(s.opening) : "Not set"}
              </Text>
            </View>
          </View>
          <NumberField
            label="Today"
            value={s.form.reading}
            onChangeText={onChange}
            onBlur={onBlur}
            placeholder="0.00"
            size="sm"
            error={!!error && !s.needsSetup}
            editable={!s.needsSetup}
            style={{ flex: 1, minWidth: 0 }}
          />
        </View>
      )}

      {error ? (
        <View style={{ gap: 2 }}>
          <FieldError>{error}</FieldError>
          {s.low ? <TextLink label="Meter changed? Set opening reading" onPress={onOpenSheet} /> : null}
          {s.needsSetup ? <TextLink label="Set opening reading and factor" onPress={onOpenSheet} /> : null}
        </View>
      ) : null}

      {block.mismatch && !typedOpening ? (
        <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6 }}>
          <Bx name="bx-info-circle" size={15} color={t.warn} />
          <Text style={[f.t(12.5), { color: t.ink3, flex: 1, lineHeight: 18 }]}>
            The opening reading does not match the day before ({formatIndian(block.mismatch.expected_opening)}).
            Check both days.
          </Text>
        </View>
      ) : null}

      <TouchableOpacity
        onPress={onOpenSheet}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`Edit ${s.units ? "adjustments" : "factor and adjustments"} for ${block.name}. ${line}`}
        style={{
          minHeight: 44,
          borderTopWidth: 1,
          borderTopColor: t.line,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <Text style={[f.t(13), { color: t.muted, flexShrink: 1 }]} numberOfLines={1}>
          {line}
        </Text>
        <Bx name="bx-chevron-right" size={18} color={t.muted} />
      </TouchableOpacity>
    </Card>
  );
}

/* ── Factor and adjustments sheet ──────────────────────────────────────── */

function BlockSheet({
  draft,
  state,
  unit,
  onChange,
  onClose,
  onApply,
}: {
  draft: SheetDraft | null;
  state: BlockState | undefined;
  unit: string;
  onChange: (patch: Partial<SheetDraft>) => void;
  onClose: () => void;
  onApply: (patch: Partial<BlockForm>) => void;
}) {
  const t = useJoTheme();
  const block = state?.block;
  const units = state?.units ?? false;

  const opening = parseTyped(draft?.opening);
  const mf = parseTyped(draft?.mf);
  const add = parseTyped(draft?.add);
  const deduct = parseTyped(draft?.deduct);

  const openingError = units ? null : opening.state === "ok" ? null : "Enter the opening reading as a number.";
  const mfError = units
    ? null
    : mf.state === "ok" && mf.value > 0
      ? null
      : "Enter a multiplying factor above zero.";
  const addError = add.state === "invalid" ? "Use numbers only." : null;
  const deductError = deduct.state === "invalid" ? "Use numbers only." : null;
  const invalid = !!(openingError || mfError || addError || deductError);
  const tried = draft?.tried === true;

  const net = round2((add.state === "ok" ? add.value : 0) - (deduct.state === "ok" ? deduct.value : 0));
  const subtitle = !block
    ? undefined
    : block.carried_from
      ? `Carried forward from ${dayMonthLabel(block.carried_from)}`
      : block.typed !== null
        ? "From this day’s entry"
        : "First entry for this block";

  return (
    <FormSheet
      visible={!!draft}
      onClose={onClose}
      title={block?.name ?? "Block"}
      subtitle={subtitle}
      footer={
        <PrimaryButton
          label="Save changes"
          style={{ marginTop: 16 }}
          onPress={() => {
            if (!draft) return;
            if (invalid) {
              onChange({ tried: true });
              return;
            }
            onApply({
              ...(units ? {} : { opening: draft.opening, mf: draft.mf }),
              add: draft.add,
              deduct: draft.deduct,
            });
          }}
        />
      }
    >
      {draft ? (
        <View style={{ gap: 14, marginTop: 16 }}>
          {units ? null : (
            <>
              <View style={{ gap: 6 }}>
                <NumberField
                  label="Opening reading"
                  value={draft.opening}
                  onChangeText={(v) => onChange({ opening: v })}
                  placeholder="0.00"
                  size="sm"
                  surface="sheet"
                  error={tried && !!openingError}
                />
                {tried && openingError ? (
                  <FieldError>{openingError}</FieldError>
                ) : (
                  <Text style={[f.t(12), { color: t.muted, lineHeight: 16, paddingHorizontal: 4 }]}>
                    Yesterday’s closing reading. Change after a meter swap.
                  </Text>
                )}
              </View>
              <View style={{ gap: 6 }}>
                <NumberField
                  label="Multiplying factor"
                  value={draft.mf}
                  onChangeText={(v) => onChange({ mf: v })}
                  placeholder="1"
                  size="sm"
                  surface="sheet"
                  error={tried && !!mfError}
                />
                {tried && mfError ? <FieldError>{mfError}</FieldError> : null}
              </View>
            </>
          )}

          {/* Two plain positive numbers; the field sets the sign. */}
          <View style={{ flexDirection: "row", gap: 12 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <NumberField
                label="Add to savings"
                value={draft.add}
                onChangeText={(v) => onChange({ add: v })}
                placeholder="0.00"
                size="sm"
                surface="sheet"
                error={tried && !!addError}
              />
              {tried && addError ? <FieldError>{addError}</FieldError> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <NumberField
                label="Deduct from savings"
                value={draft.deduct}
                onChangeText={(v) => onChange({ deduct: v })}
                placeholder="0.00"
                size="sm"
                surface="sheet"
                error={tried && !!deductError}
              />
              {tried && deductError ? <FieldError>{deductError}</FieldError> : null}
            </View>
          </View>

          <View
            accessibilityLiveRegion="polite"
            style={{
              minHeight: 52,
              paddingHorizontal: 16,
              borderRadius: 16,
              backgroundColor: t.sheetField,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Text style={[f.t(14), { color: t.muted }]}>Net adjustment</Text>
            <Text style={[f.t(16, 600), { color: t.ink }]}>
              {formatSigned(net)} {unit}
            </Text>
          </View>
        </View>
      ) : null}
    </FormSheet>
  );
}
