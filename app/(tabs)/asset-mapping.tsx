/**
 * Asset Mapping tab — the Claude Design "JouleOps Asset Mapping" flow,
 * presented like the other module tabs (Tickets / Incidents): shared list
 * chrome in the tab, and a full-screen detail modal with the ticket-detail
 * header, cards and sticky action bar.
 *
 * A one-time walk of each site: every asset gets a nameplate photo and a
 * location photo (taken with the camera or picked from the gallery), or is
 * logged as non-accessible with proof. The nameplate is read by AI on the
 * backend in the background — the upload just confirms and closes, and the
 * result arrives as a push naming the asset. A failed read moves the asset to
 * the Failed tab for a re-upload. Documented assets go to Review; a
 * manager/admin approves them to Completed (here or on the web Asset Mapping
 * page). These statuses are this flow's own — unrelated to asset status.
 *
 * Navigation:
 *   tab                  the asset list
 *   full-screen modal    detail ↔ QR label, and on top of it the camera,
 *                        by-hand nameplate entry, or the cannot-access form
 * A push about an asset deep-links here with ?assetId=&siteCode=.
 *
 * Online-only (see AssetMappingService).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Modal, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import * as Notifications from "expo-notifications";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useDs } from "@/hooks/useDs";
import {
  AssetMappingService,
  canApproveMapping,
  type MappedAsset,
  type MappingEquipment,
} from "@/services/AssetMappingService";
import AssetListView from "@/components/asset-mapping/AssetListView";
import AssetDetailView, { type PhotoSource } from "@/components/asset-mapping/AssetDetailView";
import AssetQrView from "@/components/asset-mapping/AssetQrView";
import CaptureCamera, { type CaptureMode } from "@/components/asset-mapping/CaptureCamera";
import NameplateConfirm from "@/components/asset-mapping/NameplateConfirm";
import CannotAccessForm, {
  type CannotAccessDraft,
} from "@/components/asset-mapping/CannotAccessForm";
import EquipmentDetailView from "@/components/asset-mapping/EquipmentDetailView";
import PhotoViewer from "@/components/asset-mapping/PhotoViewer";
import { manualSeedText, typeMeta } from "@/components/asset-mapping/lib";

type Screen = "detail" | "qr" | "equipment";
type DocMode = "nameplate" | "location";
/** What a captured / picked photo is for. */
type PhotoTarget =
  | { kind: "asset"; mode: DocMode }
  | { kind: "equipment-nameplate"; equipmentId: string }
  | { kind: "equipment-photo"; equipmentId: string };

type Busy = { title: string; sub: string };

type Flow =
  | { step: "camera"; mode: CaptureMode; target: PhotoTarget | null; busy: Busy | null }
  /** Editing nameplate text — the asset's, or one line item's. */
  | {
      step: "confirm";
      owner: { kind: "asset"; photoUrl: string } | { kind: "equipment"; equipmentId: string };
      title: string;
      text: string;
      rawText: string;
      saving: boolean;
    }
  | { step: "cannot"; submitting: boolean };

const UPLOADING: Busy = { title: "Uploading photo…", sub: "Hold on a moment" };

const NAMEPLATE_UPLOADED = {
  title: "Nameplate uploaded",
  body: "We're reading the details in the background. You'll get a notification when it's done.",
};

const UPLOADED_COPY: Record<PhotoTarget["kind"] | DocMode, { title: string; body: string }> = {
  nameplate: NAMEPLATE_UPLOADED,
  asset: NAMEPLATE_UPLOADED,
  location: { title: "Location photo uploaded", body: "Saved to this asset." },
  "equipment-nameplate": NAMEPLATE_UPLOADED,
  "equipment-photo": { title: "Photo uploaded", body: "Added to this equipment." },
};

/** Same compression as the camera shot, so a gallery pick fits the 5 MB read limit. */
const LIBRARY_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ["images"],
  quality: 0.55,
  allowsEditing: false,
};

const EMPTY_DRAFT: CannotAccessDraft = { reason: "", notes: "", proofUri: null };
const EMPTY: MappedAsset[] = [];

