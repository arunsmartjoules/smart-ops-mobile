/**
 * Trend Sheet › DG entry (artboard "5 DG entry").
 *
 * Per DG block: litres of diesel used, units generated. Enter either one and
 * the other fills in from the site's DG factor (set in Baseline); enter both
 * and both are kept as typed. "DG did not run today" is a choice the user
 * makes, never a blank field.
 *
 * DG units count as consumption, so the footer shows the ELECTRICITY saving
 * as it will be once this DG entry is in.
 */
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
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
  backToHub,
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
import { CALC_VERSION, round3 } from "@/utils/trendCalc";
import {
  fieldText,
  formatIndian,
  parseTyped,
  previewSave,
  savingSummary,
  type TrendContextBlock,
  type TrendDayView,
  type TrendSaveBlock,
  type TrendViewCategory,
} from "@/utils/trendSheet";

export default function TrendDg() {
  const { canEdit } = useAttendanceGate();
  if (!canEdit) return <ReadOnlyEntry what="trend sheet readings" />;
  return <DgScreen />;
}

function DgScreen() {
  const params = useTrendParams("/trend-dg");
  const siteCode = params.siteCode ?? null;
  const date = safeDate(params.date);
  const day = useTrendDay(siteCode, date);

  // A background pull must not replace the day under what is being typed.
  useEffect(() => syncEngine.holdPulls("trend-entry"), []);

  if (!siteCode) return <MissingSite title="DG" />;
  const waiting = dayStateScreen("DG", date, day);
  if (waiting || !day.view) return waiting;
  const category = day.view.categories.find((c) => c.category === "dg");
  if (!category) {
    return dayStateScreen("DG", date, {
      ...day,
      view: null,
      status: "error",
      error: "DG is not set up for this site on this day.",
    });
  }
  return <DgForm view={day.view} category={category} siteCode={siteCode} />;
}

interface BlockForm {
  litres: string;
  units: string;
}

interface Form {
  notUsed: boolean;
  blocks: Record<string, BlockForm>;
}

const EMPTY: BlockForm = { litres: "", units: "" };

function initialForm(c: TrendViewCategory): Form {
  const blocks: Record<string, BlockForm> = {};
  for (const b of c.blocks) {
    const sent = c.draft?.blocks.find((s) => s.block_id === b.block_id);
    blocks[b.block_id] = c.draft
      ? { litres: fieldText(sent?.litres), units: fieldText(sent?.quantity) }
      : c.entered && !c.not_used
        ? { litres: fieldText(b.litres), units: fieldText(b.quantity) }
        : EMPTY;
  }
  return { notUsed: c.draft ? c.draft.not_used === true : c.entered && c.not_used, blocks };
}

interface BlockState {
  block: TrendContextBlock;
  form: BlockForm;
  /** Litres or units as typed; null when that side is empty or not a number. */
  litres: number | null;
  units: number | null;
  /** The side that is empty and filled in from the factor, with its value. */
  litresAuto: number | null;
  unitsAuto: number | null;
  /** The block's units as they will count towards consumption. */
  kwh: number | null;
  error: string | null;
}

function blockState(block: TrendContextBlock, form: BlockForm, factor: number | null): BlockState {
  const l = parseTyped(form.litres);
  const k = parseTyped(form.units);
  const litres = l.state === "ok" ? l.value : null;
  const units = k.state === "ok" ? k.value : null;
  const hasFactor = factor != null && factor > 0;
  const base: BlockState = { block, form, litres, units, litresAuto: null, unitsAuto: null, kwh: null, error: null };

  if (l.state === "invalid" || k.state === "invalid") return { ...base, error: "Use numbers only, like 120.5." };
  if (litres == null && units == null) {
    return { ...base, error: "Enter litres or units, or mark that the DG did not run." };
  }
  if (units != null) {
    return {
      ...base,
      kwh: round3(units),
      litresAuto: litres == null && hasFactor ? round3(units / (factor as number)) : null,
    };
  }
  if (!hasFactor) {
    return {
      ...base,
      error: "This site has no DG factor in Baseline, so litres cannot be turned into units. Enter the units.",
    };
  }
  const derived = round3((litres as number) * (factor as number));
  return { ...base, kwh: derived, unitsAuto: derived };
}

