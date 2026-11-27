/**
 * Trend Sheet › Day summary (artboard "7 Day summary").
 *
 * One day read back: Electricity with DG, Solar and Wind counted in, then
 * each fuel. Read only, so it is not behind the attendance gate; "Edit
 * readings" leads to the entry screens, which are.
 *
 * No rate, revenue or share appears here: the entry routes never send them.
 */
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx } from "@/components/jo/Bx";
import { Card, JoPage, PrimaryButton, SecondaryButton, f, useJoTheme } from "@/components/jo/ui";
import {
  DayHeader,
  LedgerRow,
  MissingSite,
  SavingBar,
  SyncLine,
  TrendPill,
  BaselineKindPill,
  backToHub,
  baselineLabel,
  num,
  readable,
  dayStateScreen,
  nextToEnter,
  openCategory,
  provisionalReason,
  safeDate,
  savingBarLabel,
  toneColor,
  useTrendDay,
  useTrendParams,
} from "@/components/trend/TrendKit";
import { isElectricityAddon } from "@/utils/trendCalc";
import {
  formatIndian,
  formatPct,
  formatSigned,
  savingSummary,
  type SavingSummary,
  type TrendDayView,
  type TrendViewCategory,
} from "@/utils/trendSheet";

export default function TrendSummary() {
  const params = useTrendParams("/trend-summary");
  const siteCode = params.siteCode ?? null;
  const date = safeDate(params.date);
  const day = useTrendDay(siteCode, date);

  if (!siteCode) return <MissingSite title="Day summary" />;
  const waiting = dayStateScreen("Day summary", date, day);
  if (waiting || !day.view) return waiting;
  return <Summary view={day.view} siteCode={siteCode} />;
}

function Summary({ view, siteCode }: { view: TrendDayView; siteCode: string }) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const total = view.categories.length;
  const done = view.categories.filter((c) => c.entered && c.sync !== "failed").length;
  const complete = total > 0 && done === total;
  const electricity = view.categories.find((c) => c.category === "electricity") ?? null;
  const addons = view.categories.filter((c) => isElectricityAddon(c.category));
  const fuels = view.categories.filter((c) => c.kind === "fuel");
  // Where "Edit readings" lands: the first category still open, else the first of the day.
  const target = nextToEnter(view) ?? view.categories[0] ?? null;

  return (
    <JoPage glow={false}>
      <DayHeader date={view.date} what="Day summary" onBack={backToHub} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[readable, { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 12 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 4 }}>
          <View
            style={{
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: complete ? t.okTint : t.warnTint,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Bx name={complete ? "bx-check" : "bx-time-five"} size={14} color={complete ? t.ok : t.warn} />
          </View>
          <Text style={[f.t(14, 500), num, { color: complete ? t.ok : t.ink }]}>
            {total === 0 ? "Nothing to enter on this day" : complete ? `All ${total} entered` : `${done} of ${total} entered`}
          </Text>
        </View>

        {electricity ? <ElectricityCard c={electricity} addons={addons} reason={provisionalReason(view)} /> : null}
        {/* A site with no Electricity still lists what its DG, Solar or Wind recorded. */}
        {!electricity && addons.length ? (
          <Card radius={28} style={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 8 }}>
            {addons.map((a, i) => (
              <LedgerRow key={a.category} label={a.label} value={quantityText(a)} first={i === 0} />
            ))}
          </Card>
        ) : null}
        {fuels.map((c) => (
          <FuelCard key={c.category} c={c} />
        ))}
      </ScrollView>

      <View
        style={{
          ...readable,
          flexDirection: "row",
          gap: 10,
          paddingTop: 8,
          paddingHorizontal: 16,
          paddingBottom: Math.max(insets.bottom, 12) + 12,
        }}
      >
        {target ? (
          <SecondaryButton
            label={done === 0 ? "Enter readings" : "Edit readings"}
            // Replaces this screen, so the stack stays hub, then one trend screen.
            onPress={() => openCategory(siteCode, view.date, target, true)}
            style={{ flex: 1 }}
          />
        ) : null}
        <PrimaryButton label="Done" onPress={backToHub} height={52} style={{ flex: 1 }} />
      </View>
    </JoPage>
  );
}

/** What a DG, Solar, Wind or fuel category used or generated that day, in words. */
function quantityText(c: TrendViewCategory): string {
  if (!c.entered || c.sync === "failed") return "Not entered";
  // Did not run / none used: stored as zero, shown as 0.
  if (c.not_used) return `${formatIndian(0)} ${c.unit}`;
  return c.consumption != null ? `${formatIndian(c.consumption)} ${c.unit}` : "—";
}

/** The figure a category adds to Electricity's consumption, or null when it is not known. */
const addonUnits = (a: TrendViewCategory): number | null =>
  !a.entered || a.sync === "failed" ? null : a.not_used ? 0 : a.consumption;

/** True when the figures shown really make the stored saving, to the paisa of rounding. */
const closes = (sum: number, saving: number | null | undefined) => saving != null && Math.abs(sum - saving) < 0.011;

