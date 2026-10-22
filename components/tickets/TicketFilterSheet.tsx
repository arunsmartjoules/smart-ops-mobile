/**
 * Priority filter for the tickets list, opened from the filter button in the
 * search row. The raised-date window lives in the shared Ops header
 * (services/OpsDateRange); search, site and status live on the list header.
 */
import React, { useState } from "react";
import { ScrollView, View } from "react-native";
import { JoSheet, PrimaryButton, SecondaryButton } from "@/components/jo/ui";
import { ChoiceChips, FieldHead } from "./TicketFormParts";

export const TICKET_PRIORITY_FILTERS = ["All", "Medium", "High", "Very High"] as const;

export default function TicketFilterSheet({
  visible,
  onClose,
  priority,
  onApply,
}: {
  visible: boolean;
  onClose: () => void;
  priority: string;
  onApply: (next: { priority: string }) => void;
}) {
  // Mounted per open by the screen, so every open starts from what the list
  // is showing.
  const [prio, setPrio] = useState(priority);

  return (
    <JoSheet visible={visible} onClose={onClose} title="Filter tickets" subtitle="Priority">
      <ScrollView style={{ marginTop: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <FieldHead label="Priority" style={{ marginTop: 12 }} />
        <ChoiceChips
          label="Priority"
          options={TICKET_PRIORITY_FILTERS}
          value={prio}
          onChange={setPrio}
          style={{ marginTop: 9 }}
        />

        <View style={{ flexDirection: "row", gap: 8, marginTop: 22 }}>
          <SecondaryButton
            label="Reset"
            height={52}
            style={{ flex: 1 }}
            onPress={() => setPrio("All")}
          />
          <PrimaryButton
            label="Apply"
            icon="bx-check"
            height={52}
            style={{ flex: 1.4 }}
            onPress={() => onApply({ priority: prio })}
          />
        </View>
      </ScrollView>
    </JoSheet>
  );
}
