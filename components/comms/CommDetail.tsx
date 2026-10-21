/**
 * Entry detail — the mobile twin of the web DetailDrawer
 * (web/src/app/customer-communication/page.tsx): every field, the action
 * assignment block (assignee · closure date · status · owner teams ·
 * resolution summary, saved together with one activity-trail entry), the
 * feedback record state (saves on tap) with "Convert to action item", the
 * activity trail and "Add an update".
 *
 * "Edit entry" (full form) is offered to the entry's author only, as on web.
 * Delete and attachment upload/removal are web-only.
 */
import React, { useState } from "react";
import { Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { ArrowLeftRight, Paperclip, Pencil, Send } from "@/components/jo/bxIcons";
import { toneBg, toneFg } from "@/constants/jo";
import {
  Chip,
  PrimaryButton,
  SecondaryButton,
  StatusPill,
  capsStyle,
  f,
  makeJoStyles,
  useJoTheme,
} from "@/components/jo/ui";
import CustomerCommunicationService, {
  type CommPerson,
  type CommRow,
  type CommWrite,
} from "@/services/CustomerCommunicationService";
import { DateField, FieldBlock, OfflineNotice, PickerPanel, SelectButton, TextField, type PickerItem } from "./fields";
import {
  ACTION_STATUSES,
  FEEDBACK_STATUSES,
  FEEDBACK_STATUS_EVENT,
  OWNER_TEAMS,
  dayDiff,
  fmtLong,
  hhmm,
  nowStamp,
  parseTimeline,
  priorityTone,
  splitLinks,
  splitList,
  statusOf,
  statusTone,
  streamOf,
  titleOf,
  todayStr,
  typeDef,
} from "./lib";

interface Draft {
  assignee?: string;
  closureDate?: string;
  status?: string;
  resolution?: string;
  ownerTeams?: string[];
}

const useStyles = makeJoStyles((t) => ({
  card: {
    borderRadius: 22,
    backgroundColor: t.card,
    borderWidth: 1,
    borderColor: t.cardBorder,
    padding: 14,
  },
  caption: { ...capsStyle(11.5), color: t.muted },
  body: { ...f.t(13.5), color: t.ink, lineHeight: 20 },
  facts: { flexDirection: "row", gap: 8 },
  fact: { flex: 1, borderRadius: 18, backgroundColor: t.card, borderWidth: 1, borderColor: t.cardBorder, padding: 12 },
  factMain: { ...f.t(13, 600), color: t.ink, marginTop: 5 },
  factSub: { ...f.t(11.5), color: t.muted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  attach: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: t.raised,
  },
  tlRow: { flexDirection: "row", gap: 11, paddingVertical: 9, borderTopWidth: 1, borderTopColor: t.line },
  tlWhat: { ...f.t(13), color: t.ink, lineHeight: 18 },
  tlWho: { ...f.t(11.5), color: t.muted, marginTop: 3 },
  footer: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.line,
    backgroundColor: t.page,
  },
  error: { ...f.t(12.5, 500), color: t.bad },
}));

