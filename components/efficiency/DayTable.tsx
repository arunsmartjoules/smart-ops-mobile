/**
 * Day-wise readings (web DayWiseTable, read-only): newest day first, the date
 * frozen on the left and the metric columns scrolling sideways, with the
 * web's "Total / Avg" footer (sums for kWh / TRh, mean for SEC). High-side
 * days above the SEC target are tinted, as the web flags them.
 */
import React from "react";
import { Text, View } from "react-native";
import { Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { FrozenTable, type FrozenRow } from "@/components/sla/parts";
import { formatCell, mean, n3, overTarget, shortDate, sum, toNum, weekday, whole, type EffRow, type MetricColumn, type SideConfig } from "./lib";

const LEFT = 94;
const COL = 96;
const ROW_H = 44;

const tabular = { fontVariant: ["tabular-nums" as const] };

export function DayTable({ side, rows }: { side: SideConfig; rows: EffRow[] }) {
  const t = useJoTheme();
  const s = useStyles();

  const newestFirst = [...rows].sort((a, b) => String(b.report_date ?? "").localeCompare(String(a.report_date ?? "")));

  const foot = (c: MetricColumn): string => {
    const vals = rows.map((r) => r[c.key]);
    return c.kind === "sec" ? n3(mean(vals)) : whole(sum(vals));
  };

  const body: FrozenRow[] = newestFirst.map((r) => {
    const flagged = overTarget(r[side.secField], side.target);
    const bg = flagged ? t.warnTint : undefined;
    return {
      key: r.id,
      left: (
        <View style={[s.leftCell, bg ? { backgroundColor: bg } : null]}>
          <Text style={[f.t(12.5, 600), { color: t.ink }]} numberOfLines={1}>
            {shortDate(r.report_date)}
          </Text>
          <Text style={[f.t(10.5), { color: t.muted }]} numberOfLines={1}>
            {weekday(r.report_date)}
          </Text>
        </View>
      ),
      right: (
        <View style={[s.rowCells, bg ? { backgroundColor: bg } : null]}>
          {side.columns.map((c) => {
            const isSec = c.key === side.secField;
            const over = isSec && overTarget(r[c.key], side.target);
            const missing = toNum(r[c.key]) === null;
            return (
              <View key={c.key} style={s.cell}>
                <Text
                  style={[
                    f.t(12.5, isSec ? 600 : 400),
                    tabular,
                    {
                      color: missing ? t.muted : over ? t.warn : isSec && side.target !== null ? t.ok : t.ink,
                      textAlign: "right",
                    },
                  ]}
                  numberOfLines={1}
                >
                  {formatCell(r[c.key], c.kind)}
                </Text>
              </View>
            );
          })}
        </View>
      ),
    };
  });

  body.push({
    key: "__foot",
    left: (
      <View style={[s.leftCell, s.footBg]}>
        <Text style={[f.t(12, 700), { color: t.ink }]}>Total / Avg</Text>
      </View>
    ),
    right: (
      <View style={[s.rowCells, s.footBg]}>
        {side.columns.map((c) => (
          <View key={c.key} style={s.cell}>
            <Text style={[f.t(12.5, 700), tabular, { color: t.ink, textAlign: "right" }]} numberOfLines={1}>
              {foot(c)}
            </Text>
          </View>
        ))}
      </View>
    ),
  });

  return (
    <Card radius={22} style={s.card}>
      <View style={s.head}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>{side.tableTitle}</Text>
        <Text style={[f.t(11.5), { color: t.muted }]}>
          {rows.length} {rows.length === 1 ? "day" : "days"}
        </Text>
      </View>
      <Text style={[f.t(11.5), s.note]}>{side.tableNote} · scroll sideways for every column</Text>
      <View style={{ marginTop: 10 }}>
        <FrozenTable
          leftWidth={LEFT}
          headerHeight={38}
          rowHeight={ROW_H}
          headerBg={t.card}
          bodyBg={t.card}
          rowBorder={t.line}
          headerLeft={<Text style={[f.t(10.5, 600), s.headLeft]}>Date</Text>}
          headerRight={side.columns.map((c) => (
            <View key={c.key} style={s.headCell}>
              <Text style={[f.t(10.5, 600), { color: t.ink3, textAlign: "right" }]} numberOfLines={1}>
                {c.label}
              </Text>
              <Text style={[f.t(9.5), { color: t.muted, textAlign: "right" }]} numberOfLines={1}>
                {c.unit}
              </Text>
            </View>
          ))}
          rows={body}
        />
      </View>
    </Card>
  );
}

const useStyles = makeJoStyles((t) => ({
  card: { marginTop: 10, paddingTop: 16, paddingBottom: 6, overflow: "hidden" },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingHorizontal: 16 },
  note: { color: t.muted, marginTop: 3, paddingHorizontal: 16 },
  headLeft: { color: t.ink3, paddingLeft: 16 },
  headCell: { width: COL, paddingHorizontal: 10, justifyContent: "center" },
  leftCell: { flex: 1, justifyContent: "center", paddingLeft: 16, paddingRight: 6 },
  rowCells: { flexDirection: "row" },
  cell: { width: COL, paddingHorizontal: 10, justifyContent: "center" },
  footBg: { backgroundColor: t.raised },
}));
