/**
 * Daily SEC line for the selected site (web SecChart, one site): plotted
 * across every calendar day of the period so missing days read as gaps, with
 * the dashed plant target on the high side. Tap a day to read its value (the
 * web's hover tooltip).
 */
import React, { useMemo, useState } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Path, Text as SvgText } from "react-native-svg";
import { Card, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { JF } from "@/constants/jo";
import {
  allDates,
  n2,
  n3,
  niceStepTicks,
  overTarget,
  shortDate,
  toNum,
  weekday,
  type EffRow,
  type SideConfig,
} from "./lib";

const HEIGHT = 190;
const PAD = { top: 12, right: 10, bottom: 24, left: 36 };

export function SecChart({
  side,
  rows,
  from,
  to,
}: {
  side: SideConfig;
  rows: EffRow[];
  from: string;
  to: string;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [width, setWidth] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const { days, values, maxVal, lastWithValue, count } = useMemo(() => {
    const byDate: Record<string, number> = {};
    for (const r of rows) {
      const v = toNum(r[side.secField]);
      if (r.report_date && v !== null) byDate[r.report_date.slice(0, 10)] = v;
    }
    const ds = allDates(from, to);
    const vs = ds.map((d) => byDate[d] ?? null);
    let max = side.target ?? 0;
    let last: string | null = null;
    let n = 0;
    vs.forEach((v, i) => {
      if (v === null) return;
      n++;
      if (v > max) max = v;
      last = ds[i] ?? last;
    });
    return { days: ds, values: vs, maxVal: max, lastWithValue: last as string | null, count: n };
  }, [rows, side.secField, side.target, from, to]);

  const ticks = useMemo(() => niceStepTicks(maxVal), [maxVal]);
  const yTop = ticks[ticks.length - 1] ?? 1;
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const n = days.length;
  const xAt = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH - (Math.min(v, yTop) / yTop) * plotH;

  // Line segments broken at missing days (connectNulls = false on the web).
  const path = useMemo(() => {
    if (!width) return "";
    let d = "";
    let pen = false;
    values.forEach((v, i) => {
      if (v === null) {
        pen = false;
        return;
      }
      d += `${pen ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`;
      pen = true;
    });
    return d;
    // xAt / yAt are derived from width, n and yTop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, width, n, yTop]);

  const sel = picked && days.includes(picked) ? picked : lastWithValue;
  const selIdx = sel ? days.indexOf(sel) : -1;
  const selVal = selIdx >= 0 ? values[selIdx] ?? null : null;

  const labelEvery = Math.max(1, Math.ceil(n / 5));
  const lineColor = t.accentInk;
  const warnColor = t.warn;
  const fontFamily = JF.regular;

  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.round(e.nativeEvent.layout.width));
  const onTap = (x: number) => {
    if (n === 0 || plotW <= 0) return;
    const i = n <= 1 ? 0 : Math.round(((x - PAD.left) / plotW) * (n - 1));
    const day = days[Math.max(0, Math.min(n - 1, i))];
    if (day) setPicked(day);
  };

  const over = side.target !== null && selVal !== null && selVal > side.target;
  const avgAbove = values.filter((v) => overTarget(v, side.target)).length;

  return (
    <Card radius={22} style={s.card}>
      <View style={s.head}>
        <Text style={[f.t(15, 600), { color: t.ink }]}>{side.chartTitle}</Text>
        <Text style={[f.t(11.5), { color: t.muted }]}>kWh/TRh</Text>
      </View>

      {count === 0 ? (
        <Text style={[f.t(12.5), s.none]}>No SEC readings to plot for this period.</Text>
      ) : (
        <>
          {/* Read-out for the tapped (or latest) day. */}
          <View style={s.readout} accessibilityLiveRegion="polite">
            <Text style={[f.t(12), { color: t.muted }]}>
              {sel ? `${weekday(sel)} ${shortDate(sel)}` : ""}
            </Text>
            <Text style={[f.d(17, -0.01, 1.15), { color: selVal === null ? t.muted : over ? warnColor : t.ink }]}>
              {selVal === null ? "No reading" : n3(selVal)}
            </Text>
            {side.target !== null && selVal !== null ? (
              <Text style={[f.t(11.5, 600), { color: over ? warnColor : t.ok }]}>
                {over ? "Above target" : "On target"}
              </Text>
            ) : null}
          </View>

          <Pressable
            onLayout={onLayout}
            onPress={(e) => onTap(e.nativeEvent.locationX)}
            accessibilityRole="image"
            accessibilityLabel={`${side.chartTitle}. ${count} days with readings${
              side.target !== null ? `, ${avgAbove} above the ${n2(side.target)} target` : ""
            }. Tap a day to read its value.`}
            style={{ height: HEIGHT }}
          >
            {width > 0 ? (
              <Svg width={width} height={HEIGHT}>
                {/* Gridlines + y labels */}
                {ticks.map((v) => (
                  <G key={v}>
                    <Line
                      x1={PAD.left}
                      x2={width - PAD.right}
                      y1={yAt(v)}
                      y2={yAt(v)}
                      stroke={t.line}
                      strokeWidth={1}
                    />
                    <SvgText
                      x={PAD.left - 6}
                      y={yAt(v) + 3.5}
                      fontSize={10}
                      fontFamily={fontFamily}
                      fill={t.muted}
                      textAnchor="end"
                    >
                      {v.toFixed(1)}
                    </SvgText>
                  </G>
                ))}

                {/* x labels */}
                {days.map((d, i) =>
                  i % labelEvery === 0 ? (
                    <SvgText
                      key={d}
                      x={xAt(i)}
                      y={HEIGHT - 6}
                      fontSize={10}
                      fontFamily={fontFamily}
                      fill={t.muted}
                      textAnchor={i === 0 ? "start" : "middle"}
                    >
                      {shortDate(d)}
                    </SvgText>
                  ) : null,
                )}

                {/* Target (labelled in the legend — an in-plot label collides with the latest points) */}
                {side.target !== null ? (
                  <Line
                    x1={PAD.left}
                    x2={width - PAD.right}
                    y1={yAt(side.target)}
                    y2={yAt(side.target)}
                    stroke={warnColor}
                    strokeWidth={1.5}
                    strokeDasharray="6 4"
                  />
                ) : null}

                {/* Selected day guide */}
                {selIdx >= 0 ? (
                  <Line
                    x1={xAt(selIdx)}
                    x2={xAt(selIdx)}
                    y1={PAD.top}
                    y2={PAD.top + plotH}
                    stroke={t.lineStrong}
                    strokeWidth={1}
                    strokeDasharray="3 3"
                  />
                ) : null}

                <Path d={path} stroke={lineColor} strokeWidth={2} fill="none" strokeLinejoin="round" strokeLinecap="round" />

                {values.map((v, i) =>
                  v === null ? null : (
                    <Circle
                      key={days[i]}
                      cx={xAt(i)}
                      cy={yAt(v)}
                      r={i === selIdx ? 4.5 : n > 62 ? 0 : 2.5}
                      fill={overTarget(v, side.target) ? warnColor : lineColor}
                      stroke={i === selIdx ? t.card : "none"}
                      strokeWidth={i === selIdx ? 2 : 0}
                    />
                  ),
                )}
              </Svg>
            ) : null}
          </Pressable>

          <View style={s.legend}>
            <LegendSwatch color={lineColor} label={side.secLabel} />
            {side.target !== null ? <LegendSwatch color={warnColor} label={`Target ${n2(side.target)}`} dashed /> : null}
          </View>
        </>
      )}
    </Card>
  );
}

function LegendSwatch({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const t = useJoTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      <Svg width={22} height={8}>
        <Line
          x1={1}
          y1={4}
          x2={21}
          y2={4}
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeDasharray={dashed ? "5 3" : undefined}
        />
      </Svg>
      <Text style={[f.t(11.5), { color: t.muted }]}>{label}</Text>
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  card: { marginTop: 10, paddingTop: 16, paddingHorizontal: 12, paddingBottom: 14 },
  head: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 10, paddingHorizontal: 4 },
  readout: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8, marginBottom: 4, paddingHorizontal: 4 },
  none: { color: t.muted, textAlign: "center", paddingVertical: 36 },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 6, paddingHorizontal: 4 },
}));
