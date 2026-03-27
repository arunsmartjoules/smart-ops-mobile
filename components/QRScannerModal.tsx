import React, { useState, useRef, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TouchableOpacity,
  useColorScheme,
} from "react-native";
import { X } from "lucide-react-native";
import { AssetService } from "@/services/AssetService";

// Lazy import — avoids crashing the PM screen if expo-camera native module
// isn't linked in the current build yet.
let CameraView: any = null;
let useCameraPermissions: any = null;
try {
  const cam = require("expo-camera");
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
} catch {
  // expo-camera not available in this build
}

export interface QRScannerRef {
  open: () => void;
}

interface QRScannerModalProps {
  siteCode: string;
  onClose: () => void;
  onAssetFound: (assetName: string) => void;
}

const QRScannerModal = React.forwardRef<QRScannerRef, QRScannerModalProps>(
  ({ siteCode, onClose, onAssetFound }, ref) => {
    const isDark = useColorScheme() === "dark";
    const [visible, setVisible] = useState(false);
    const [validating, setValidating] = useState(false);
    const scannedRef = useRef(false);

    // useCameraPermissions is null when expo-camera native module isn't linked
    const permissionHook = useCameraPermissions ? useCameraPermissions() : [null, async () => ({ granted: false })];
    const [permission, requestPermission] = permissionHook as [any, any];

    const close = useCallback(() => {
      scannedRef.current = false;
      setValidating(false);
      setVisible(false);
      onClose();
    }, [onClose]);

    const open = useCallback(async () => {
      if (!CameraView) {
        Alert.alert(
          "Not Available",
          "QR scanning requires a dev or preview build. Please rebuild the app.",
        );
        return;
      }
      if (!permission?.granted) {
        const result = await requestPermission();
        if (!result.granted) {
          Alert.alert(
            "Permission Required",
            "Camera permission is needed to scan QR codes.",
          );
          return;
        }
      }
      scannedRef.current = false;
      setValidating(false);
      setVisible(true);
    }, [permission, requestPermission]);

    React.useImperativeHandle(ref, () => ({ open }), [open]);

    const handleBarCodeScanned = useCallback(
      async ({ data }: { data: string }) => {
        if (scannedRef.current) return;
        scannedRef.current = true;
        setValidating(true);

        try {
          const asset = await AssetService.getAssetByQrId(data, siteCode);

          if (!asset) {
            setValidating(false);
            Alert.alert("Invalid QR", "No assets found for this QR code.", [
              {
                text: "Scan Again",
                onPress: () => {
                  scannedRef.current = false;
                },
              },
              { text: "Cancel", onPress: close },
            ]);
            return;
          }

          if (asset.site_code !== siteCode) {
            setValidating(false);
            Alert.alert("Access Denied", "You are not part of that site.", [
              {
                text: "Scan Again",
                onPress: () => {
                  scannedRef.current = false;
                },
              },
              { text: "Cancel", onPress: close },
            ]);
            return;
          }

          close();
          onAssetFound(asset.asset_name);
        } catch {
          setValidating(false);
          scannedRef.current = false;
          Alert.alert("Error", "Failed to validate QR code. Please try again.");
        }
      },
      [siteCode, onAssetFound, close],
    );

    const bg = isDark ? "#000" : "#000";

    return (
      <Modal
        visible={visible}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={close}
      >
        <View style={styles.container}>
          {permission?.granted ? (
            <CameraView
              style={StyleSheet.absoluteFill}
              facing="back"
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={validating ? undefined : handleBarCodeScanned}
            />
          ) : null}

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={close} style={styles.closeBtn}>
              <X size={22} color="#fff" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Scan Asset QR Code</Text>
            <View style={{ width: 40 }} />
          </View>

          {/* Scan window overlay */}
          <View style={styles.overlay}>
            <View style={styles.overlayTop} />
            <View style={styles.overlayRow}>
              <View style={styles.overlaySide} />
              <View style={styles.scanWindow}>
                <View style={[styles.corner, styles.cornerTL]} />
                <View style={[styles.corner, styles.cornerTR]} />
                <View style={[styles.corner, styles.cornerBL]} />
                <View style={[styles.corner, styles.cornerBR]} />
              </View>
              <View style={styles.overlaySide} />
            </View>
            <View style={styles.overlayBottom}>
              {validating ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.hint}>
                  Point camera at the asset QR code
                </Text>
              )}
            </View>
          </View>
        </View>
      </Modal>
    );
  },
);

QRScannerModal.displayName = "QRScannerModal";
export default QRScannerModal;

const SCAN_SIZE = 240;
const DIM = "rgba(0,0,0,0.65)";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 16,
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.4)",
    borderRadius: 20,
  },
  headerTitle: { color: "#fff", fontSize: 16, fontWeight: "700" },

  // Overlay
  overlay: { ...StyleSheet.absoluteFillObject },
  overlayTop: { flex: 1, backgroundColor: DIM },
  overlayRow: { flexDirection: "row", height: SCAN_SIZE },
  overlaySide: { flex: 1, backgroundColor: DIM },
  scanWindow: { width: SCAN_SIZE, height: SCAN_SIZE },
  overlayBottom: {
    flex: 1,
    backgroundColor: DIM,
    alignItems: "center",
    paddingTop: 24,
  },
  hint: { color: "#e2e8f0", fontSize: 14, textAlign: "center" },

  // Corner markers
  corner: {
    position: "absolute",
    width: 28,
    height: 28,
    borderColor: "#dc2626",
    borderWidth: 3,
  },
  cornerTL: { top: 0, left: 0, borderRightWidth: 0, borderBottomWidth: 0 },
  cornerTR: { top: 0, right: 0, borderLeftWidth: 0, borderBottomWidth: 0 },
  cornerBL: { bottom: 0, left: 0, borderRightWidth: 0, borderTopWidth: 0 },
  cornerBR: { bottom: 0, right: 0, borderLeftWidth: 0, borderTopWidth: 0 },
});
