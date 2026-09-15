/**
 * Asset Mapping tab — built to the Claude Design "JouleOps Asset Mapping"
 * prototype (layout and flow), in the app's own theme colours.
 *
 * A one-time walk of each site: every asset gets a nameplate photo (read by
 * AI on the backend) and a location photo, or is logged as non-accessible
 * with proof. Unrelated to asset status or any other asset flow.
 *
 * Navigation mirrors the prototype:
 *   in the tab (bar visible)   list → detail → QR
 *   full-screen (bar hidden)   camera · confirm nameplate · extraction failed · cannot access
 *
 * Online-only (see AssetMappingService).
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, BackHandler, Modal, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useAuth } from "@/contexts/AuthContext";
import { useSites } from "@/hooks/useSites";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { useDs } from "@/hooks/useDs";
import {
  AssetMappingService,
  type MappedAsset,
  type NameplateQualityIssue,
} from "@/services/AssetMappingService";
import AssetListView from "@/components/asset-mapping/AssetListView";
import AssetDetailView from "@/components/asset-mapping/AssetDetailView";
import AssetQrView from "@/components/asset-mapping/AssetQrView";
import CaptureCamera, { type CaptureMode } from "@/components/asset-mapping/CaptureCamera";
import NameplateConfirm from "@/components/asset-mapping/NameplateConfirm";
import ExtractionFailed from "@/components/asset-mapping/ExtractionFailed";
import CannotAccessForm, {
  type CannotAccessDraft,
} from "@/components/asset-mapping/CannotAccessForm";
import SiteSheet from "@/components/asset-mapping/SiteSheet";
import {
  amPalette,
  manualSeedText,
  typeMeta,
  type ListFilter,
} from "@/components/asset-mapping/lib";

type Screen = "list" | "detail" | "qr";

type Busy = { title: string; sub: string };

type Flow =
  | { step: "camera"; mode: CaptureMode; busy: Busy | null; issues: NameplateQualityIssue[] | null; photoUrl?: string }
  | { step: "confirm"; photoUrl: string; text: string; rawText: string; manual: boolean; saving: boolean }
  | { step: "failed"; photoUrl: string }
  | { step: "cannot"; submitting: boolean };

const BUSY = {
  uploading: { title: "Uploading photo…", sub: "Hold on a moment" },
  checking: { title: "Checking image quality…", sub: "focus · lighting · glare" },
  reading: { title: "Reading text with AI vision…", sub: "This can take up to 30 seconds" },
  location: { title: "Saving location photo…", sub: "Hold on a moment" },
} satisfies Record<string, Busy>;

const EMPTY_DRAFT: CannotAccessDraft = { reason: "", notes: "", proofUri: null };
const EMPTY: MappedAsset[] = [];

export default function AssetMappingTab() {
  const ds = useDs();
  const p = amPalette(ds);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { isConnected } = useNetworkStatus();
  const offline = isConnected === false;
  const { sites, selectedSite, selectSite } = useSites(user?.user_id || user?.id);
  const siteCode = selectedSite?.site_code || "";
  const siteName = selectedSite?.site_name || selectedSite?.site_code || "Select site";

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

  const replaceAsset = useCallback((updated: MappedAsset) => {
    setLoaded((prev) => ({
      ...prev,
      rows: prev.rows.map((a) => (a.asset_id === updated.asset_id ? updated : a)),
    }));
  }, []);

  /* ── navigation ── */
  const [screen, setScreen] = useState<Screen>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<ListFilter>("All");
  const [search, setSearch] = useState("");
  const [sitesOpen, setSitesOpen] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [draft, setDraft] = useState<CannotAccessDraft>(EMPTY_DRAFT);

  const asset = assets.find((a) => a.asset_id === selectedId) ?? null;
  const onScreen = asset ? screen : "list";

  // Ignore results from a flow the operator has already left.
  const flowSeq = useRef(0);
  const closeFlow = useCallback(() => {
    flowSeq.current += 1;
    setFlow(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", () => {
        if (onScreen === "qr") {
          setScreen("detail");
          return true;
        }
        if (onScreen === "detail") {
          setScreen("list");
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }, [onScreen]),
  );

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

  const openCamera = (mode: CaptureMode) => {
    if (mode !== "proof" && !requireOnline()) return;
    setFlow({ step: "camera", mode, busy: null, issues: null });
  };

  const aimFlow = (mode: CaptureMode): Flow => ({ step: "camera", mode, busy: null, issues: null });

  /* ── nameplate ── */
  const runScan = async (target: MappedAsset, photoUrl: string, acceptPoorQuality: boolean) => {
    const seq = flowSeq.current;
    setFlow({
      step: "camera",
      mode: "nameplate",
      busy: acceptPoorQuality ? BUSY.reading : BUSY.checking,
      issues: null,
      photoUrl,
    });
    // One backend call does both checks; move the label on once the quality
    // check has plausibly finished.
    const timer = acceptPoorQuality
      ? null
      : setTimeout(() => {
          if (seq !== flowSeq.current) return;
          setFlow((f) => (f?.step === "camera" && f.busy ? { ...f, busy: BUSY.reading } : f));
        }, 2500);

    try {
      const result = await AssetMappingService.scanNameplate(target.asset_id, photoUrl, acceptPoorQuality);
      if (seq !== flowSeq.current) return;
      if (result.outcome === "poor_quality") {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setFlow({ step: "camera", mode: "nameplate", busy: null, issues: result.issues, photoUrl });
      } else if (result.outcome === "failed") {
        replaceAsset(result.asset);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        setFlow({ step: "failed", photoUrl });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        setFlow({
          step: "confirm",
          photoUrl,
          text: result.text,
          rawText: result.raw_text,
          manual: false,
          saving: false,
        });
      }
    } catch (error) {
      fail(seq, error, aimFlow("nameplate"));
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  const onCapture = async (uri: string) => {
    if (!asset || flow?.step !== "camera") return;
    const mode = flow.mode;

    if (mode === "proof") {
      setDraft((d) => ({ ...d, proofUri: uri }));
      setFlow({ step: "cannot", submitting: false });
      return;
    }

    const seq = flowSeq.current;
    setFlow({ step: "camera", mode, busy: mode === "location" ? BUSY.location : BUSY.uploading, issues: null });
    let photoUrl: string;
    try {
      photoUrl = await AssetMappingService.uploadPhoto(asset, mode, uri);
    } catch (error) {
      fail(seq, error, aimFlow(mode));
      return;
    }
    if (seq !== flowSeq.current) return;

    if (mode === "nameplate") {
      await runScan(asset, photoUrl, false);
      return;
    }

    try {
      const updated = await AssetMappingService.saveLocation(asset.asset_id, photoUrl);
      if (seq !== flowSeq.current) return;
      replaceAsset(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeFlow();
    } catch (error) {
      fail(seq, error, aimFlow("location"));
    }
  };

  const saveConfirm = async () => {
    if (!asset || flow?.step !== "confirm") return;
    const f = flow;
    const seq = flowSeq.current;
    setFlow({ ...f, saving: true });
    try {
      const updated = await AssetMappingService.confirmNameplate(asset.asset_id, {
        photoUrl: f.photoUrl,
        text: f.text,
        manual: f.manual,
      });
      if (seq !== flowSeq.current) return;
      replaceAsset(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      closeFlow();
    } catch (error) {
      fail(seq, error, { ...f, saving: false });
    }
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
    if (flow.step === "camera" && flow.mode === "proof") {
      setFlow({ step: "cannot", submitting: false });
      return;
    }
    if (flow.step === "camera" && flow.issues) {
      setFlow(aimFlow("nameplate"));
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
            issues={flow.issues}
            onCapture={onCapture}
            onCancel={onFlowBack}
            onRetake={() => setFlow(aimFlow("nameplate"))}
            onUseAnyway={() => {
              if (flow.photoUrl) void runScan(asset, flow.photoUrl, true);
            }}
          />
        );
      case "confirm":
        return (
          <NameplateConfirm
            topInset={top}
            bottomInset={bottom}
            assetName={asset.asset_name}
            manual={flow.manual}
            text={flow.text}
            rawText={flow.rawText}
            saving={flow.saving}
            onChangeText={(text) => setFlow({ ...flow, text })}
            onBack={onFlowBack}
            onRetake={() => setFlow(aimFlow("nameplate"))}
            onSave={saveConfirm}
          />
        );
      case "failed":
        return (
          <ExtractionFailed
            topInset={top}
            bottomInset={bottom}
            onRetake={() => setFlow(aimFlow("nameplate"))}
            onEnterManually={() =>
              setFlow({
                step: "confirm",
                photoUrl: flow.photoUrl,
                text: manualSeedText(typeMeta(asset, p.sub)),
                rawText: asset.nameplate_data?.raw_text ?? "",
                manual: true,
                saving: false,
              })
            }
            onSavePhotoOnly={closeFlow}
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
            onCaptureProof={() => openCamera("proof")}
            onBack={onFlowBack}
            onSubmit={submitCannot}
          />
        );
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: p.screen }}>
      {onScreen === "list" || !asset ? (
        <AssetListView
          topInset={insets.top}
          siteName={siteName}
          onPressSite={() => setSitesOpen(true)}
          assets={assets}
          loading={!!siteCode && !current}
          error={current ? loaded.error : null}
          offline={offline}
          refreshing={refreshing}
          onRefresh={refresh}
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          onOpen={(a) => {
            setSelectedId(a.asset_id);
            setScreen("detail");
          }}
        />
      ) : onScreen === "qr" ? (
        <AssetQrView topInset={insets.top} asset={asset} onBack={() => setScreen("detail")} />
      ) : (
        <AssetDetailView
          topInset={insets.top}
          asset={asset}
          onBack={() => setScreen("list")}
          onViewQr={() => setScreen("qr")}
          onCaptureNameplate={() => openCamera("nameplate")}
          onCaptureLocation={() => openCamera("location")}
          onCannotAccess={() => {
            if (!requireOnline()) return;
            setDraft(EMPTY_DRAFT);
            setFlow({ step: "cannot", submitting: false });
          }}
        />
      )}

      <Modal
        visible={!!flow && !!asset}
        animationType="slide"
        presentationStyle="fullScreen"
        statusBarTranslucent
        onRequestClose={onFlowBack}
      >
        {renderFlow()}
      </Modal>

      <SiteSheet
        visible={sitesOpen}
        sites={sites}
        selectedCode={siteCode}
        onClose={() => setSitesOpen(false)}
        onSelect={async (s) => {
          setSitesOpen(false);
          const site = sites.find((x) => x.site_code === s.site_code);
          if (site) {
            setScreen("list");
            setSelectedId(null);
            await selectSite(site);
          }
        }}
      />
    </View>
  );
}