function DgForm({ view, category, siteCode }: { view: TrendDayView; category: TrendViewCategory; siteCode: string }) {
  const t = useJoTheme();
  const keyboardOpen = useKeyboardOpen();
  const date = view.date;
  const factor = category.dg_factor ?? null;
  const { busy, saved, dirty, isDirty, markDirty, save, refuse } = useCategorySave(siteCode, date, "dg");

  const [form, setForm] = useEntryForm(category, isDirty, initialForm);
  const [touched, setTouched] = useState(false);

  const states = category.blocks.map((b) => blockState(b, form.blocks[b.block_id] ?? EMPTY, factor));
  const missing = form.notUsed ? 0 : states.filter((s) => s.error).length;
  const ready = missing === 0 && (form.notUsed || states.length > 0);

  const fields: TrendSaveFields = {
    not_used: form.notUsed,
    blocks: form.notUsed
      ? []
      : states.map(
          (s): TrendSaveBlock => ({
            block_id: s.block.block_id,
            // Only what was typed is sent; the server works the other side out.
            ...(s.litres != null ? { litres: s.litres } : {}),
            ...(s.units != null ? { quantity: s.units } : {}),
          }),
        ),
  };

  const stored = view.categories.find((c) => c.category === "electricity") ?? null;
  const after = ready
    ? (previewSave(view, "dg", { ...fields, client_saved_at: "", calc_version: CALC_VERSION }).categories.find(
        (c) => c.category === "electricity",
      ) ?? null)
    : null;

  const electricity = after ?? stored;
  const dgUnits = form.notUsed ? 0 : states.reduce((sum, s) => sum + (s.kwh ?? 0), 0);
  const summary = electricity?.entered
    ? {
        ...savingSummary(electricity),
        note: !ready
          ? "DG units count as consumption"
          : electricity.saving_is_manual
            ? "The saving is typed by hand, so DG does not change it"
            : dgUnits === 0
              ? "No DG units today. Saving unchanged"
              : `DG adds ${formatIndian(dgUnits)} ${category.unit} to consumption`,
      }
    : null;

  const edit = (blockId: string, patch: Partial<BlockForm>) => {
    markDirty();
    setTouched(false);
    setForm((prev) => ({
      notUsed: false,
      blocks: { ...prev.blocks, [blockId]: { ...(prev.blocks[blockId] ?? EMPTY), ...patch } },
    }));
  };

  const onSave = () => {
    if (!ready) {
      setTouched(true);
      refuse();
      return;
    }
    void save(fields);
  };

  return (
    <EntryFrame
      title="DG"
      view={view}
      current="dg"
      onPick={(c) => confirmLeave(dirty.current, () => openCategory(siteCode, date, c, true))}
      onBack={() => confirmLeave(dirty.current, backToHub)}
      footer={
        <FooterPanel>
          {summary ? (
            <SavingReadout
              label={ready ? "Electricity saved after DG" : "Electricity saved, before DG"}
              summary={summary}
              unit={electricity?.unit ?? category.unit}
              compact={keyboardOpen}
            />
          ) : (
            <Text style={[f.t(13), { color: t.muted, lineHeight: 18 }]}>
              Electricity is not entered yet. DG units are added to its consumption once it is.
            </Text>
          )}
          {keyboardOpen ? null : (
            <EntryActions view={view} category={category} siteCode={siteCode} saved={saved} busy={busy} onSave={onSave} />
          )}
        </FooterPanel>
      }
    >
      {states.map((s) => {
        const idle = form.notUsed;
        const error = touched && !idle ? s.error : null;
        return (
          <Card key={s.block.block_id} radius={24} style={{ padding: 16, gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
              <Text accessibilityRole="header" style={[f.t(16, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
                {s.block.name}
              </Text>
              <Text style={[f.t(13), { color: t.muted }]}>
                {factor != null && factor > 0 ? `1 L = ${formatIndian(factor, 0, 3)} ${category.unit}` : "No DG factor set"}
              </Text>
            </View>

            <NumberField
              label={s.litresAuto != null && !idle ? "Diesel used, calculated" : "Diesel used"}
              value={idle ? "0" : s.form.litres || (s.litresAuto != null ? String(s.litresAuto) : "")}
              onChangeText={(v) => edit(s.block.block_id, { litres: v })}
              onBlur={() => setTouched(true)}
              unit="L"
              placeholder="0.00"
              size="sm"
              editable={!idle}
              error={!!error}
            />
            {error ? <FieldError>{error}</FieldError> : null}

            <View style={{ gap: 6 }}>
              <NumberField
                label={s.unitsAuto != null && !idle ? "Units generated, calculated" : "Units generated"}
                value={idle ? "0" : s.form.units || (s.unitsAuto != null ? String(s.unitsAuto) : "")}
                onChangeText={(v) => edit(s.block.block_id, { units: v })}
                onBlur={() => setTouched(true)}
                unit={category.unit}
                placeholder="0.00"
                size="sm"
                editable={!idle}
              />
              <Text style={[f.t(12), { color: t.muted, lineHeight: 16, paddingHorizontal: 4 }]}>
                {factor != null && factor > 0
                  ? "Enter either one. The other fills in."
                  : "Enter the units. Litres cannot be converted until an admin sets the DG factor."}
              </Text>
            </View>
          </Card>
        );
      })}

      {category.blocks.length === 0 ? (
        <Card radius={24} style={{ padding: 16 }}>
          <Text style={[f.t(13), { color: t.muted, lineHeight: 19 }]}>
            No DG is set up for this site on this day. Add it in Baseline first.
          </Text>
        </Card>
      ) : null}

      <ChoiceToggle
        label="DG did not run today"
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
