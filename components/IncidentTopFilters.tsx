/**
 * RCA quick-filters for the incidents list — Claude Design "JouleOps
 * Incidents.dc.html". The artboard's chip: a 34px lozenge that fills thunder
 * when selected and sits white-on-canvas with a carbon hairline when not.
 *
 * Shown only under the Completed tab, where an incident's RCA state is the
 * thing worth slicing by.
 */
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { ds } from "@/constants/ds";
import { soRadius } from "@/components/home/SiteOverview";

interface IncidentTopFiltersProps {
  selected: string;
  onChange: (value: string) => void;
  canEdit: boolean;
}

const FILTERS = ["Open", "RCA Under Review", "RCA Submitted"];

const IncidentTopFilters = ({
  selected,
  onChange,
  canEdit,
}: IncidentTopFiltersProps) => {
  return (
    <View style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {FILTERS.map((item) => {
          const active = selected === item;
          return (
            <TouchableOpacity
              key={item}
              disabled={!canEdit}
              activeOpacity={0.75}
              onPress={() => onChange(item)}
              style={[
                styles.chip,
                {
                  backgroundColor: active ? ds.thunder[100] : ds.white,
                  borderColor: active ? ds.thunder[100] : ds.carbon[900],
                  opacity: canEdit ? 1 : 0.65,
                },
              ]}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.chipLabel,
                  { color: active ? ds.white : ds.carbon[100] },
                ]}
              >
                {item}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { paddingBottom: 12 },
  scroll: { gap: 6, paddingHorizontal: 20 },
  chip: {
    minHeight: 34,
    justifyContent: "center",
    paddingHorizontal: 13,
    borderRadius: soRadius.pill,
    borderWidth: 1,
  },
  chipLabel: { fontSize: 11.5, fontWeight: "600", letterSpacing: 0.23 },
});

export default IncidentTopFilters;