/** The saving in the tone's colour, the gauge and what the colour means. */
function SavingFoot({ c, summary, reason }: { c: TrendViewCategory; summary: SavingSummary; reason?: string }) {
  const t = useJoTheme();
  const color = toneColor(t, summary.tone);
  const shown = c.entered && c.sync !== "failed";
  if (!summary.ready) return null;
  const loss = summary.saving != null && summary.saving < 0;
  return (
    <View style={{ gap: 12 }}>
      {loss ? null : (
        <SavingBar
          savingPct={summary.saving_pct}
          targetPct={summary.target_pct}
          color={color}
          label={savingBarLabel(summary, c.baseline != null ? `the ${formatIndian(c.baseline)} ${c.unit} baseline` : "baseline")}
        />
      )}
      {shown && summary.note ? (
        <TrendPill
          label={summary.note}
          tone={summary.tone === "idle" || (summary.tone === "ok" && c.target_pct == null) ? "mute" : summary.tone}
        />
      ) : null}
      {shown && c.provisional && reason ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <TrendPill label="Provisional" tone="warn" />
          <Text style={[f.t(12.5), { color: t.ink3, flexShrink: 1 }]}>{reason}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** The ledger's heading: the category, and the saving as a percentage in the tone's colour. */
function LedgerHead({ label, c, summary }: { label: string; c: TrendViewCategory; summary: SavingSummary }) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 1 }}>
        <Text accessibilityRole="header" style={[f.t(16, 600), { color: t.ink }]}>
          {label}
        </Text>
        <BaselineKindPill c={c} />
      </View>
      <Text style={[f.d(24, -0.02), num, { color: summary.ready ? toneColor(t, summary.tone) : t.ink3 }]}>
        {summary.ready ? formatPct(summary.saving_pct) : ""}
      </Text>
    </View>
  );
}

/**
 * Electricity as a ledger: baseline, less what the meters and DG, Solar and
 * Wind used, plus the adjustment, equals the saving. The operators are drawn
 * only when those figures really add up to the stored saving; a typed saving
 * or a missing figure gets the same rows without them.
 */
function ElectricityCard({
  c,
  addons,
  reason,
}: {
  c: TrendViewCategory;
  addons: TrendViewCategory[];
  /** What a provisional figure is still waiting for. */
  reason: string;
}) {
  const t = useJoTheme();
  const shown = c.entered && c.sync !== "failed";
  const summary = savingSummary(c, { missing: shown ? 0 : 1 });
  const meters = c.blocks.length;
  const addonFigures = addons.map(addonUnits);
  const sum =
    c.baseline != null && c.consumption != null && addonFigures.every((v) => v != null)
      ? c.baseline - c.consumption - addonFigures.reduce((a: number, v) => a + (v as number), 0) + (c.adjustment ?? 0)
      : null;
  const ledger = shown && !c.saving_is_manual && sum != null && closes(sum, c.saving);
  const op = <T extends "+" | "−" | "=">(o: T) => (ledger ? o : undefined);
  return (
    <Card radius={24} style={{ paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16, gap: 12 }}>
      <LedgerHead label="Electricity" c={c} summary={summary} />
      {!shown ? <Text style={[f.t(13), { color: t.ink3 }]}>Electricity is not entered for this day.</Text> : null}
      <View>
        <LedgerRow first label="Baseline" value={c.baseline != null ? `${formatIndian(c.baseline)} ${c.unit}` : "Not set yet"} />
        <LedgerRow
          op={op("−")}
          label={`Meters (${meters})`}
          value={shown && c.consumption != null ? `${formatIndian(c.consumption)} ${c.unit}` : shown ? "No readings" : "Not entered"}
        />
        {addons.map((a) => (
          <LedgerRow key={a.category} op={op("−")} label={a.label} value={quantityText(a)} />
        ))}
        <LedgerRow
          op={op("+")}
          label="Adjustment"
          value={!shown ? "—" : c.saving_is_manual ? "Not applied" : `${formatSigned(c.adjustment)} ${c.unit}`}
        />
        {shown ? (
          <LedgerRow
            result
            op={op("=")}
            label={c.saving_is_manual ? "Saved, typed" : "Saved"}
            value={c.saving != null ? `${formatIndian(c.saving)} ${c.unit}` : "Not worked out yet"}
          />
        ) : null}
      </View>
      <SavingFoot c={c} summary={summary} reason={reason} />
      <SyncLine c={c} />
    </Card>
  );
}

/** A fuel as a ledger: baseline, less what was used, equals the saving. */
function FuelCard({ c }: { c: TrendViewCategory }) {
  const t = useJoTheme();
  const shown = c.entered && c.sync !== "failed";
  const summary = savingSummary(c, { missing: shown ? 0 : 1 });
  const used = shown ? (c.not_used ? 0 : c.consumption) : null;
  const ledger = shown && c.baseline != null && used != null && closes(c.baseline - used, c.saving);
  return (
    <Card radius={24} style={{ paddingTop: 18, paddingHorizontal: 18, paddingBottom: 16, gap: 12 }}>
      <LedgerHead label={c.label} c={c} summary={summary} />
      {!shown ? <Text style={[f.t(13), { color: t.ink3 }]}>{c.label} is not entered for this day.</Text> : null}
      <View>
        {c.hourly ? (
          <LedgerRow first label="Run hours" value={shown && c.run_hours != null ? `${formatIndian(c.run_hours, 0, 2)} h` : "—"} />
        ) : null}
        <LedgerRow
          first={!c.hourly}
          label={baselineLabel(c)}
          value={c.baseline != null ? `${formatIndian(c.baseline)} ${c.unit}` : "Not set yet"}
        />
        <LedgerRow op={ledger ? "−" : undefined} label="Used" value={quantityText(c)} />
        {shown ? (
          <LedgerRow
            result
            op={ledger ? "=" : undefined}
            label="Saved"
            value={c.saving != null ? `${formatIndian(c.saving)} ${c.unit}` : "Not worked out yet"}
          />
        ) : null}
      </View>
      <SavingFoot c={c} summary={summary} />
      <SyncLine c={c} />
    </Card>
  );
}
