/**
 * The period's headline numbers (web CounterCards): the SEC average as the
 * accent hero — against the plant target on the high side — and the two sum
 * counters (consumption, tonnage) as cards. Same aggregation as the web: sums
 * of kWh / TRh and the mean of the daily SEC values.
 */
import React from "react";
import { Text, View } from "react-native";
import { Bx } from "@/components/jo/Bx";
import { GlossFill, Card, HeroCard, capsStyle, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { JO_DARK } from "@/constants/jo";
import { aggregate, big, n2, n3, overTarget, toNum, type EffRow, type SideConfig } from "./lib";

export function Summary({
  side,
  rows,
  periodLabel,
  dayCount,
}: {
  side: SideConfig;
  rows: EffRow[];
  periodLabel: string;
  /** Calendar days in the period, for "N of M days logged". */
  dayCount: number;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const sec = aggregate(rows, side.secField, "mean");
  // Distinct days: a site can carry two rows for one date (the web shows both).
  const logged = new Set(
    rows.filter((r) => r.report_date && toNum(r[side.secField]) !== null).map((r) => r.report_date),
  ).size;
  const above = rows.filter((r) => overTarget(r[side.secField], side.target)).length;
  const over = overTarget(sec, side.target);
  const hasTarget = side.target !== null;
  // Status pill sits on a near-black chip, so it takes the dark-mode tones.
  const statusColor = over ? JO_DARK.warn : JO_DARK.ok;

  return (
    <View>
      <HeroCard
        rings={1}
        style={s.hero}
        accessibilityLabel={`${side.secLabel} average ${n2(sec)} kilowatt hours per ton hour${
          hasTarget && sec !== null ? `, ${over ? "above" : "within"} the ${n2(side.target)} target` : ""
        }`}
      >
        <Text style={[capsStyle(12, 0.04), s.onAccentDim]} numberOfLines={1}>
          {side.secLabel} · {periodLabel}
        </Text>
        <View style={s.heroBig}>
          <Text style={[f.d(46, -0.045), { color: t.onAccent }]}>{n3(sec)}</Text>
          <Text style={[f.t(13, 600), s.onAccentDim]}>kWh/TRh avg</Text>
        </View>
        <View style={s.heroRow}>
          {hasTarget && sec !== null ? (
            <View style={s.heroPill}>
              <GlossFill color={t.onAccent} fg={statusColor} radius={12} />
              <View style={[s.dot, { backgroundColor: statusColor }]} />
              <Text style={[f.t(11.5, 600), { color: statusColor }]} numberOfLines={1}>
                {over ? "Above target" : "On target"}
              </Text>
            </View>
          ) : null}
          <Text style={[f.t(11.5, 500), s.heroMeta]} numberOfLines={2}>
            {[
              hasTarget ? `Target ${n2(side.target)}` : "No target set",
              `${logged} of ${dayCount} days logged`,
              hasTarget && above > 0 ? `${above} above target` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>
      </HeroCard>

      <View style={s.grid}>
        {side.counters.map((c) => {
          const v = aggregate(rows, c.field, c.agg);
          return (
            <Card key={c.field} radius={20} style={s.card}>
              <View style={s.rowIcon}>
                <Bx name={c.icon} size={15} color={t.accentInk} />
                <Text style={[f.t(11.5), { color: t.ink3, flexShrink: 1 }]} numberOfLines={1}>
                  {c.label}
                </Text>
              </View>
              <View style={s.nums}>
                <Text
                  style={[f.d(22, -0.03, 1.1), { color: v === null ? t.muted : t.ink, flexShrink: 1 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  accessibilityLabel={`${c.label} ${big(v)} ${c.unit}`}
                >
                  {big(v)}
                </Text>
                <Text style={[f.t(11), { color: t.muted }]}>{c.unit}</Text>
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  hero: { paddingVertical: 15, paddingHorizontal: 16 },
  onAccentDim: { color: t.onAccent, opacity: 0.7, flexShrink: 1 },
  heroBig: { flexDirection: "row", alignItems: "baseline", gap: 10, marginTop: 6 },
  heroRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
  heroPill: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 12,
    // Near-black in both modes (text on the accent) — the SLA hero's band pill.
    backgroundColor: t.onAccent,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  dot: { width: 7, height: 7, borderRadius: 4 },
  heroMeta: { color: t.onAccent, opacity: 0.75, flex: 1 },
  grid: { flexDirection: "row", gap: 8, marginTop: 10 },
  card: { flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 13 },
  rowIcon: { flexDirection: "row", alignItems: "center", gap: 6, minWidth: 0 },
  nums: { flexDirection: "row", alignItems: "baseline", gap: 5, marginTop: 9 },
}));