export function CommDetail({
  row,
  people,
  allRows,
  userName,
  userEmail,
  online,
  bottomInset,
  onUpdated,
  onEdit,
}: {
  row: CommRow;
  people: CommPerson[];
  allRows: CommRow[];
  userName: string;
  userEmail: string | null;
  online: boolean;
  bottomInset: number;
  onUpdated: (row: CommRow, message: string) => void;
  onEdit: () => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const today = todayStr();
  const [draft, setDraft] = useState<Draft>({});
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState<null | "save" | "status" | "convert" | "note">(null);
  const [error, setError] = useState("");
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const isAction = streamOf(row) === "action";
  const types = splitList(row.communication_type);
  const view = {
    assignee: draft.assignee ?? (row.assignee || ""),
    closureDate: draft.closureDate ?? (row.expected_closure_date || ""),
    status: draft.status ?? statusOf(row),
    resolution: draft.resolution ?? (row.resolution_summary || ""),
    ownerTeams: draft.ownerTeams ?? splitList(row.owner),
  };
  const statusOptions = isAction ? ACTION_STATUSES : FEEDBACK_STATUSES;
  const links = splitLinks(row.attachments);
  const timeline = parseTimeline(row.timeline).slice().reverse();
  const open = isAction && view.status !== "Closed";
  const days = view.closureDate ? dayDiff(view.closureDate, today) : null;
  const dueLabel = !view.closureDate
    ? "No closure date"
    : view.status === "Closed"
      ? "Closed · was due " + fmtLong(view.closureDate)
      : days != null && days < 0
        ? `${Math.abs(days)} days overdue`
        : days === 0
          ? "Due today"
          : `Due in ${days} days`;
  const dueColor = open && days != null && days < 0 ? t.bad : open && days != null && days <= 7 ? t.warn : t.muted;
  const isOwner = !userEmail || (row.email_address || "").trim().toLowerCase() === userEmail.trim().toLowerCase();
  const busy = saving !== null;

  const assigneeItems: PickerItem[] = (() => {
    const roleByName = new Map(people.map((p) => [p.name, p.role]));
    const names = new Set<string>(people.map((p) => p.name));
    allRows.forEach((r) => r.assignee && names.add(r.assignee));
    if (view.assignee) names.add(view.assignee);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n, meta: roleByName.get(n) || undefined }));
  })();

  /** PUT `patch`, appending one activity-trail entry (web `persist`). */
  const persist = async (patch: CommWrite, eventText: string | null, kind: NonNullable<typeof saving>) => {
    if (!online) {
      setError("You're offline. Connect to save changes.");
      return null;
    }
    const body: CommWrite = { ...patch };
    if (eventText) {
      const tl = parseTimeline(row.timeline);
      tl.push({ when: nowStamp(), who: userName, what: eventText });
      body.timeline = JSON.stringify(tl);
    }
    setSaving(kind);
    setError("");
    try {
      const res = await CustomerCommunicationService.update(row.id, body);
      if (!res.success) {
        setError(res.error);
        return null;
      }
      return res.data;
    } finally {
      setSaving(null);
    }
  };

  const saveDetail = async () => {
    const patch: CommWrite = {};
    const changes: string[] = [];
    if (draft.assignee !== undefined && draft.assignee !== (row.assignee || "")) {
      patch.assignee = draft.assignee;
      changes.push("reassigned to " + (draft.assignee || "nobody"));
    }
    if (draft.closureDate !== undefined && draft.closureDate !== (row.expected_closure_date || "")) {
      patch.expected_closure_date = draft.closureDate || null;
      changes.push("closure date " + (draft.closureDate ? "set to " + fmtLong(draft.closureDate) : "cleared"));
    }
    if (draft.status !== undefined && draft.status !== statusOf(row)) {
      patch.status = draft.status;
      changes.push("status set to " + draft.status);
    }
    if (draft.resolution !== undefined && draft.resolution !== (row.resolution_summary || "")) {
      patch.resolution_summary = draft.resolution;
      changes.push("resolution summary updated");
    }
    if (draft.ownerTeams !== undefined && draft.ownerTeams.join(", ") !== splitList(row.owner).join(", ")) {
      patch.owner = draft.ownerTeams.join(", ");
      changes.push("owner teams updated");
    }
    if (!changes.length) {
      setError("No changes to save.");
      return;
    }
    const updated = await persist(patch, changes.join(", "), "save");
    if (updated) {
      setDraft({});
      onUpdated(updated, `${row.cc_id || "Entry"} — ${changes.join(", ")}`);
    }
  };

  const setFeedbackStatus = async (status: string) => {
    if (statusOf(row) === status || busy) return;
    const updated = await persist({ status }, FEEDBACK_STATUS_EVENT[status] || "status set to " + status, "status");
    if (updated) onUpdated(updated, `${row.cc_id || "Entry"} — ${status.toLowerCase()}`);
  };

  const convertToAction = async () => {
    const teams = splitList(row.owner);
    const updated = await persist(
      {
        stream: "action",
        status: "Open",
        assignee: row.assignee || userName,
        owner: teams.length ? row.owner : "Operations/Field Services",
      },
      "Converted from general feedback to an action item",
      "convert",
    );
    if (updated) onUpdated(updated, `${row.cc_id || "Entry"} is now an action item — set a closure date`);
  };

  const addNote = async () => {
    const text = note.trim();
    if (!text) return;
    const updated = await persist({}, text, "note");
    if (updated) {
      setNote("");
      onUpdated(updated, "Update posted to " + (row.cc_id || "entry"));
    }
  };

  const pTone = priorityTone(row.priority);
  const critical = row.priority === "Critical";
  const dirty = Object.keys(draft).length > 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 14 }}>
        {!online ? <OfflineNotice text="You're offline. Changes need a connection." /> : null}

        {/* Header */}
        <View style={{ gap: 9 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 7 }}>
            {row.cc_id ? <Text style={[f.m(12, 600), { color: t.muted }]}>{row.cc_id}</Text> : null}
            {(types.length ? types : [""]).map((ty) => {
              const d = typeDef(ty);
              const Icon = d.icon;
              return (
                <View
                  key={ty || "none"}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 5,
                    height: 22,
                    paddingHorizontal: 9,
                    borderRadius: 11,
                    backgroundColor: toneBg(t, d.tone),
                  }}
                >
                  <Icon size={13} color={toneFg(t, d.tone)} />
                  <Text style={[f.t(11, 600), { color: toneFg(t, d.tone) }]}>{d.key}</Text>
                </View>
              );
            })}
            {row.priority ? (
              <View
                style={{
                  height: 22,
                  paddingHorizontal: 9,
                  borderRadius: 11,
                  justifyContent: "center",
                  backgroundColor: critical ? t.bad : toneBg(t, pTone),
                }}
              >
                <Text style={[f.t(11, 600), { color: critical ? t.onAccent : toneFg(t, pTone) }]}>{row.priority}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[f.d(22, -0.02, 1.2), { color: t.ink }]}>{titleOf(row)}</Text>
          <Text style={[f.t(12.5), { color: t.muted }]}>
            {row.site_name || "—"} · {isAction ? "Action item" : "General feedback"}
          </Text>
        </View>

        {/* Facts */}
        <View style={s.facts}>
          <View style={s.fact}>
            <Text style={s.caption}>Input from</Text>
            <Text style={s.factMain} numberOfLines={2}>{row.input_from || "—"}</Text>
            <Text style={s.factSub} numberOfLines={1}>{row.role_of_person || "Client side"}</Text>
          </View>
          <View style={s.fact}>
            <Text style={s.caption}>Communicated</Text>
            <Text style={s.factMain} numberOfLines={2}>
              {fmtLong(row.communication_date)}
              {row.communication_time ? ` · ${hhmm(row.communication_time)}` : ""}
            </Text>
            <Text style={s.factSub} numberOfLines={1}>Logged by {row.email_address || "—"}</Text>
          </View>
        </View>

        <View style={[s.card, { flexDirection: "row", alignItems: "center", justifyContent: "space-between" }]}>
          <Text style={s.caption}>Status</Text>
          <StatusPill label={view.status} tone={statusTone(view.status)} />
        </View>

        {/* Description */}
        <View style={[s.card, { gap: 8 }]}>
          <Text style={s.caption}>Detailed description</Text>
          <Text style={s.body} selectable>{row.detailed_description || "—"}</Text>
        </View>

        {isAction ? (
          <>
            <View style={[s.card, { gap: 16 }]}>
              <View style={s.sectionHead}>
                <Text style={[f.t(14.5, 600), { color: t.ink }]}>Assignment</Text>
                <Text style={[f.t(12, 600), { color: dueColor }]}>{dueLabel}</Text>
              </View>
              <FieldBlock label="Assigned to">
                <SelectButton
                  value={view.assignee}
                  placeholder="Search a person"
                  onPress={() => setAssigneeOpen(true)}
                  accessibilityLabel="Assigned to"
                />
              </FieldBlock>
              <FieldBlock label="Expected closure">
                <DateField
                  value={view.closureDate}
                  onChange={(v) => setDraft((d) => ({ ...d, closureDate: v }))}
                  accessibilityLabel="Expected closure date"
                />
              </FieldBlock>
              <FieldBlock label="Status">
                <View style={s.chips}>
                  {statusOptions.map((st) => (
                    <Chip
                      key={st}
                      label={st}
                      selected={view.status === st}
                      onPress={() => setDraft((d) => ({ ...d, status: st }))}
                    />
                  ))}
                </View>
              </FieldBlock>
              <FieldBlock label="Owner teams">
                <View style={s.chips}>
                  {OWNER_TEAMS.map((team) => {
                    const on = view.ownerTeams.includes(team);
                    return (
                      <Chip
                        key={team}
                        label={team}
                        selected={on}
                        onPress={() =>
                          setDraft((d) => ({
                            ...d,
                            ownerTeams: on ? view.ownerTeams.filter((x) => x !== team) : [...view.ownerTeams, team],
                          }))
                        }
                      />
                    );
                  })}
                </View>
              </FieldBlock>
              <FieldBlock label="Expected action from owner">
                <Text style={[s.body, { backgroundColor: t.sheetField, borderRadius: 18, padding: 13 }]} selectable>
                  {row.expected_action || "Nothing recorded."}
                </Text>
              </FieldBlock>
              <FieldBlock label="Resolution summary">
                <TextField
                  value={view.resolution}
                  onChangeText={(v) => setDraft((d) => ({ ...d, resolution: v }))}
                  placeholder="Record what was done to close this out"
                  multiline
                  minHeight={90}
                  accessibilityLabel="Resolution summary"
                />
              </FieldBlock>
            </View>
          </>
        ) : (
          <View style={[s.card, { gap: 12 }]}>
            <Text style={[f.t(12.5), { color: t.ink2, lineHeight: 18 }]}>
              Kept as general feedback — no owner, no closure date. Convert it if it turns into work.
            </Text>
            <FieldBlock label="Record state" hint="Saves straight away.">
              <View style={s.chips}>
                {statusOptions.map((st) => (
                  <Chip
                    key={st}
                    label={st}
                    selected={view.status === st}
                    onPress={() => setFeedbackStatus(st)}
                  />
                ))}
              </View>
            </FieldBlock>
            <SecondaryButton
              label="Convert to action item"
              icon={ArrowLeftRight}
              onPress={convertToAction}
              busy={saving === "convert"}
              height={46}
            />
          </View>
        )}

        {/* Attachments */}
        <View style={[s.card, { gap: 8 }]}>
          <Text style={s.caption}>Attachments</Text>
          {links.length === 0 ? (
            <Text style={[f.t(12.5), { color: t.muted }]}>Nothing attached to this entry.</Text>
          ) : (
            links.map((url) => (
              <TouchableOpacity
                key={url}
                style={s.attach}
                onPress={() => Linking.openURL(url).catch(() => setError("Couldn't open that link."))}
                accessibilityRole="link"
                accessibilityLabel={`Open attachment ${url}`}
              >
                <Paperclip size={15} color={t.accentInk} />
                <Text style={[f.t(12.5), { color: t.ink2, flex: 1 }]} numberOfLines={1}>
                  {decodeName(url)}
                </Text>
                <Text style={[f.t(12, 600), { color: t.accentInk }]}>View</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

        {/* Activity */}
        <View style={[s.card, { gap: 4 }]}>
          <Text style={[s.caption, { marginBottom: 6 }]}>Activity</Text>
          {timeline.length === 0 ? (
            <Text style={[f.t(12.5), { color: t.muted }]}>No activity recorded yet.</Text>
          ) : (
            timeline.map((e, i) => (
              <View key={`${e.when}-${i}`} style={[s.tlRow, i === 0 && { borderTopWidth: 0 }]}>
                <View
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    marginTop: 6,
                    backgroundColor: i === 0 ? t.accent : t.disabled,
                  }}
                />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={s.tlWhat}>{e.what}</Text>
                  <Text style={s.tlWho}>
                    {e.who} · {e.when}
                  </Text>
                </View>
              </View>
            ))
          )}
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={note}
                onChangeText={setNote}
                placeholder="Add an update"
                returnKeyType="send"
                onSubmitEditing={addNote}
                accessibilityLabel="Add an update"
              />
            </View>
            <TouchableOpacity
              onPress={addNote}
              disabled={!note.trim() || busy}
              accessibilityRole="button"
              accessibilityLabel="Post update"
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: note.trim() ? t.accent : t.raised,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Send size={18} color={note.trim() ? t.onAccent : t.muted} />
            </TouchableOpacity>
          </View>
        </View>

        {error ? <Text style={[s.error, { textAlign: "center" }]} accessibilityLiveRegion="polite">{error}</Text> : null}
      </ScrollView>

      {isOwner || isAction ? (
        <View style={[s.footer, { paddingBottom: 12 + bottomInset }]}>
          {isOwner ? (
            <SecondaryButton label="Edit entry" icon={Pencil} onPress={onEdit} style={{ flex: 1 }} />
          ) : null}
          {isAction ? (
            <PrimaryButton
              label="Save changes"
              onPress={saveDetail}
              busy={saving === "save"}
              disabled={!dirty || !online || busy}
              height={52}
              style={{ flex: 1 }}
            />
          ) : null}
        </View>
      ) : null}

      <PickerPanel
        visible={assigneeOpen}
        title="Assign to"
        items={assigneeItems}
        value={view.assignee}
        onPick={(v) => setDraft((d) => ({ ...d, assignee: v }))}
        onClose={() => setAssigneeOpen(false)}
        searchPlaceholder="Search people"
        allowClear
      />
    </View>
  );
}

function decodeName(url: string): string {
  try {
    const clean = url.split("?")[0] ?? url;
    return decodeURIComponent(clean.split("/").pop() || url);
  } catch {
    return url;
  }
}
