/**
 * Log / edit a client communication — the mobile twin of the web LogForm
 * (web/src/app/customer-communication/page.tsx `submitForm`): same fields,
 * same required rules, same POST/PUT body and activity-trail entry.
 *
 * Not ported: the AI "Describe it" intake and file uploads (a document link
 * can still be added; it lands in `attachments` like the web's link box).
 */
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Flag, Link as LinkIcon, MessageCircle, Plus, X } from "@/components/jo/bxIcons";
import { toneFg } from "@/constants/jo";
import { Chip, PrimaryButton, f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import CustomerCommunicationService, {
  type CommPerson,
  type CommRow,
  type CommWrite,
} from "@/services/CustomerCommunicationService";
import {
  DateField,
  FieldBlock,
  OfflineNotice,
  PickerPanel,
  SelectButton,
  TextField,
  type PickerItem,
} from "./fields";
import {
  OWNER_TEAMS,
  PRIORITIES,
  TYPES,
  hhmm,
  nextRef,
  nowHHMM,
  nowStamp,
  parseTimeline,
  points,
  splitLinks,
  splitList,
  streamOf,
  todayStr,
  type Stream,
  type TimelineEvent,
} from "./lib";

export interface FormState {
  stream: Stream;
  site: string;
  date: string;
  time: string;
  inputFrom: string;
  inputRole: string;
  types: string[];
  description: string;
  priority: string;
  ownerTeams: string[];
  assignee: string;
  expectedAction: string;
  closureDate: string;
  attachments: string[];
}

type FieldKey =
  | "site"
  | "inputFrom"
  | "types"
  | "description"
  | "assignee"
  | "closureDate"
  | "expectedAction";

export function blankForm(site: string): FormState {
  return {
    stream: "action",
    site,
    date: todayStr(),
    time: nowHHMM(),
    inputFrom: "",
    inputRole: "",
    types: [],
    description: "",
    priority: "High",
    ownerTeams: [],
    assignee: "",
    expectedAction: "",
    closureDate: "",
    attachments: [],
  };
}

export function formFromRow(row: CommRow): FormState {
  return {
    stream: streamOf(row),
    site: row.site_name || "",
    date: row.communication_date || todayStr(),
    time: hhmm(row.communication_time),
    inputFrom: row.input_from || "",
    inputRole: row.role_of_person || "",
    types: splitList(row.communication_type),
    description: row.detailed_description || "",
    priority: row.priority || "High",
    ownerTeams: splitList(row.owner),
    assignee: row.assignee || "",
    expectedAction: row.expected_action || "",
    closureDate: row.expected_closure_date || "",
    attachments: splitLinks(row.attachments),
  };
}

function validate(form: FormState): Partial<Record<FieldKey, string>> {
  const e: Partial<Record<FieldKey, string>> = {};
  if (!form.site.trim()) e.site = "Pick the site this came from.";
  if (!form.inputFrom.trim()) e.inputFrom = "Record who gave this input.";
  if (!form.types.length) e.types = "Pick at least one communication type.";
  if (!form.description.trim()) e.description = "A detailed description is required.";
  if (form.stream === "action") {
    if (!form.assignee) e.assignee = "An action item needs a person assigned to it.";
    if (!form.closureDate) e.closureDate = "An action item needs an expected closure date.";
    if (!form.expectedAction.trim()) e.expectedAction = "Spell out the expected action from the owner.";
  }
  return e;
}

const toggleIn = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

const useStyles = makeJoStyles((t) => ({
  streamCard: {
    flex: 1,
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    gap: 6,
  },
  streamLabel: { ...f.t(14, 600), color: t.ink },
  streamDesc: { ...f.t(11.5), color: t.muted, lineHeight: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  row2: { flexDirection: "row", gap: 10 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: t.sheetField,
  },
  linkText: { ...f.t(12.5), color: t.ink2, flex: 1 },
  formError: { ...f.t(12.5, 500), color: t.bad, textAlign: "center", marginBottom: 10 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: t.line,
    backgroundColor: t.page,
  },
}));

export function CommForm({
  initial,
  editing,
  rows,
  siteNames,
  people,
  userName,
  userEmail,
  online,
  bottomInset,
  onSaved,
}: {
  initial: FormState;
  /** The row being edited; null when logging a new entry. */
  editing: CommRow | null;
  /** Every loaded row (all of the caller's sites) — for the next CC ref. */
  rows: CommRow[];
  siteNames: string[];
  people: CommPerson[];
  userName: string;
  userEmail: string | null;
  online: boolean;
  bottomInset: number;
  onSaved: (row: CommRow, message: string) => void;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [form, setForm] = useState<FormState>(initial);
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [picker, setPicker] = useState<null | "site" | "assignee">(null);
  const [linkDraft, setLinkDraft] = useState("");

  const isAction = form.stream === "action";
  const pts = points(form.description);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => {
    setForm((prev) => ({ ...prev, [k]: v }));
    setSubmitError("");
    if (k in errors) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  /** Feedback carries no assignment — same rule as the web `pickFormStream`. */
  const pickStream = (st: Stream) => {
    setForm((prev) => {
      const next = { ...prev, stream: st };
      if (st === "feedback") {
        next.ownerTeams = [];
        next.assignee = "";
        next.expectedAction = "";
        next.closureDate = "";
      }
      return next;
    });
    setErrors((prev) => ({ ...prev, assignee: undefined, closureDate: undefined, expectedAction: undefined }));
  };

  const assigneeItems: PickerItem[] = useMemo(() => {
    const roleByName = new Map(people.map((p) => [p.name, p.role]));
    const names = new Set<string>(people.map((p) => p.name));
    rows.forEach((r) => r.assignee && names.add(r.assignee));
    if (form.assignee) names.add(form.assignee);
    return Array.from(names)
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ value: n, label: n, meta: roleByName.get(n) || undefined }));
  }, [people, rows, form.assignee]);

  const siteItems: PickerItem[] = useMemo(() => {
    const names = new Set(siteNames);
    if (form.site) names.add(form.site);
    return Array.from(names).map((n) => ({ value: n, label: n }));
  }, [siteNames, form.site]);

  const addLink = () => {
    const v = linkDraft.trim();
    if (!v) return;
    set("attachments", [...form.attachments, v]);
    setLinkDraft("");
  };

  const submit = async () => {
    if (submitting) return;
    const e = validate(form);
    if (Object.keys(e).length) {
      setErrors(e);
      setSubmitError("Fix the highlighted fields to continue.");
      return;
    }
    if (!online) {
      setSubmitError("You're offline. Connect to save this entry.");
      return;
    }

    const base: CommWrite = {
      site_name: form.site,
      communication_date: form.date || null,
      communication_time: form.time || null,
      input_from: form.inputFrom.trim(),
      role_of_person: form.inputRole.trim() || null,
      communication_type: form.types.join(", "),
      detailed_description: form.description,
      priority: form.priority,
      owner: form.ownerTeams.join(", "),
      assignee: isAction ? form.assignee : "",
      expected_action: isAction ? form.expectedAction : "",
      expected_closure_date: isAction ? form.closureDate || null : null,
      attachments: form.attachments.join("\n"),
      stream: form.stream,
    };

    setSubmitting(true);
    setSubmitError("");
    try {
      if (editing) {
        const notes = ["entry edited"];
        if (streamOf(editing) !== form.stream) {
          notes.push("moved to " + (isAction ? "action items" : "general feedback"));
        }
        if ((editing.priority || "") !== form.priority) notes.push("priority set to " + form.priority);
        const tl = parseTimeline(editing.timeline);
        tl.push({ when: nowStamp(), who: userName, what: notes.join(", ") });
        const res = await CustomerCommunicationService.update(editing.id, {
          ...base,
          timeline: JSON.stringify(tl),
        });
        if (!res.success) {
          setSubmitError(res.error);
          return;
        }
        onSaved(res.data, `${editing.cc_id || "Entry"} updated`);
      } else {
        const ref = nextRef(rows);
        const tl: TimelineEvent[] = [
          {
            when: nowStamp(),
            who: userName,
            what: isAction ? "Logged and assigned to " + form.assignee : "Logged as general feedback",
          },
        ];
        const res = await CustomerCommunicationService.create({
          ...base,
          cc_id: ref,
          email_address: userEmail,
          submitted_at: new Date().toISOString(),
          status: isAction ? "Open" : "Logged",
          resolution_summary: "",
          timeline: JSON.stringify(tl),
        });
        if (!res.success) {
          setSubmitError(res.error);
          return;
        }
        onSaved(
          res.data,
          `${ref} ${isAction ? "logged · assigned to " + form.assignee : "filed as feedback"}`,
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const streamCards: { key: Stream; label: string; desc: string; icon: typeof Flag }[] = [
    { key: "action", label: "Action item", desc: "Needs an owner, an action and a closure date.", icon: Flag },
    { key: "feedback", label: "General feedback", desc: "For the record — no owner, no due date.", icon: MessageCircle },
  ];

  return (
    <View style={{ flex: 1 }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: 16, paddingBottom: 28, gap: 18 }}
      >
        {!online ? <OfflineNotice text="You're offline. You can fill this in, but saving needs a connection." /> : null}

        <View style={s.row2}>
          {streamCards.map((c) => {
            const on = form.stream === c.key;
            const Icon = c.icon;
            return (
              <TouchableOpacity
                key={c.key}
                onPress={() => pickStream(c.key)}
                activeOpacity={0.85}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                style={[
                  s.streamCard,
                  {
                    borderColor: on ? t.accent : t.lineMid,
                    backgroundColor: on ? t.accentTint : t.card,
                  },
                ]}
              >
                <Icon size={18} color={on ? t.accentInk : t.muted} />
                <Text style={s.streamLabel}>{c.label}</Text>
                <Text style={s.streamDesc}>{c.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <FieldBlock label="Site" required error={errors.site}>
          <SelectButton
            value={form.site}
            placeholder="Select site"
            onPress={() => setPicker("site")}
            error={errors.site}
            accessibilityLabel="Site"
          />
        </FieldBlock>

        <View style={s.row2}>
          <FieldBlock label="Date" style={{ flex: 1.3 }}>
            <DateField
              value={form.date}
              onChange={(v) => set("date", v)}
              maximumDate={todayStr()}
              accessibilityLabel="Date of communication"
            />
          </FieldBlock>
          <FieldBlock label="Time" style={{ flex: 1 }}>
            <DateField mode="time" value={form.time} onChange={(v) => set("time", v)} placeholder="HH:MM" accessibilityLabel="Time of communication" />
          </FieldBlock>
        </View>

        <FieldBlock label="Input from" required error={errors.inputFrom}>
          <TextField
            value={form.inputFrom}
            onChangeText={(v) => set("inputFrom", v)}
            placeholder="Who gave this input"
            autoCapitalize="words"
            error={errors.inputFrom}
            accessibilityLabel="Input from"
          />
        </FieldBlock>

        <FieldBlock label="Role / designation">
          <TextField
            value={form.inputRole}
            onChangeText={(v) => set("inputRole", v)}
            placeholder="e.g. Facility Head"
            accessibilityLabel="Role or designation"
          />
        </FieldBlock>

        <FieldBlock label="Communication type" required error={errors.types}>
          <View style={s.chips}>
            {TYPES.map((ty) => (
              <Chip
                key={ty.key}
                label={ty.key}
                icon={ty.icon}
                iconColor={toneFg(t, ty.tone)}
                selected={form.types.includes(ty.key)}
                onPress={() => set("types", toggleIn(form.types, ty.key))}
              />
            ))}
          </View>
        </FieldBlock>

        <FieldBlock
          label="Detailed description"
          required
          error={errors.description}
          hint={pts.length ? `${pts.length} point(s) — one per line` : "One point per line: 1) … 2) …"}
        >
          <TextField
            value={form.description}
            onChangeText={(v) => set("description", v)}
            placeholder={"1) …\n2) …"}
            multiline
            minHeight={130}
            error={errors.description}
            accessibilityLabel="Detailed description"
          />
        </FieldBlock>

        <FieldBlock label="Priority">
          <View style={s.chips}>
            {PRIORITIES.map((p) => (
              <Chip key={p} label={p} selected={form.priority === p} onPress={() => set("priority", p)} />
            ))}
          </View>
        </FieldBlock>

        {isAction ? (
          <>
            <FieldBlock label="Assign to" required error={errors.assignee}>
              <SelectButton
                value={form.assignee}
                placeholder="Search a person"
                onPress={() => setPicker("assignee")}
                error={errors.assignee}
                accessibilityLabel="Assign to"
              />
            </FieldBlock>
            <FieldBlock label="Expected closure date" required error={errors.closureDate}>
              <DateField
                value={form.closureDate}
                onChange={(v) => set("closureDate", v)}
                error={errors.closureDate}
                accessibilityLabel="Expected closure date"
              />
            </FieldBlock>
            <FieldBlock label="Owner teams">
              <View style={s.chips}>
                {OWNER_TEAMS.map((team) => (
                  <Chip
                    key={team}
                    label={team}
                    selected={form.ownerTeams.includes(team)}
                    onPress={() => set("ownerTeams", toggleIn(form.ownerTeams, team))}
                  />
                ))}
              </View>
            </FieldBlock>
            <FieldBlock label="Expected action from owner" required error={errors.expectedAction}>
              <TextField
                value={form.expectedAction}
                onChangeText={(v) => set("expectedAction", v)}
                placeholder={"1) …\n2) …"}
                multiline
                minHeight={96}
                error={errors.expectedAction}
                accessibilityLabel="Expected action from owner"
              />
            </FieldBlock>
          </>
        ) : null}

        <FieldBlock label="Document link (optional)">
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <View style={{ flex: 1 }}>
              <TextField
                value={linkDraft}
                onChangeText={setLinkDraft}
                placeholder="Paste a Drive or SharePoint link"
                autoCapitalize="none"
                keyboardType="url"
                returnKeyType="done"
                onSubmitEditing={addLink}
                accessibilityLabel="Document link"
              />
            </View>
            <TouchableOpacity
              onPress={addLink}
              disabled={!linkDraft.trim()}
              accessibilityRole="button"
              accessibilityLabel="Add link"
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                backgroundColor: t.raised,
                alignItems: "center",
                justifyContent: "center",
                opacity: linkDraft.trim() ? 1 : 0.5,
              }}
            >
              <Plus size={20} color={t.ink} />
            </TouchableOpacity>
          </View>
          {form.attachments.map((url) => (
            <View key={url} style={s.linkRow}>
              <LinkIcon size={15} color={t.accentInk} />
              <Text style={s.linkText} numberOfLines={1}>
                {url}
              </Text>
              <TouchableOpacity
                onPress={() => set("attachments", form.attachments.filter((x) => x !== url))}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Remove link"
              >
                <X size={16} color={t.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </FieldBlock>
      </ScrollView>

      <View style={[s.footer, { paddingBottom: 12 + bottomInset }]}>
        {submitError ? <Text style={s.formError}>{submitError}</Text> : null}
        <PrimaryButton
          label={editing ? "Save changes" : isAction ? "Log action item" : "Log feedback"}
          onPress={submit}
          busy={submitting}
          disabled={!online}
        />
      </View>

      <PickerPanel
        visible={picker === "site"}
        title="Site"
        items={siteItems}
        value={form.site}
        onPick={(v) => set("site", v)}
        onClose={() => setPicker(null)}
        searchPlaceholder="Search site"
      />
      <PickerPanel
        visible={picker === "assignee"}
        title="Assign to"
        items={assigneeItems}
        value={form.assignee}
        onPick={(v) => set("assignee", v)}
        onClose={() => setPicker(null)}
        searchPlaceholder="Search people"
      />
    </View>
  );
}
