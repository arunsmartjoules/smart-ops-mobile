/**
 * SLA › deliverable drill-down: what was scored, every source record that
 * counted (cards or a wide table), the backend's worked calculation, and the
 * formula / glossary / rules. Data: GET /api/sla/:site/drilldown/:key.
 */
import { useHideTabBar } from "@/services/TabBarVisibility";
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Animated, { FadeInRight } from "react-native-reanimated";
import {
  BookOpen,
  Calculator,
  ChevronDown,
  ChevronUp,
  CircleCheck,
  Download,
  ExternalLink,
  LayoutList,
  Table,
  WifiOff,
  type LucideIcon,
} from "@/components/jo/bxIcons";
import { Card, PrimaryButton, Shimmer, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import { toneBg, toneFg } from "@/constants/jo";
import type { SlaDeliverable, SlaDrillColumn, SlaDrillDown } from "@/services/SlaService";
import { FrozenTable, RoundButton, SubHeader, TintPill, type FrozenRow } from "./parts";
import type { DrillState } from "./useSlaData";
import {
  CATEGORY_META,
  buildDefs,
  catColor,
  cellText,
  deliverableStatusLabel,
  deliverableTone,
  drillSteps,
  fmtPct,
  fmtScore,
  fmtTarget,
  monthLabel,
  numPct,
  recordShape,
  recordStatusTone,
  sourceModuleHref,
  sourceModuleOf,
  prettyMonthKeys,
} from "./lib";

/** Cards shown before "Show all"; the table shows more rows per screen. */
const CARD_PAGE = 6;
const TABLE_PAGE = 25;
/**
 * Upper bound when "Show all" is on. These views aren't virtualised; a month
 * can carry thousands of rows (e.g. log readings), and the CSV has them all.
 */
const SHOW_ALL_CAP = 300;

export function DrillView({
  deliverable,
  no,
  siteName,
  monthKey,
  drill,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onBack,
  onOpenSource,
  onDownload,
  downloading,
}: {
  deliverable: SlaDeliverable;
  no: number;
  siteName: string;
  monthKey: string;
  drill: DrillState & { reload: () => void };
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onBack: () => void;
  onOpenSource: (href: string) => void;
  onDownload: (data: SlaDrillDown | null) => void;
  downloading: boolean;
}) {
  // The artboard draws this view full-screen, without the floating tab bar.
  useHideTabBar(true);
  const t = useJoTheme();
  const s = useStyles();
  const [mode, setMode] = useState<"cards" | "table">("cards");
  const [showAll, setShowAll] = useState(false);
  const [openRows, setOpenRows] = useState<Record<number, boolean>>({});
  const [termsOpen, setTermsOpen] = useState(false);

  const meta = CATEGORY_META[deliverable.category];
  const CatIcon = meta?.icon;
  const cc = catColor(t, deliverable.category);
  const source = sourceModuleOf(deliverable);
  const sourceHref = sourceModuleHref(source);
  const tone = deliverableTone(deliverable.actualPct, deliverable.commitmentPct);
  const dc = toneFg(t, tone);
  const mLabel = monthLabel(monthKey);
  const data = drill.data;
  const rows = useMemo(() => data?.rows ?? [], [data]);
  const columns = data?.columns ?? [];
  const steps = data ? drillSteps(data, deliverable) : [];
  const defs = buildDefs(deliverable);

  const page = mode === "cards" ? CARD_PAGE : TABLE_PAGE;
  const visibleCount = showAll ? Math.min(rows.length, SHOW_ALL_CAP) : Math.min(rows.length, page);
  const visible = rows.slice(0, visibleCount);
  const hasMore = rows.length > page;

  const tiles: { l: string; v: string; suffix: string; c: string }[] = [
    { l: "Actual", v: fmtPct(deliverable.actualPct), suffix: "%", c: dc },
    { l: "Commitment", v: numPct(deliverable.commitmentPct), suffix: "%", c: t.ink },
    { l: "Score", v: fmtScore(deliverable.actualScore), suffix: `/ ${fmtTarget(deliverable.targetScore)}`, c: dc },
    { l: "Weight in KPI", v: numPct(deliverable.weight), suffix: "%", c: t.ink },
  ];

  const footerH = 52 + 14 + 14;

  return (
    <Animated.View entering={FadeInRight.duration(220)} style={{ flex: 1 }}>
      <SubHeader
        title={`Deliverable #${no}`}
        sub={`${siteName} · ${mLabel}`}
        onBack={onBack}
        right={
          <>
            <RoundButton icon={ChevronUp} onPress={onPrev} disabled={!hasPrev} label="Previous deliverable" />
            <RoundButton icon={ChevronDown} onPress={onNext} disabled={!hasNext} label="Next deliverable" />
          </>
        }
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: 2, paddingHorizontal: 16, paddingBottom: footerH + 16 }}
        refreshControl={<RefreshControl refreshing={drill.loading && !!data} onRefresh={drill.reload} tintColor={t.muted} colors={[t.accent]} />}
      >
        <View style={s.chips}>
          <TintPill label={meta?.label ?? deliverable.category} fg={cc} bg={t.raised} icon={CatIcon} height={24} size={11.5} />
          <TintPill label={source} fg={t.ink2} bg={t.raised} icon={ExternalLink} height={24} size={11.5} />
          <TintPill
            label={deliverableStatusLabel(deliverable.actualPct, deliverable.commitmentPct)}
            fg={dc}
            bg={toneBg(t, tone)}
            height={24}
            size={11.5}
          />
        </View>
        <Text style={[f.d(24, -0.025, 1.12), { color: t.ink, marginTop: 10 }]}>{deliverable.deliverable}</Text>
        {deliverable.commitment ? (
          <Text style={[f.t(12.5), { color: t.ink3, lineHeight: 18, marginTop: 6 }]}>{deliverable.commitment}</Text>
        ) : null}
        {deliverable.unit ? (
          <Text style={[f.t(11.5), { color: t.muted, lineHeight: 16, marginTop: 6 }]}>Unit · {deliverable.unit}</Text>
        ) : null}

        <View style={s.tiles}>
          {tiles.map((x) => (
            <View key={x.l} style={s.tile}>
              <Text style={[f.t(11), { color: t.muted }]}>{x.l}</Text>
              <View style={s.tileVal}>
                <Text style={[f.d(24, -0.03, 1.1), { color: x.c }]}>{x.v}</Text>
                <Text style={[f.t(11.5), { color: t.muted }]}>{x.suffix}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* ── Source records ── */}
        <View style={s.secHead}>
          <Table size={18} color={t.accentInk} />
          <Text style={[f.t(16, 600), { color: t.ink }]} numberOfLines={1}>
            Source records
          </Text>
          {data ? (
            <View style={s.countPill}>
              <Text style={[f.t(11.5, 700), { color: t.ink }]}>{rows.length.toLocaleString("en-IN")}</Text>
            </View>
          ) : null}
          <View style={{ flex: 1 }} />
          {rows.length > 0 ? (
            <View style={s.modes}>
              <ModeButton label="Cards" icon={LayoutList} on={mode === "cards"} onPress={() => setMode("cards")} />
              <ModeButton label="Table" icon={Table} on={mode === "table"} onPress={() => setMode("table")} />
            </View>
          ) : null}
        </View>
        <Text style={[f.t(11.5), { color: t.muted, lineHeight: 17, marginTop: 5, paddingHorizontal: 4 }]}>
          Every individual record that counted toward this deliverable in {mLabel}
          {rows.length > SHOW_ALL_CAP ? ` — the first ${SHOW_ALL_CAP} are listed here, the CSV has all of them` : ""}
        </Text>
        {drill.fromCache ? (
          <View style={s.offline}>
            <WifiOff size={13} color={t.warn} />
            <Text style={[f.t(11.5), { color: t.warn }]}>Offline — showing the last downloaded copy</Text>
          </View>
        ) : null}

        {drill.loading && !data ? (
          <View style={{ gap: 8, marginTop: 10 }}>
            <Shimmer height={120} radius={20} />
            <Shimmer height={120} radius={20} />
          </View>
        ) : drill.error && !data ? (
          <View style={s.empty}>
            <Text style={[f.t(13), { color: t.ink3, textAlign: "center" }]}>{drill.error}</Text>
            <TouchableOpacity onPress={drill.reload} accessibilityRole="button" style={{ marginTop: 8 }}>
              <Text style={[f.t(13, 600), { color: t.accentInk }]}>Try again</Text>
            </TouchableOpacity>
          </View>
        ) : rows.length === 0 ? (
          <View style={s.empty}>
            <CircleCheck size={30} color={t.ok} />
            <Text style={[f.t(13), { color: t.ink3, marginTop: 8, textAlign: "center" }]}>
              No records counted against this deliverable this period.
            </Text>
          </View>
        ) : mode === "cards" ? (
          <View style={{ gap: 8, marginTop: 10 }}>
            {visible.map((row, i) => (
              <RecordCard
                key={i}
                columns={columns}
                row={row}
                open={!!openRows[i]}
                onToggle={() => setOpenRows((o) => ({ ...o, [i]: !o[i] }))}
              />
            ))}
          </View>
        ) : (
          <RecordTable columns={columns} rows={visible} />
        )}

        {hasMore && data ? (
          <TouchableOpacity
            onPress={() => setShowAll((v) => !v)}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={s.moreBtn}
          >
            <Text style={[f.t(12.5, 600), { color: t.ink }]}>
              {showAll ? "Show fewer" : `Show all ${Math.min(rows.length, SHOW_ALL_CAP).toLocaleString("en-IN")} records`}
            </Text>
            {showAll ? <ChevronUp size={17} color={t.ink} /> : <ChevronDown size={17} color={t.ink} />}
          </TouchableOpacity>
        ) : null}

        {/* ── Worked calculation ── */}
        {steps.length > 0 ? (
          <>
            <View style={[s.secHead, { marginTop: 20 }]}>
              <Calculator size={18} color={t.accentInk} />
              <Text style={[f.t(16, 600), { color: t.ink }]}>Worked calculation</Text>
            </View>
            <Text style={[f.t(11.5), { color: t.muted, marginTop: 5, paddingHorizontal: 4 }]}>
              Every value that turns the records above into this month&apos;s score
            </Text>
            <Card radius={20} style={{ marginTop: 10, overflow: "hidden" }}>
              {steps.map((st, i) => (
                <View
                  key={i}
                  style={[
                    s.step,
                    i > 0 ? { borderTopWidth: 1, borderTopColor: t.line } : null,
                    st.accent ? { backgroundColor: t.accentTint } : null,
                  ]}
                >
                  <View style={s.stepTop}>
                    <Text style={[f.t(12.5, st.accent ? 700 : 500), { color: st.accent ? t.accentInk : t.ink, flex: 1 }]}>
                      {st.label}
                    </Text>
                    <Text style={[f.m(st.accent ? 15 : 13, 700), { color: st.accent ? t.accentInk : t.ink }]}>
                      {st.value}
                    </Text>
                  </View>
                  {st.detail ? (
                    <Text style={[f.m(11), { color: t.muted, lineHeight: 16, marginTop: 3 }]}>{prettyMonthKeys(st.detail)}</Text>
                  ) : null}
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {/* ── Terms, formula & rules ── */}
        <Card radius={20} style={{ marginTop: 12, overflow: "hidden" }}>
          <TouchableOpacity
            onPress={() => setTermsOpen((o) => !o)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityState={{ expanded: termsOpen }}
            style={s.termsHead}
          >
            <BookOpen size={17} color={t.accentInk} />
            <Text style={[f.t(13, 600), { color: t.ink, flex: 1 }]}>Terms, formula &amp; rules</Text>
            <Text style={[f.t(11.5), { color: t.muted }]}>{termsOpen ? "Hide" : "Show"}</Text>
            {termsOpen ? <ChevronUp size={19} color={t.muted} /> : <ChevronDown size={19} color={t.muted} />}
          </TouchableOpacity>
          {termsOpen ? (
            <View style={{ padding: 14 }}>
              <Text style={[f.t(12.5, 600), { color: t.ink }]}>How this Actual % is calculated</Text>
              <View style={s.formulaBox}>
                <View style={s.formulaPart}>
                  <Text style={[s.kicker, { color: t.muted }]}>Numerator</Text>
                  <Text style={[f.t(12.5), s.formulaText]}>{data ? data.numerator.label : "…"}</Text>
                </View>
                <View style={[s.formulaPart, { borderTopWidth: 1, borderTopColor: t.line }]}>
                  <Text style={[s.kicker, { color: t.muted }]}>Denominator</Text>
                  <Text style={[f.t(12.5), s.formulaText]}>{data ? data.denominator.label : "…"}</Text>
                </View>
                <View style={[s.formulaPart, { backgroundColor: t.accentTint, borderTopWidth: 1, borderTopColor: t.line }]}>
                  <Text style={[s.kicker, { color: t.accentInk }]}>Formula</Text>
                  <Text style={[f.m(11.5), { color: t.ink, lineHeight: 18, marginTop: 4 }]}>{data ? data.formula : "…"}</Text>
                </View>
              </View>

              <Text style={[f.t(12.5, 600), { color: t.ink, marginTop: 16 }]}>What these terms mean</Text>
              <View style={{ gap: 6, marginTop: 8 }}>
                {defs.map((d) => (
                  <View key={d.term} style={s.def}>
                    <Text style={[f.t(12, 600), { color: t.accentInk }]}>{d.term}</Text>
                    <Text style={[f.t(12), { color: t.ink3, lineHeight: 18, marginTop: 3 }]}>{d.text}</Text>
                  </View>
                ))}
              </View>

              {data && data.notes.length > 0 ? (
                <>
                  <Text style={[f.t(12.5, 600), { color: t.ink, marginTop: 16 }]}>Rules &amp; edge cases</Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {data.notes.map((n, i) => (
                      <View key={i} style={{ flexDirection: "row", gap: 8 }}>
                        <CircleCheck size={15} color={t.ok} style={{ marginTop: 1 }} />
                        <Text style={[f.t(12), { color: t.ink2, lineHeight: 18, flex: 1 }]}>{n}</Text>
                      </View>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ) : null}
        </Card>
      </ScrollView>

      {/* ── Footer actions ── */}
      <View pointerEvents="box-none" style={[s.footer, { paddingBottom: 14 }]}>
        <LinearGradient
          pointerEvents="none"
          colors={[t.page + "00", t.page, t.page]}
          locations={[0, 0.34, 1]}
          style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }}
        />
        {sourceHref ? (
          <TouchableOpacity
            onPress={() => onOpenSource(sourceHref)}
            activeOpacity={0.8}
            accessibilityRole="button"
            style={s.sourceBtn}
          >
            <ExternalLink size={16} color={t.ink} />
            <Text style={[f.t(13.5, 600), { color: t.ink }]} numberOfLines={1}>
              Open {source}
            </Text>
          </TouchableOpacity>
        ) : null}
        <PrimaryButton
          label="Download CSV"
          icon={Download}
          height={52}
          busy={downloading}
          disabled={drill.loading && !data}
          onPress={() => onDownload(data)}
          style={{ flex: 1 }}
        />
      </View>
    </Animated.View>
  );
}

function ModeButton({ label, icon: Icon, on, onPress }: { label: string; icon: LucideIcon; on: boolean; onPress: () => void }) {
  const t = useJoTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      style={{
        height: 28,
        paddingHorizontal: 9,
        borderRadius: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: on ? t.selBg : "transparent",
      }}
    >
      <Icon size={14} color={on ? t.selFg : t.muted} />
      <Text style={[f.t(11.5, 600), { color: on ? t.selFg : t.muted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function RecordCard({
  columns,
  row,
  open,
  onToggle,
}: {
  columns: SlaDrillColumn[];
  row: Record<string, string | number | null>;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const shape = recordShape(columns, row);
  const stTone = shape.status ? recordStatusTone(shape.status) : null;
  return (
    <Card radius={20} style={{ paddingVertical: 12, paddingHorizontal: 13 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={[f.m(12, 600), { color: t.ink, flexShrink: 1 }]} numberOfLines={1}>
          {shape.primary}
        </Text>
        <View style={{ flex: 1 }} />
        {shape.status && stTone ? (
          <TintPill label={shape.status} fg={toneFg(t, stTone)} bg={toneBg(t, stTone)} height={20} size={10.5} />
        ) : null}
      </View>
      {shape.title ? (
        <Text style={[f.t(13.5, 600), { color: t.ink, lineHeight: 18, marginTop: 7 }]} numberOfLines={3}>
          {shape.title}
        </Text>
      ) : null}
      {shape.keys.length > 0 ? (
        <View style={s.keys}>
          {shape.keys.map((k) => (
            <View key={k.label} style={s.keyCell}>
              <Text style={[f.t(10), { color: t.muted }]} numberOfLines={1}>
                {k.label}
              </Text>
              <Text style={[f.t(12, 500), { color: t.ink, marginTop: 1 }]} numberOfLines={1}>
                {k.value}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {open ? (
        <View style={s.fields}>
          {shape.fields.map((fl, i) => (
            <View key={`${fl.label}-${i}`} style={[s.fieldRow, i > 0 ? { borderTopWidth: 1, borderTopColor: t.line } : null]}>
              <Text style={[f.t(11), { color: t.muted, width: 118 }]}>{fl.label}</Text>
              <Text style={[f.t(11.5), { color: t.ink, lineHeight: 15, flex: 1, minWidth: 0 }]}>{fl.value}</Text>
            </View>
          ))}
        </View>
      ) : null}
      <TouchableOpacity
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        hitSlop={8}
        style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 9, alignSelf: "flex-start" }}
      >
        <Text style={[f.t(12, 600), { color: t.accentInk }]}>{open ? "Hide fields" : `All ${shape.fields.length} fields`}</Text>
        {open ? <ChevronUp size={16} color={t.accentInk} /> : <ChevronDown size={16} color={t.accentInk} />}
      </TouchableOpacity>
    </Card>
  );
}

const FIRST_COL = 120;
const COL = 130;

function RecordTable({ columns, rows }: { columns: SlaDrillColumn[]; rows: Record<string, string | number | null>[] }) {
  const t = useJoTheme();
  const first = columns[0];
  const rest = columns.slice(1);
  if (!first) return null;
  const tableRows: FrozenRow[] = rows.map((r, i) => ({
    key: String(i),
    left: (
      <Text style={[f.t(11.5, 600), { color: t.ink, paddingHorizontal: 10, lineHeight: 15 }]} numberOfLines={2}>
        {cellText(r[first.key])}
      </Text>
    ),
    right: (
      <>
        {rest.map((c) => (
          <View key={c.key} style={{ width: COL, paddingHorizontal: 10, justifyContent: "center" }}>
            <Text
              style={[f.t(11.5), { color: t.ink, lineHeight: 15, textAlign: c.align === "right" ? "right" : "left" }]}
              numberOfLines={2}
            >
              {cellText(r[c.key])}
            </Text>
          </View>
        ))}
      </>
    ),
  }));
  return (
    <View style={{ marginTop: 10, borderRadius: 20, borderWidth: 1.5, borderColor: t.accent, overflow: "hidden", backgroundColor: t.card }}>
      <FrozenTable
        leftWidth={FIRST_COL}
        headerHeight={36}
        rowHeight={48}
        headerBg={t.raised}
        bodyBg={t.card}
        rowBorder={t.line}
        headerLeft={
          <Text style={[f.t(10.5, 600), { color: t.muted, paddingHorizontal: 10 }]} numberOfLines={1}>
            {first.label}
          </Text>
        }
        headerRight={rest.map((c) => (
          <View key={c.key} style={{ width: COL, paddingHorizontal: 10, justifyContent: "center" }}>
            <Text
              style={[f.t(10.5, 600), { color: t.muted, textAlign: c.align === "right" ? "right" : "left" }]}
              numberOfLines={2}
            >
              {c.label}
            </Text>
          </View>
        ))}
        rows={tableRows}
      />
    </View>
  );
}

const useStyles = makeJoStyles((t) => ({
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  tile: {
    flexBasis: "48%",
    flexGrow: 1,
    borderRadius: 18,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  tileVal: { flexDirection: "row", alignItems: "baseline", gap: 4, marginTop: 4 },
  secHead: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 18, paddingHorizontal: 4 },
  countPill: {
    height: 22,
    paddingHorizontal: 9,
    borderRadius: 11,
    backgroundColor: t.raised,
    justifyContent: "center",
  },
  modes: {
    flexDirection: "row",
    padding: 3,
    borderRadius: 16,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
  },
  offline: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, paddingHorizontal: 4 },
  empty: {
    marginTop: 10,
    borderRadius: 22,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.lineStrong,
    paddingVertical: 26,
    paddingHorizontal: 18,
    alignItems: "center",
  },
  moreBtn: {
    height: 44,
    marginTop: 8,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: t.lineMid,
    backgroundColor: t.raised,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
  },
  step: { paddingVertical: 11, paddingHorizontal: 14 },
  stepTop: { flexDirection: "row", alignItems: "baseline", gap: 10 },
  termsHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingVertical: 13,
    paddingHorizontal: 14,
    backgroundColor: t.raised,
  },
  formulaBox: { marginTop: 8, borderRadius: 14, overflow: "hidden", borderWidth: 1, borderColor: t.line },
  formulaPart: { paddingVertical: 10, paddingHorizontal: 12, backgroundColor: t.raised },
  formulaText: { color: t.ink, lineHeight: 18, marginTop: 3 },
  kicker: { ...f.t(10, 600, 0.08), textTransform: "uppercase" },
  def: { borderRadius: 14, backgroundColor: t.raised, paddingVertical: 10, paddingHorizontal: 12 },
  keys: { flexDirection: "row", flexWrap: "wrap", rowGap: 6, columnGap: 10, marginTop: 9 },
  keyCell: { width: "47%", minWidth: 0 },
  fields: { marginTop: 10, borderRadius: 14, backgroundColor: t.raised, paddingVertical: 4, paddingHorizontal: 11 },
  fieldRow: { flexDirection: "row", gap: 10, paddingVertical: 7 },
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 14,
    paddingHorizontal: 16,
    flexDirection: "row",
    gap: 8,
  },
  sourceBtn: {
    height: 52,
    paddingHorizontal: 18,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: t.isDark ? "rgba(255,255,255,0.12)" : t.lineMid,
    backgroundColor: t.input,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    maxWidth: "52%",
  },
}));
