import React, { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  Image,
  Linking,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Camera,
  FileText,
  Image as ImageIcon,
  Paperclip,
  Plus,
  X,
} from "lucide-react-native";
import { useDs } from "@/hooks/useDs";
import RequiredMark from "@/components/RequiredMark";
import {
  attachmentFileName,
  isDocumentUri,
  pickAttachments,
  type AttachmentSource,
} from "@/utils/attachmentPicker";

/**
 * One attachment control for every incident surface: a single "Add attachment"
 * button that offers Camera / Photo library / Files, thumbnails for what is
 * already on the record and what is waiting to upload, and tap-to-preview on
 * all of them.
 *
 * `existing` are saved (remote) urls — previewable but never removable here.
 * `pending` are local uris picked this session — previewable and removable.
 * Photos open in a full-screen pager; documents open in the system viewer
 * (remote only: a not-yet-uploaded local file has nothing to hand a viewer).
 */
interface AttachmentFieldProps {
  /** Empty = no heading (used for thumbnails embedded in the activity feed). */
  title: string;
  hint?: string;
  existing?: string[];
  pending: string[];
  onChangePending: React.Dispatch<React.SetStateAction<string[]>>;
  /** Which sources the sheet offers. Photos-only for evidence shots. */
  sources?: AttachmentSource[];
  addLabel?: string;
  emptyText?: string;
  /** Only the picker is hidden; existing items stay visible and previewable. */
  readOnly?: boolean;
}

const SOURCE_META: Record<
  AttachmentSource,
  { label: string; description: string; icon: typeof Camera }
> = {
  camera: { label: "Take photo", description: "Use the camera", icon: Camera },
  gallery: { label: "Photo library", description: "Pick one or more photos", icon: ImageIcon },
  files: { label: "Files", description: "PDF, Word, Excel and others", icon: FileText },
};

export default function AttachmentField({
  title,
  hint,
  existing = [],
  pending,
  onChangePending,
  sources = ["camera", "gallery", "files"],
  addLabel = "Add attachment",
  emptyText = "No attachments yet",
  readOnly = false,
}: AttachmentFieldProps) {
  const ds = useDs();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const all = useMemo(() => [...existing, ...pending], [existing, pending]);
  const photos = useMemo(() => all.filter((u) => !isDocumentUri(u)), [all]);

  const add = useCallback(
    async (source: AttachmentSource) => {
      setSheetOpen(false);
      // Let the sheet finish closing before the system picker takes the screen —
      // on iOS two modals presenting at once drops the second.
      await new Promise((r) => setTimeout(r, 250));
      const uris = await pickAttachments(source);
      if (uris.length > 0) {
        onChangePending((prev) => [...prev, ...uris.filter((u) => !prev.includes(u))]);
      }
    },
    [onChangePending],
  );

  const open = (uri: string, isPending: boolean) => {
    if (!isDocumentUri(uri)) {
      setViewerIndex(photos.indexOf(uri));
      return;
    }
    if (!isPending && /^https?:\/\//i.test(uri)) void Linking.openURL(uri);
  };

  const renderTile = (uri: string, isPending: boolean) => {
    const doc = isDocumentUri(uri);
    const openable = !doc || (!isPending && /^https?:\/\//i.test(uri));
    return (
      <View key={`${isPending ? "p" : "e"}-${uri}`} style={{ position: "relative" }}>
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
                borderRadius: 12,
                borderWidth: 1,
                borderColor: ds.carbon[900],
                backgroundColor: ds.carbon[1000],
                paddingHorizontal: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
              }}
            >
              <FileText size={16} color={ds.carbon[400]} />
              <Text
                numberOfLines={2}
                style={{ flex: 1, fontSize: 11.5, color: ds.carbon[200] }}
              >
                {attachmentFileName(uri)}
              </Text>
            </View>
          ) : (
            <Image source={{ uri }} style={{ width: 72, height: 72, borderRadius: 12 }} />
          )}
        </TouchableOpacity>
        {isPending && !readOnly ? (
          <TouchableOpacity
            onPress={() => onChangePending((prev) => prev.filter((u) => u !== uri))}
            accessibilityLabel={`Remove ${attachmentFileName(uri)}`}
            hitSlop={8}
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              width: 24,
              height: 24,
              borderRadius: 12,
              backgroundColor: "rgba(0,0,0,0.7)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <X size={14} color="#fff" />
          </TouchableOpacity>
        ) : null}
      </View>
    );
  };

  return (
    <View style={{ marginBottom: readOnly && !title ? 0 : 12, marginTop: readOnly && !title ? 8 : 0 }}>
      {title ? (
        <Text
          style={{
            fontSize: 9,
            fontWeight: "600",
            letterSpacing: 1.08,
            textTransform: "uppercase",
            color: ds.carbon[500],
            marginBottom: 7,
          }}
        >
          <RequiredMark label={title} />
        </Text>
      ) : null}
      {hint ? (
        <Text style={{ fontSize: 12, color: ds.carbon[500], marginBottom: 8 }}>{hint}</Text>
      ) : null}

      {all.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
          {existing.map((u) => renderTile(u, false))}
          {pending.map((u) => renderTile(u, true))}
        </View>
      ) : (
        <Text style={{ fontSize: 12, color: ds.carbon[500], marginBottom: 10 }}>{emptyText}</Text>
      )}

      {!readOnly ? (
        <TouchableOpacity
          onPress={() => setSheetOpen(true)}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={addLabel}
          style={{
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 7,
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: ds.carbon[900],
            backgroundColor: ds.carbon[1000],
          }}
        >
          <Plus size={16} color={ds.carbon[300]} strokeWidth={2.2} />
          <Text style={{ fontSize: 12.5, fontWeight: "600", color: ds.carbon[200] }}>
            {addLabel}
          </Text>
        </TouchableOpacity>
      ) : null}

      <SourceSheet
        visible={sheetOpen}
        sources={sources}
        onPick={add}
        onClose={() => setSheetOpen(false)}
      />
      <PhotoPager
        photos={photos}
        index={viewerIndex}
        onClose={() => setViewerIndex(null)}
      />
    </View>
  );
}

