/**
 * "Raise → Fill in manually": the create-incident screen in the artboard's
 * form language. Presentation only — the incidents tab owns the form state,
 * the asset / people loaders, validation and the (offline-capable) create.
 */
import React from "react";
import { Modal, ScrollView, Text, View } from "react-native";
// keyboard-controller's KAV, not RN's: see IncidentDetailModal. The create
// footer had no keyboard handling at all, so Create sat behind the keyboard.
import { KeyboardAvoidingView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { f, useJoTheme } from "@/components/jo/ui";
import type { SelectOption } from "@/components/SearchableSelect";
import IncAttachments from "./IncAttachments";
import {
  ActionBar,
  BarPrimary,
  BarSecondary,
  DateTimeField,
  FieldBlock,
  FieldLabel,
  IncChip,
  IncHeader,
  IncPicker,
  Notice,
  Panel,
  TextField,
} from "./IncFields";

export interface IncidentCreateFormValue {
  site_code: string;
  asset_location: string;
  fault_symptom: string;
  fault_type: string;
  severity: "Critical" | "Moderate" | "Low";
  operating_condition: string;
  immediate_action_taken: string;
  attachments: string[];
  incident_created_time: Date;
  raised_by: string;
  assigned_to: string;
  client_request_id: string;
}

export default function IncidentCreateForm<F extends IncidentCreateFormValue>({
  visible,
  onCancel,
  form,
  setForm,
  setAttachments,
  siteOptions,
  assetOptions,
  assetsLoading,
  assetSearch,
  onAssetSearch,
  assigneeOptions,
  faultTypes,
  severities,
  operatingConditions,
  canEditMeta,
  offline,
  submitting,
  onSubmit,
}: {
  visible: boolean;
  onCancel: () => void;
  form: F;
  setForm: React.Dispatch<React.SetStateAction<F>>;
  setAttachments: React.Dispatch<React.SetStateAction<string[]>>;
  siteOptions: SelectOption[];
  assetOptions: SelectOption[];
  assetsLoading: boolean;
  assetSearch: string;
  onAssetSearch: (q: string) => void;
  assigneeOptions: SelectOption[];
  faultTypes: readonly string[];
  severities: readonly string[];
  operatingConditions: readonly string[];
  /** Only admins / managers may back-date the incident. */
  canEditMeta: boolean;
  offline: boolean;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const t = useJoTheme();
  const insets = useSafeAreaInsets();
  const set = <K extends keyof F>(k: K, v: F[K]) => setForm((prev) => ({ ...prev, [k]: v }));

  const chips = (label: string, options: readonly string[], value: string, onPick: (v: string) => void) => (
    <View style={{ marginTop: 14 }}>
      <FieldLabel label={label} required />
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }} accessibilityRole="radiogroup">
        {options.map((o) => (
          <IncChip
            key={o}
            label={o}
            selected={value === o}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onPick(o);
            }}
          />
        ))}
      </View>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onCancel}
    >
      <View style={{ flex: 1, backgroundColor: t.page }}>
        <IncHeader title="Raise incident" subtitle="Fill in the details" onBack={onCancel} backIcon="bx-x" />
        <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 28 }}
          >
            {offline ? (
              <Notice icon="bx-wifi-off" tone="warn">
                You&apos;re offline. The incident is saved on this phone and syncs when you&apos;re back online.
              </Notice>
            ) : null}

            <Panel title="What happened" style={offline ? undefined : { marginTop: 0 }}>
              <IncPicker
                label="Site"
                required
                placeholder="Select site"
                options={siteOptions}
                value={form.site_code}
                onChange={(v) => setForm((prev) => ({ ...prev, site_code: v, asset_location: "" }))}
                searchPlaceholder="Search sites"
              />
              <IncPicker
                label="Asset"
                required
                placeholder="Select asset"
                options={assetOptions}
                value={form.asset_location}
                onChange={(v) => set("asset_location", v as F["asset_location"])}
                loading={assetsLoading && !assetSearch}
                searchPlaceholder="Search assets..."
                emptyMessage={assetsLoading ? "Searching…" : "No assets found"}
                searchValue={assetSearch}
                onSearchChange={onAssetSearch}
                remoteSearch
              />
              <FieldBlock label="Incident name" required>
                <TextField
                  placeholder="e.g. Chiller 3 tripped on high discharge pressure"
                  value={form.fault_symptom}
                  onChangeText={(v) => set("fault_symptom", v as F["fault_symptom"])}
                  accessibilityLabel="Incident name"
                />
              </FieldBlock>
              {chips("Fault type", faultTypes, form.fault_type, (v) => set("fault_type", v as F["fault_type"]))}
              {chips("Severity", severities, form.severity, (v) => set("severity", v as F["severity"]))}
              {chips("Operating condition", operatingConditions, form.operating_condition, (v) =>
                set("operating_condition", v as F["operating_condition"]),
              )}
            </Panel>

            <Panel title="People & time">
              <DateTimeField
                label="Incident created time"
                value={form.incident_created_time}
                onChange={(d) => set("incident_created_time", d as F["incident_created_time"])}
                disabled={!canEditMeta}
              />
              {!canEditMeta ? (
                <Text style={[f.t(11.5), { color: t.muted, marginTop: 6 }]}>
                  Recorded as now. Admins and managers can change it.
                </Text>
              ) : null}
              <FieldBlock label="Raised by">
                <TextField
                  placeholder="Who reported it? e.g. Sister Mary, ICU"
                  value={form.raised_by}
                  onChangeText={(v) => set("raised_by", v as F["raised_by"])}
                  maxLength={200}
                  accessibilityLabel="Raised by"
                />
              </FieldBlock>
              <IncPicker
                label="Assigned to"
                required
                placeholder="Choose who handles this incident"
                options={assigneeOptions}
                value={form.assigned_to}
                onChange={(v) => set("assigned_to", v as F["assigned_to"])}
                searchPlaceholder="Search people"
                emptyMessage="No people found for this site"
              />
            </Panel>

            <Panel title="Immediate action" meta="Required">
              <View style={{ marginTop: 12 }}>
                <TextField
                  placeholder="What was done straight away?"
                  value={form.immediate_action_taken}
                  onChangeText={(v) => set("immediate_action_taken", v as F["immediate_action_taken"])}
                  multiline
                  minHeight={110}
                  accessibilityLabel="Immediate action taken"
                />
              </View>
            </Panel>

            <Panel title="Attachments" meta={form.attachments.length ? `${form.attachments.length} added` : "Optional"}>
              {/* Camera / photo library / any file, with tap-to-preview. */}
              <IncAttachments
                pending={form.attachments}
                onChangePending={setAttachments}
                fileLabel="Attach file"
                emptyText="No attachments selected"
              />
            </Panel>
          </ScrollView>

          <ActionBar bottomInset={insets.bottom}>
            <BarSecondary label="Cancel" onPress={onCancel} disabled={submitting} />
            <BarPrimary label={submitting ? "Creating…" : "Create incident"} onPress={onSubmit} busy={submitting} />
          </ActionBar>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}