const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default function AssetMappingTab() {
  const ds = useDs();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isConnected } = useNetworkStatus();
  const offline = isConnected === false;
  const { sites, selectedSite, selectSite } = useSites(user?.user_id || user?.id);
  const siteCode = selectedSite?.site_code || "";
  const siteName = selectedSite?.site_name || selectedSite?.site_code || "Select site";
  const params = useLocalSearchParams<{ assetId?: string | string[]; siteCode?: string | string[] }>();

  /* ── data ── */
  // Results are tagged with the site they were loaded for, so switching sites
  // never shows the previous site's assets while the new list loads.
  const [loaded, setLoaded] = useState<{ site: string; rows: MappedAsset[]; error: string | null }>({
    site: "",
    rows: [],
    error: null,
  });
  const current = loaded.site === siteCode;
  const assets = current ? loaded.rows : EMPTY;
  const [refreshing, setRefreshing] = useState(false);
  const latestSite = useRef("");

  const fetchSite = useCallback(async (code: string) => {
    latestSite.current = code;
    try {
      const rows = await AssetMappingService.getSiteAssets(code);
      if (latestSite.current !== code) return;
      setLoaded({ site: code, rows, error: null });
    } catch (error: any) {
      if (latestSite.current !== code) return;
      setLoaded((prev) => ({
        site: code,
        rows: prev.site === code ? prev.rows : [],
        error: error?.message || "Couldn't load assets.",
      }));
    }
  }, []);

  useEffect(() => {
    if (siteCode) void fetchSite(siteCode);
  }, [siteCode, fetchSite]);

  const refresh = useCallback(async () => {
    if (!siteCode) return;
    setRefreshing(true);
    await fetchSite(siteCode);
    setRefreshing(false);
  }, [siteCode, fetchSite]);

  // A background read finished (push arrived while the app is open): reload
  // this site so the asset leaves "Reading…" / lands in Failed right away.
  useEffect(() => {
    const sub = Notifications.addNotificationReceivedListener((n) => {
      const data = n.request.content.data as Record<string, unknown> | undefined;
      if (!String(data?.type ?? "").startsWith("asset_mapping")) return;
      if (siteCode && (!data?.site_code || data.site_code === siteCode)) void fetchSite(siteCode);
    });
    return () => sub.remove();
  }, [siteCode, fetchSite]);

  const replaceAsset = useCallback((updated: MappedAsset) => {
    setLoaded((prev) => ({
      ...prev,
      rows: prev.rows.map((a) => (a.asset_id === updated.asset_id ? updated : a)),
    }));
  }, []);

  /* ── navigation ── */
  const [screen, setScreen] = useState<Screen>("detail");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [draft, setDraft] = useState<CannotAccessDraft>(EMPTY_DRAFT);
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  // A gallery pick (or an equipment edit) works straight from the detail screen.
  const [libraryUpload, setLibraryUpload] = useState(false);
  const [equipmentId, setEquipmentId] = useState<string | null>(null);
  const canApprove = canApproveMapping(user);

  // The detail modal is open while an asset is selected (and still listed).
  const asset = assets.find((a) => a.asset_id === selectedId) ?? null;

  // Deep link from a push: switch to the asset's site, then open it once listed.
  const handledLink = useRef("");
  const linkAssetId = firstParam(params.assetId);
  const linkSiteCode = firstParam(params.siteCode);
  useEffect(() => {
    if (!linkAssetId || handledLink.current === linkAssetId) return;
    if (linkSiteCode && linkSiteCode !== siteCode) {
      const site = sites.find((s) => s.site_code === linkSiteCode);
      if (site) void selectSite(site);
      return;
    }
    if (!current) return;
    handledLink.current = linkAssetId;
    if (assets.some((a) => a.asset_id === linkAssetId)) {
      setScreen("detail");
      setSelectedId(linkAssetId);
    }
  }, [linkAssetId, linkSiteCode, siteCode, sites, selectSite, current, assets]);

  // Ignore results from a flow the operator has already left.
  const flowSeq = useRef(0);
  const closeFlow = useCallback(() => {
    flowSeq.current += 1;
    setFlow(null);
  }, []);

  const requireOnline = () => {
    if (!offline) return true;
    Alert.alert("You're offline", "Connect to the internet to document assets.");
    return false;
  };

  const fail = (seq: number, error: any, back: Flow | null) => {
    if (seq !== flowSeq.current) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    Alert.alert("Something went wrong", error?.message || "Please try again.");
    setFlow(back);
  };

  /** Upload a local photo to S3 and attach it — the only step the user waits on. */
  const submitPhoto = async (target: MappedAsset, to: PhotoTarget, uri: string) => {
    const kind = to.kind === "asset" ? to.mode : "nameplate";
    const photoUrl = await AssetMappingService.uploadPhoto(
      target,
      to.kind === "equipment-photo" ? "equipment" : kind,
      uri,
    );
    switch (to.kind) {
      case "asset":
        return to.mode === "nameplate"
          ? AssetMappingService.uploadNameplate(target.asset_id, photoUrl)
          : AssetMappingService.saveLocation(target.asset_id, photoUrl);
      case "equipment-nameplate":
        return AssetMappingService.uploadEquipmentNameplate(
          target.asset_id,
          to.equipmentId,
          photoUrl,
        );
      case "equipment-photo":
        return AssetMappingService.addEquipmentPhoto(target.asset_id, to.equipmentId, photoUrl);
    }
  };

  const uploaded = (to: PhotoTarget) => {
    const copy = UPLOADED_COPY[to.kind === "asset" ? to.mode : to.kind];
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert(copy.title, copy.body);
  };

  const pickFromLibrary = async (to: PhotoTarget) => {
    if (!asset) return;
    const target = asset;
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Permission required", "Allow photo library access to upload a photo.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync(LIBRARY_OPTIONS);
      const uri = result.canceled ? null : result.assets?.[0]?.uri;
      if (!uri) return;
      setLibraryUpload(true);
      replaceAsset(await submitPhoto(target, to, uri));
      uploaded(to);
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Upload failed", error?.message || "Please try again.");
    } finally {
      setLibraryUpload(false);
    }
  };

  const cameraModeFor = (to: PhotoTarget): CaptureMode =>
    to.kind === "asset" ? to.mode : to.kind === "equipment-nameplate" ? "nameplate" : "location";

  const startPhoto = (to: PhotoTarget, source: PhotoSource) => {
    if (!requireOnline()) return;
    const go = () =>
      source === "camera"
        ? setFlow({ step: "camera", mode: cameraModeFor(to), target: to, busy: null })
        : void pickFromLibrary(to);
    // Re-documenting an approved asset sends it back for approval.
    if (asset?.mapping_status === "completed" && to.kind === "asset") {
      Alert.alert(
        "Asset already approved",
        "A new photo sends this asset back to Review for a manager to approve again.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Continue", onPress: go },
        ],
      );
      return;
    }
    go();
  };

  /** One-shot equipment call (add / rename / delete / remove photo). */
  const runEquipment = async (fn: () => Promise<MappedAsset>) => {
    if (!requireOnline()) return;
    setLibraryUpload(true);
    try {
      replaceAsset(await fn());
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Something went wrong", error?.message || "Please try again.");
    } finally {
      setLibraryUpload(false);
    }
  };

  const approve = async () => {
    if (!asset || approvingId || !requireOnline()) return;
    setApprovingId(asset.asset_id);
    try {
      const updated = await AssetMappingService.approve(asset);
      replaceAsset(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Couldn't approve", error?.message || "Please try again.");
      // The asset may have changed underneath us — show the latest.
      if (siteCode) void fetchSite(siteCode);
    } finally {
      setApprovingId(null);
    }
  };

  const onCapture = async (uri: string) => {
    if (!asset || flow?.step !== "camera") return;

    if (!flow.target) {
      // Cannot-access proof: kept locally until the form is submitted.
      setDraft((d) => ({ ...d, proofUri: uri }));
      setFlow({ step: "cannot", submitting: false });
      return;
    }

    const to = flow.target;
    const seq = flowSeq.current;
    setFlow({ step: "camera", mode: flow.mode, target: to, busy: UPLOADING });
    try {
      const updated = await submitPhoto(asset, to, uri);
      if (seq !== flowSeq.current) return;
      replaceAsset(updated);
      closeFlow();
      uploaded(to);
    } catch (error) {
      fail(seq, error, { step: "camera", mode: flow.mode, target: to, busy: null });
    }
  };

  const saveConfirm = async () => {
    if (!asset || flow?.step !== "confirm") return;
    const f = flow;
    const seq = flowSeq.current;
    setFlow({ ...f, saving: true });
    try {
      const updated =
        f.owner.kind === "asset"
          ? await AssetMappingService.saveNameplateText(asset.asset_id, {
              photoUrl: f.owner.photoUrl,
              text: f.text,
            })
          : await AssetMappingService.saveEquipmentText(
              asset.asset_id,
              f.owner.equipmentId,
              f.text,
            );
      if (seq !== flowSeq.current) return;
      replaceAsset(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeFlow();
    } catch (error) {
      fail(seq, error, { ...f, saving: false });
    }
  };

  /** Open the text editor for the asset's nameplate, or a line item's. */
  const editSpecs = (owner: MappingEquipment | null) => {
    if (!asset || !requireOnline()) return;
    if (owner) {
      setFlow({
        step: "confirm",
        owner: { kind: "equipment", equipmentId: owner.id },
        title: owner.name,
        text: owner.nameplate_data?.text || manualSeedText(typeMeta(asset)),
        rawText: owner.nameplate_data?.raw_text ?? "",
        saving: false,
      });
      return;
    }
    if (!asset.nameplate_photo_url) return;
    setFlow({
      step: "confirm",
      owner: { kind: "asset", photoUrl: asset.nameplate_photo_url },
      title: asset.asset_name,
      text: asset.nameplate_data?.text || manualSeedText(typeMeta(asset)),
      rawText: asset.nameplate_data?.raw_text ?? "",
      saving: false,
    });
  };

  /* ── cannot access ── */
  const submitCannot = async () => {
    if (!asset || !draft.reason || !draft.proofUri || !requireOnline()) return;
    const seq = flowSeq.current;
    setFlow({ step: "cannot", submitting: true });
    try {
      const proofUrl = await AssetMappingService.uploadPhoto(asset, "no-access", draft.proofUri);
      const updated = await AssetMappingService.logNoAccess(asset.asset_id, {
        reason: draft.reason,
        notes: draft.notes,
        proofPhotoUrl: proofUrl,
      });
      if (seq !== flowSeq.current) return;
      replaceAsset(updated);
      setDraft(EMPTY_DRAFT);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeFlow();
    } catch (error) {
      fail(seq, error, { step: "cannot", submitting: false });
    }
  };

  /* ── flow back / close ── */
  const flowBusy =
    (flow?.step === "camera" && !!flow.busy) ||
    (flow?.step === "confirm" && flow.saving) ||
    (flow?.step === "cannot" && flow.submitting);

  const onFlowBack = () => {
    if (!flow || flowBusy) return;
    if (flow.step === "camera" && !flow.target) {
      setFlow({ step: "cannot", submitting: false });
      return;
    }
    closeFlow();
  };

  const renderFlow = () => {
    if (!flow || !asset) return null;
    const top = insets.top;
    const bottom = insets.bottom;
    switch (flow.step) {
      case "camera":
        return (
          <CaptureCamera
            mode={flow.mode}
            assetName={asset.asset_name}
            topInset={top}
            bottomInset={bottom}
            busy={flow.busy}
            onCapture={onCapture}
            onCancel={onFlowBack}
          />
        );
      case "confirm":
        return (
          <NameplateConfirm
            topInset={top}
            bottomInset={bottom}
            assetName={flow.title}
            manual
            text={flow.text}
            rawText={flow.rawText}
            saving={flow.saving}
            onChangeText={(text) => setFlow({ ...flow, text })}
            onBack={onFlowBack}
            onRetake={() =>
              startPhoto(
                flow.owner.kind === "asset"
                  ? { kind: "asset", mode: "nameplate" }
                  : { kind: "equipment-nameplate", equipmentId: flow.owner.equipmentId },
                "camera",
              )
            }
            onSave={saveConfirm}
          />
        );
      case "cannot":
        return (
          <CannotAccessForm
            topInset={top}
            bottomInset={bottom}
            asset={asset}
            draft={draft}
            submitting={flow.submitting}
            onChange={setDraft}
            onCaptureProof={() => setFlow({ step: "camera", mode: "proof", target: null, busy: null })}
            onBack={onFlowBack}
            onSubmit={submitCannot}
          />
        );
    }
  };

  const selectedEquipment = asset?.equipment?.find((e) => e.id === equipmentId) ?? null;

  const closeDetail = () => {
    if (flow || approvingId || libraryUpload) return;
    setSelectedId(null);
    setEquipmentId(null);
    setScreen("detail");
  };

  const onModalBack = () => {
    if (flow) onFlowBack();
    else if (screen === "qr") setScreen("detail");
    else if (screen === "equipment") {
      setEquipmentId(null);
      setScreen("detail");
    } else closeDetail();
  };

  return (
    <View style={{ flex: 1, backgroundColor: ds.pageBg }}>
      <AssetListView
        topInset={insets.top}
        siteName={siteName}
        sites={sites}
        siteCode={siteCode}
        onSelectSite={(site) => {
          setSelectedId(null);
          void selectSite(site);
        }}
        user={user}
        assets={assets}
        loading={!!siteCode && !current}
        error={current ? loaded.error : null}
        offline={offline}
        refreshing={refreshing}
        onRefresh={refresh}
        onOpen={(a) => {
          setScreen("detail");
          setSelectedId(a.asset_id);
        }}
      />

      <Modal
        visible={!!asset}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={onModalBack}
      >
        {!asset ? null : flow ? (
          renderFlow()
        ) : screen === "equipment" && selectedEquipment ? (
          <EquipmentDetailView
            topInset={insets.top}
            asset={asset}
            equipment={selectedEquipment}
            busy={libraryUpload}
            onBack={() => {
              setEquipmentId(null);
              setScreen("detail");
            }}
            onRename={(name) =>
              void runEquipment(() =>
                AssetMappingService.renameEquipment(asset.asset_id, selectedEquipment.id, name),
              )
            }
            onDelete={() =>
              Alert.alert("Remove equipment", `Remove "${selectedEquipment.name}" and its photos?`, [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Remove",
                  style: "destructive",
                  onPress: () => {
                    setEquipmentId(null);
                    setScreen("detail");
                    void runEquipment(() =>
                      AssetMappingService.deleteEquipment(asset.asset_id, selectedEquipment.id),
                    );
                  },
                },
              ])
            }
            onNameplatePhoto={(source) =>
              startPhoto({ kind: "equipment-nameplate", equipmentId: selectedEquipment.id }, source)
            }
            onEditSpecs={() => editSpecs(selectedEquipment)}
            onAddPhoto={(source) =>
              startPhoto({ kind: "equipment-photo", equipmentId: selectedEquipment.id }, source)
            }
            onRemovePhoto={(url) =>
              void runEquipment(() =>
                AssetMappingService.removeEquipmentPhoto(asset.asset_id, selectedEquipment.id, url),
              )
            }
            onPreview={(url, title) => setPreview({ url, title })}
          />
        ) : screen === "qr" ? (
          <AssetQrView topInset={insets.top} asset={asset} onBack={() => setScreen("detail")} />
        ) : (
          <AssetDetailView
            topInset={insets.top}
            bottomInset={insets.bottom}
            asset={asset}
            onBack={closeDetail}
            onViewQr={() => setScreen("qr")}
            onNameplatePhoto={(source) => startPhoto({ kind: "asset", mode: "nameplate" }, source)}
            onLocationPhoto={(source) => startPhoto({ kind: "asset", mode: "location" }, source)}
            onCannotAccess={() => {
              if (!requireOnline()) return;
              setDraft(EMPTY_DRAFT);
              setFlow({ step: "cannot", submitting: false });
            }}
            onEnterSpecs={() => editSpecs(null)}
            onEditSpecs={() => editSpecs(null)}
            equipment={{
              onOpen: (id) => {
                setEquipmentId(id);
                setScreen("equipment");
              },
              onAdd: (name) => void runEquipment(() => AssetMappingService.addEquipment(asset.asset_id, name)),
            }}
            onPreview={(url, title) => setPreview({ url, title })}
            canApprove={canApprove}
            approving={approvingId === asset.asset_id}
            onApprove={approve}
          />
        )}
        {libraryUpload ? (
          <View style={styles.uploading}>
            <ActivityIndicator size="large" color="#FFFFFF" />
            <Text style={styles.uploadingText}>{UPLOADING.title}</Text>
          </View>
        ) : null}
        {/* Inside the presented modal so it stacks above the detail on iOS. */}
        <PhotoViewer photo={preview} onClose={() => setPreview(null)} />
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  uploading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  uploadingText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
});
