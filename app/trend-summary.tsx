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
import { EntryHeader } from "@/components/sitelogs/LogsKit";
import {
  FigureRow,
  MissingSite,
  SavingBar,
  SyncLine,
  TrendPill,
  backToHub,
  baselineLabel,
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
  dateLabel,
  formatIndian,
  formatPct,
  formatSigned,
  savingSummary,
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
      <EntryHeader title="Day summary" sub={dateLabel(view.date)} onBack={backToHub} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 16, gap: 12 }}
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
          <Text style={[f.t(14, 500), { color: complete ? t.ok : t.ink }]}>
            {total === 0 ? "Nothing to enter on this day" : complete ? `All ${total} entered` : `${done} of ${total} entered`}
          </Text>
        </View>

        {electricity ? <ElectricityCard c={electricity} addons={addons} reason={provisionalReason(view)} /> : null}
        {/* A site with no Electricity still lists what its DG, Solar or Wind recorded. */}
        {!electricity && addons.length ? (
          <Card radius={28} style={{ paddingTop: 10, paddingHorizontal: 20, paddingBottom: 8 }}>
            {addons.map((a, i) => (
              <FigureRow key={a.category} label={a.label} value={quantityText(a)} first={i === 0} />
            ))}
          </Card>
        ) : null}
        {fuels.map((c) => (
          <FuelCard key={c.category} c={c} />
        ))}
      </ScrollView>

      <View
        style={{
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
  if (c.not_used) return c.kind === "dg" ? "Did not run" : "None today";
  return c.consumption != null ? `${formatIndian(c.consumption)} ${c.unit}` : "—";
}

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
  const color = toneColor(t, summary.tone);
  const meters = c.blocks.length;
  return (
    <Card radius={28} style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 8, gap: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <Text accessibilityRole="header" style={[f.t(13), { color: t.muted }]}>
          Electricity saved
        </Text>
        <TrendPill label={baselineLabel(c)} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={[f.d(36, -0.02), { color: summary.ready ? color : t.ink }]}>
          {!summary.ready ? "—" : formatPct(summary.saving_pct)}
        </Text>
        <Text style={[f.t(16, 500), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
          {summary.saving != null ? `${formatIndian(summary.saving)} ${c.unit}` : ""}
        </Text>
      </View>
      <SavingBar
        pct={summary.bar_pct}
        markPct={summary.target_mark_pct}
        color={color}
        label={savingBarLabel(summary, c.baseline != null ? `the ${formatIndian(c.baseline)} ${c.unit} baseline` : "baseline")}
      />
      {!shown ? (
        <Text style={[f.t(13), { color: t.ink3 }]}>Electricity is not entered for this day.</Text>
      ) : summary.note ? (
        <TrendPill
          label={summary.note}
          tone={summary.tone === "idle" || (summary.tone === "ok" && c.target_pct == null) ? "mute" : summary.tone}
        />
      ) : null}
      {shown && c.provisional ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <TrendPill label="Provisional" tone="warn" />
          <Text style={[f.t(12.5), { color: t.ink3, flexShrink: 1 }]}>{reason}</Text>
        </View>
      ) : null}
      <SyncLine c={c} />
      <View>
        <FigureRow
          label="Baseline"
          value={c.baseline != null ? `${formatIndian(c.baseline)} ${c.unit}` : "Not set yet"}
        />
        <FigureRow
          label={`Meters, ${meters}`}
          value={shown && c.consumption != null ? `${formatIndian(c.consumption)} ${c.unit}` : shown ? "No readings" : "Not entered"}
        />
        {addons.map((a) => (
          <FigureRow key={a.category} label={a.label} value={quantityText(a)} />
        ))}
        <FigureRow
          label="Adjustment"
          value={!shown ? "—" : c.saving_is_manual ? "Not applied, saving typed" : `${formatSigned(c.adjustment)} ${c.unit}`}
        />
      </View>
    </Card>
  );
}

function FuelCard({ c }: { c: TrendViewCategory }) {
  const t = useJoTheme();
  const shown = c.entered && c.sync !== "failed";
  const summary = savingSummary(c, { missing: shown ? 0 : 1 });
  const color = toneColor(t, summary.tone);
  return (
    <Card radius={28} style={{ paddingTop: 18, paddingHorizontal: 20, paddingBottom: 8, gap: 12 }}>
      <Text accessibilityRole="header" style={[f.t(13), { color: t.muted }]}>
        {c.label} saved
      </Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
        <Text style={[f.d(24, -0.02), { color: summary.ready ? color : t.ink }]}>
          {!summary.ready ? "—" : formatPct(summary.saving_pct)}
        </Text>
        <Text style={[f.t(16, 500), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
          {summary.saving != null ? `${formatIndian(summary.saving)} ${c.unit}` : ""}
        </Text>
      </View>
      <SyncLine c={c} />
      <View>
        <FigureRow
          label={baselineLabel(c)}
          value={c.baseline != null ? `${formatIndian(c.baseline)} ${c.unit}` : "Not set yet"}
        />
        {c.hourly ? (
          <FigureRow label="Run hours" value={shown && c.run_hours != null ? formatIndian(c.run_hours, 0, 2) : "—"} />
        ) : null}
        <FigureRow label="Used" value={quantityText(c)} />
      </View>
    </Card>
  );
}
