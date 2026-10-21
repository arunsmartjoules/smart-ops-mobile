/**
 * Site history filter — quick date presets, site and a custom date range,
 * as a JoSheet in the artboard language. The site list opens inline (a
 * second Modal can't stack reliably on iOS).
 */
import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Platform,
} from "react-native";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import {
  format,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  subMonths,
  subYears,
} from "date-fns";
import { Bx } from "@/components/jo/Bx";
import {
  JoSheet,
  PrimaryButton,
  SearchField,
  SecondaryButton,
  SheetOption,
  capsStyle,
  f,
  useJoTheme,
} from "@/components/jo/ui";
import { FilterChip } from "./LogsUI";
import { SelectField } from "./LogsKit";

interface LogFilterModalProps {
  visible: boolean;
  onClose: () => void;
  fromDate: Date | null;
  setFromDate: (date: Date | null) => void;
  toDate: Date | null;
  setToDate: (date: Date | null) => void;
  onApply: () => void;
  availableSites: any[];
  selectedSiteCode: string | null;
  onSiteSelect: (siteCode: string) => void;
}

const LogFilterModal = ({
  visible,
  onClose,
  fromDate,
  setFromDate,
  toDate,
  setToDate,
  onApply,
  availableSites,
  selectedSiteCode,
  onSiteSelect,
}: LogFilterModalProps) => {
  const [showStartPicker, setShowStartPicker] = React.useState(false);
  const [showEndPicker, setShowEndPicker] = React.useState(false);
  const [activePreset, setActivePreset] = React.useState<string | null>(null);
  const [siteListOpen, setSiteListOpen] = React.useState(false);
  const [siteQuery, setSiteQuery] = React.useState("");
  const t = useJoTheme();

  const onStartChange = (event: any, selectedDate?: Date) => {
    setShowStartPicker(Platform.OS === "ios");
    if (selectedDate) setFromDate(selectedDate);
  };

  const onEndChange = (event: any, selectedDate?: Date) => {
    setShowEndPicker(Platform.OS === "ios");
    if (selectedDate) setToDate(selectedDate);
  };

  const siteOptions = React.useMemo(() => {
    return availableSites.map((site) => ({
      value: site.site_code || site.id,
      label: `${site.site_code} - ${site.site_name || site.name || site.site_code}`,
      description: `${site.city || ""}, ${site.state || ""}`
        .trim()
        .replace(/^, |, $/g, ""),
    }));
  }, [availableSites]);

  const quickRanges = React.useMemo(() => {
    const now = new Date();
    return [
      {
        key: "this_week",
        label: "This Week",
        getRange: () => ({
          from: startOfWeek(now, { weekStartsOn: 1 }),
          to: endOfWeek(now, { weekStartsOn: 1 }),
        }),
      },
      {
        key: "this_month",
        label: "This Month",
        getRange: () => ({
          from: startOfMonth(now),
          to: endOfMonth(now),
        }),
      },
      {
        key: "last_month",
        label: "Last Month",
        getRange: () => {
          const d = subMonths(now, 1);
          return { from: startOfMonth(d), to: endOfMonth(d) };
        },
      },
      {
        key: "last_3_months",
        label: "Last 3 Months",
        getRange: () => ({
          from: startOfMonth(subMonths(now, 2)),
          to: endOfMonth(now),
        }),
      },
      {
        key: "last_6_months",
        label: "Last 6 Months",
        getRange: () => ({
          from: startOfMonth(subMonths(now, 5)),
          to: endOfMonth(now),
        }),
      },
      {
        key: "this_year",
        label: "This Year",
        getRange: () => ({
          from: startOfYear(now),
          to: endOfYear(now),
        }),
      },
      {
        key: "last_year",
        label: "Last Year",
        getRange: () => {
          const d = subYears(now, 1);
          return { from: startOfYear(d), to: endOfYear(d) };
        },
      },
    ] as const;
  }, []);

  if (!visible) return null;

  const section = (label: string) => (
    <Text style={[capsStyle(11.5), { color: t.muted, marginTop: 18, marginBottom: 9, paddingHorizontal: 2 }]}>
      {label}
    </Text>
  );
  const selectedSite = siteOptions.find((o) => o.value === selectedSiteCode);
  const q = siteQuery.trim().toLowerCase();
  const shownSites = q
    ? siteOptions.filter((o) => `${o.label} ${o.description}`.toLowerCase().includes(q))
    : siteOptions;

  const dateBox = (edge: "from" | "to") => {
    const value = edge === "from" ? fromDate : toDate;
    return (
      <TouchableOpacity
        onPress={() => {
          setActivePreset(null);
          if (edge === "from") setShowStartPicker(true);
          else setShowEndPicker(true);
        }}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={`${edge === "from" ? "Start" : "End"} date, ${value ? format(value, "dd MMM yyyy") : "not set"}`}
        style={{
          flex: 1,
          borderRadius: 18,
          backgroundColor: t.sheetField,
          paddingVertical: 9,
          paddingHorizontal: 14,
          gap: 3,
        }}
      >
        <Text style={[f.t(11.5, 500), { color: t.muted }]}>{edge === "from" ? "Start date" : "End date"}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Bx name="bx-calendar" size={15} color={t.accentInk} />
          <Text style={[f.t(14, 600), { color: value ? t.ink : t.faint }]}>
            {value ? format(value, "dd MMM yyyy") : "Select"}
          </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <JoSheet visible={visible} onClose={onClose} title="Filter logs">
      <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {section("Quick presets")}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {quickRanges.map((preset) => (
            <FilterChip
              key={preset.key}
              label={preset.label}
              on={activePreset === preset.key}
              onPress={() => {
                const { from, to } = preset.getRange();
                setFromDate(from);
                setToDate(to);
                setActivePreset(preset.key);
              }}
            />
          ))}
        </View>

        {section("Site")}
        <SelectField
          icon="bx-buildings"
          value={selectedSite?.label || selectedSiteCode || ""}
          placeholder="Select a site"
          onPress={() => setSiteListOpen((o) => !o)}
        />
        {siteListOpen ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            {siteOptions.length > 6 ? (
              <SearchField
                value={siteQuery}
                onChangeText={setSiteQuery}
                placeholder="Search sites"
                style={{ backgroundColor: t.sheetField }}
              />
            ) : null}
            {shownSites.length === 0 ? (
              <Text style={[f.t(13), { color: t.muted, textAlign: "center", paddingVertical: 12 }]}>
                No sites match.
              </Text>
            ) : (
              shownSites.map((o) => (
                <SheetOption
                  key={o.value}
                  label={o.label}
                  meta={o.description || undefined}
                  selected={o.value === selectedSiteCode}
                  onPress={() => {
                    onSiteSelect(o.value);
                    setSiteListOpen(false);
                    setSiteQuery("");
                  }}
                />
              ))
            )}
          </View>
        ) : null}

        {section("Date range")}
        <View style={{ flexDirection: "row", gap: 8 }}>
          {dateBox("from")}
          {dateBox("to")}
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={fromDate || new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={onStartChange}
            maximumDate={toDate || new Date()}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={toDate || new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={onEndChange}
            minimumDate={fromDate || undefined}
            maximumDate={new Date()}
          />
        )}
      </ScrollView>

      <View style={{ flexDirection: "row", gap: 9, marginTop: 22 }}>
        <SecondaryButton
          label="Reset"
          onPress={() => {
            setFromDate(null);
            setToDate(null);
            setActivePreset(null);
          }}
          style={{ paddingHorizontal: 22 }}
        />
        <PrimaryButton label="Apply filters" icon="bx-check" height={52} onPress={onApply} style={{ flex: 1 }} />
      </View>
    </JoSheet>
  );
};

export default LogFilterModal;
