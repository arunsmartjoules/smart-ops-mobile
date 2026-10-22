/**
 * Attachments on an entry — the web's "Attach a file" + list
 * (page.tsx DetailDrawer / LogForm, `uploadFiles(files, "draft" | "form")`).
 *
 * Picked files upload straight away (presigned PUT, `customer-communication/`
 * prefix like the web) and their public URLs are handed to `onAdd`; the
 * parent keeps them in its draft/form and they only reach the entry when the
 * parent saves — same as the web. Removing only edits that list too.
 */
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, Text, TouchableOpacity, View } from "react-native";
import { Camera, Paperclip, X } from "@/components/jo/bxIcons";
import { f, makeJoStyles, useJoTheme } from "@/components/jo/ui";
import CustomerCommunicationService from "@/services/CustomerCommunicationService";
import { fileNameFromUrl } from "./lib";
import { pickDocuments, pickPhotos, type PickedFile } from "./pick";

const UPLOAD_PREFIX = "customer-communication";

const useStyles = makeJoStyles((t) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 46,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: t.raised,
  },
  name: { ...f.t(12.5), color: t.ink2, flex: 1 },
  addRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  add: {
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: t.lineStrong,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  addText: { ...f.t(12.5, 600), color: t.accentInk },
}));

export function CommAttachments({
  urls,
  onAdd,
  onRemove,
  editable,
  online,
  onBusyChange,
  emptyText = "Nothing attached to this entry yet.",
}: {
  urls: string[];
  onAdd: (urls: string[]) => void;
  onRemove: (url: string) => void;
  /** False hides the add/remove controls; links stay openable. */
  editable: boolean;
  online: boolean;
  /** Tells the parent an upload is in flight, so it can hold Save. */
  onBusyChange?: (busy: boolean) => void;
  emptyText?: string;
}) {
  const t = useJoTheme();
  const s = useStyles();
  const [uploading, setUploading] = useState(0);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  useEffect(() => {
    onBusyChange?.(uploading > 0);
  }, [uploading, onBusyChange]);

  const upload = async (files: PickedFile[]) => {
    if (!files.length) return;
    if (!online) {
      setError("You're offline. Attaching files needs a connection.");
      return;
    }
    setError("");
    setUploading((n) => n + files.length);
    const done: string[] = [];
    const failed: string[] = [];
    for (const file of files) {
      const res = await CustomerCommunicationService.uploadFile(file, UPLOAD_PREFIX);
      if (!alive.current) return;
      if (res.ok) done.push(res.url);
      else failed.push(res.error);
      setUploading((n) => n - 1);
    }
    if (done.length) onAdd(done);
    if (failed.length) setError(failed[0] + (failed.length > 1 ? ` (+${failed.length - 1} more)` : ""));
  };

  const busy = uploading > 0;

  return (
    <View style={{ gap: 8 }}>
      {urls.length === 0 && !busy ? <Text style={[f.t(12.5), { color: t.muted }]}>{emptyText}</Text> : null}
      {urls.map((url) => (
        <View key={url} style={s.row}>
          <Paperclip size={15} color={t.accentInk} />
          <Text style={s.name} numberOfLines={1}>
            {fileNameFromUrl(url)}
          </Text>
          <TouchableOpacity
            onPress={() => Linking.openURL(url).catch(() => setError("Couldn't open that attachment."))}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={`View ${fileNameFromUrl(url)}`}
          >
            <Text style={[f.t(12, 600), { color: t.accentInk }]}>View</Text>
          </TouchableOpacity>
          {editable ? (
            <TouchableOpacity
              onPress={() => onRemove(url)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={`Remove ${fileNameFromUrl(url)}`}
            >
              <X size={16} color={t.muted} />
            </TouchableOpacity>
          ) : null}
        </View>
      ))}
      {busy ? (
        <View style={[s.row, { justifyContent: "flex-start" }]} accessibilityLiveRegion="polite">
          <ActivityIndicator size="small" color={t.muted} />
          <Text style={[s.name, { color: t.muted }]}>
            Uploading {uploading} file{uploading === 1 ? "" : "s"}…
          </Text>
        </View>
      ) : null}
      {editable ? (
        <View style={s.addRow}>
          <TouchableOpacity
            style={[s.add, { opacity: online ? 1 : 0.5 }]}
            onPress={() => void pickDocuments().then(upload)}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel="Attach a file"
          >
            <Paperclip size={16} color={t.accentInk} />
            <Text style={s.addText}>Attach a file</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.add, { opacity: online ? 1 : 0.5 }]}
            onPress={() => void pickPhotos().then(upload)}
            disabled={!online}
            accessibilityRole="button"
            accessibilityLabel="Add a photo"
          >
            <Camera size={16} color={t.accentInk} />
            <Text style={s.addText}>Add a photo</Text>
          </TouchableOpacity>
        </View>
      ) : null}
      {error ? (
        <Text style={[f.t(12, 500), { color: t.bad }]} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}
