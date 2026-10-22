/**
 * Attachment control for every incident surface, drawn as the artboard's
 * "Add photo" / "Attach log" dashed buttons over a thumbnail strip.
 *
 * Same contract as components/AttachmentField: `existing` = saved (remote)
 * urls, previewable but never removable here; `pending` = local uris picked
 * this session, previewable and removable. Photos open in a full-screen
 * pager; documents open in the system viewer (remote only — a not-yet-uploaded
 * local file has nothing to hand a viewer).
 */
import React, { useCallback, useMemo, useState } from "react";
import { Dimensions, FlatList, Image, Linking, Modal, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Bx, type BxName } from "@/components/jo/Bx";
import { GlossFill, JoSheet, f, useJoTheme } from "@/components/jo/ui";
import { JO_DARK } from "@/constants/jo";
import {
  attachmentFileName,
  isDocumentUri,
  pickAttachments,
  type AttachmentSource,
} from "@/utils/attachmentPicker";

const isRemote = (u: string) => /^https?:\/\//i.test(u);

export default function IncAttachments({
  existing = [],
  pending,
  onChangePending,
  sources = ["camera", "gallery", "files"],
  readOnly = false,
  emptyText = "No attachments yet",
  photoLabel = "Add photo",
  fileLabel = "Attach file",
  style,
}: {
  existing?: string[];
  pending: string[];
  onChangePending: React.Dispatch<React.SetStateAction<string[]>>;
  sources?: AttachmentSource[];
  /** Only the add buttons are hidden; existing items stay visible and previewable. */
  readOnly?: boolean;
  emptyText?: string;
  photoLabel?: string;
  fileLabel?: string;
  style?: object;
}) {
  const t = useJoTheme();
  const [photoSheet, setPhotoSheet] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const all = useMemo(() => [...existing, ...pending], [existing, pending]);
  const photos = useMemo(() => all.filter((u) => !isDocumentUri(u)), [all]);
  const photoSources = sources.filter((s) => s === "camera" || s === "gallery");
  const allowFiles = sources.includes("files");

  const add = useCallback(
    async (source: AttachmentSource, fromSheet: boolean) => {
      if (fromSheet) {
        setPhotoSheet(false);
        // Let the sheet finish closing before the system picker takes the
        // screen — on iOS two modals presenting at once drops the second.
        await new Promise((r) => setTimeout(r, 250));
      }
      const uris = await pickAttachments(source);
      if (uris.length > 0) {
        onChangePending((prev) => [...prev, ...uris.filter((u) => !prev.includes(u))]);
      }
    },
    [onChangePending],
  );

  const onAddPhoto = () => {
    if (photoSources.length === 1) void add(photoSources[0]!, false);
    else setPhotoSheet(true);
  };

  const open = (uri: string, isPending: boolean) => {
    if (!isDocumentUri(uri)) {
      setViewerIndex(photos.indexOf(uri));
      return;
    }
    if (!isPending && isRemote(uri)) void Linking.openURL(uri);
  };

  const tile = (uri: string, isPending: boolean) => {
    const doc = isDocumentUri(uri);
    const openable = !doc || (!isPending && isRemote(uri));
    return (
      <View key={`${isPending ? "p" : "e"}-${uri}`}>
        <TouchableOpacity
          activeOpacity={openable ? 0.8 : 1}
          onPress={() => openable && open(uri, isPending)}
          accessibilityRole={openable ? "button" : undefined}
          accessibilityLabel={`${doc ? "Open" : "Preview"} ${attachmentFileName(uri)}`}
        >
          {doc ? (
            <View
              style={{
                width: 150,
                height: 72,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: t.lineMid,
                backgroundColor: t.raised,
                paddingHorizontal: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Bx name="bx-file" size={18} color={t.muted} />
              <Text numberOfLines={2} style={[f.t(11.5), { flex: 1, color: t.ink2 }]}>
                {attachmentFileName(uri)}
              </Text>
            </View>
          ) : (
            <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 14, backgroundColor: t.raised }} />
          )}
        </TouchableOpacity>
        {isPending && !readOnly ? (
          <TouchableOpacity
            onPress={() => onChangePending((prev) => prev.filter((u) => u !== uri))}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${attachmentFileName(uri)}`}
            hitSlop={8}
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: t.selBg,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GlossFill color={t.selBg} fg={t.selFg} radius={12} />
            <Bx name="bx-x" size={15} color={t.selFg} />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  const addButtons: { key: string; icon: BxName; color: string; label: string; onPress: () => void }[] = [];
  if (!readOnly && photoSources.length > 0) {
    addButtons.push({ key: "photo", icon: "bx-camera", color: t.accentInk, label: photoLabel, onPress: onAddPhoto });
  }
  if (!readOnly && allowFiles) {
    addButtons.push({ key: "file", icon: "bx-paperclip", color: t.muted, label: fileLabel, onPress: () => void add("files", false) });
  }

  return (
    <View style={style}>
      {all.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          {existing.map((u) => tile(u, false))}
          {pending.map((u) => tile(u, true))}
        </View>
      ) : readOnly || addButtons.length === 0 ? (
        <Text style={[f.t(12.5), { color: t.muted, marginTop: 10 }]}>{emptyText}</Text>
      ) : null}

      {addButtons.length > 0 ? (
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          {addButtons.map((b) => (
            <TouchableOpacity
              key={b.key}
              onPress={b.onPress}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={b.label}
              style={{
                flex: 1,
                height: 44,
                borderRadius: 22,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: t.lineStrong,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 7,
              }}
            >
              <Bx name={b.icon} size={17} color={b.color} />
              <Text style={[f.t(13, 600), { color: t.ink }]} numberOfLines={1}>
                {b.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <JoSheet visible={photoSheet} onClose={() => setPhotoSheet(false)} title={photoLabel}>
        <View style={{ marginTop: 14, gap: 6 }}>
          {photoSources.map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => void add(s, true)}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={s === "camera" ? "Take photo" : "Photo library"}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                height: 60,
                paddingHorizontal: 14,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: t.line,
              }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}>
                <Bx name={s === "camera" ? "bx-camera" : "bx-images"} size={18} color={t.ink2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[f.t(14.5, 600), { color: t.ink }]}>{s === "camera" ? "Take photo" : "Photo library"}</Text>
                <Text style={[f.t(12), { color: t.muted, marginTop: 1 }]}>
                  {s === "camera" ? "Use the camera" : "Pick one or more photos"}
                </Text>
              </View>
              <Bx name="bx-chevron-right" size={20} color={t.faint} />
            </TouchableOpacity>
          ))}
        </View>
      </JoSheet>

      <PhotoPager photos={photos} index={viewerIndex} onClose={() => setViewerIndex(null)} />
    </View>
  );
}

/** Full-screen photo pager — always on the dark canvas, like any media viewer. */
function PhotoPager({ photos, index, onClose }: { photos: string[]; index: number | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get("window");
  const [current, setCurrent] = useState(0);
  const open = index !== null && index >= 0 && photos.length > 0;
  const shown = open ? Math.min(current, photos.length - 1) : 0;
  const d = JO_DARK;
  return (
    <Modal
      visible={open}
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setCurrent(index ?? 0)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: d.page }}>
        {open ? (
          <FlatList
            data={photos}
            keyExtractor={(u) => u}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={{ width, flex: 1, justifyContent: "center" }}>
                <Image source={{ uri: item }} style={{ width, height: "100%" }} resizeMode="contain" />
              </View>
            )}
          />
        ) : null}
        <View
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            paddingTop: insets.top + 10,
            paddingBottom: 12,
            paddingHorizontal: 16,
            backgroundColor: d.scrim,
          }}
        >
          <Text numberOfLines={1} style={[f.t(14, 600), { flex: 1, color: d.ink }]}>
            {open ? attachmentFileName(photos[shown] ?? "") : ""}
            {open && photos.length > 1 ? `  ·  ${shown + 1}/${photos.length}` : ""}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: d.input,
              borderWidth: 1,
              borderColor: d.lineMid,
            }}
          >
            <Bx name="bx-x" size={22} color={d.ink} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