/* ── Source sheet ────────────────────────────────────────────────────────── */

function SourceSheet({
  visible,
  sources,
  onPick,
  onClose,
}: {
  visible: boolean;
  sources: AttachmentSource[];
  onPick: (s: AttachmentSource) => void;
  onClose: () => void;
}) {
  const ds = useDs();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            backgroundColor: ds.white,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            paddingTop: 10,
            paddingHorizontal: 20,
            paddingBottom: Math.max(insets.bottom, 16) + 8,
          }}
        >
          <View
            style={{
              alignSelf: "center",
              width: 36,
              height: 4,
              borderRadius: 2,
              backgroundColor: ds.carbon[800],
              marginBottom: 14,
            }}
          />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
            <Paperclip size={15} color={ds.carbon[400]} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: ds.carbon[100] }}>
              Add attachment
            </Text>
          </View>
          {sources.map((s) => {
            const m = SOURCE_META[s];
            const Icon = m.icon;
            return (
              <TouchableOpacity
                key={s}
                onPress={() => onPick(s)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={m.label}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  paddingVertical: 13,
                  borderTopWidth: 1,
                  borderTopColor: ds.carbon[1000],
                }}
              >
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 19,
                    backgroundColor: ds.carbon[1000],
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon size={18} color={ds.carbon[300]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontWeight: "600", color: ds.carbon[100] }}>
                    {m.label}
                  </Text>
                  <Text style={{ fontSize: 12, color: ds.carbon[500], marginTop: 1 }}>
                    {m.description}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ── Photo pager ─────────────────────────────────────────────────────────── */

function PhotoPager({
  photos,
  index,
  onClose,
}: {
  photos: string[];
  index: number | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = Dimensions.get("window");
  const [current, setCurrent] = useState(0);
  const open = index !== null && index >= 0 && photos.length > 0;
  const shown = open ? Math.min(current, photos.length - 1) : 0;

  return (
    <Modal
      visible={open}
      animationType="fade"
      onRequestClose={onClose}
      onShow={() => setCurrent(index ?? 0)}
      statusBarTranslucent
      navigationBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        {open ? (
          <FlatList
            data={photos}
            keyExtractor={(u) => u}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={index ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) =>
              setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))
            }
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
            paddingTop: insets.top + 10,
            paddingBottom: 12,
            paddingHorizontal: 20,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        >
          <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: "600", color: "#fff" }}>
            {open ? attachmentFileName(photos[shown] ?? "") : ""}
            {open && photos.length > 1 ? `  ·  ${shown + 1}/${photos.length}` : ""}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close preview"
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(255,255,255,0.16)",
            }}
          >
            <X size={20} color="#fff" strokeWidth={2.2} />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
