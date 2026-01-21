/**
 * AppAlert - Custom alert component to replace native alerts
 * Provides a consistent, branded alert experience
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from "react-native";
import {
  AlertCircle,
  CheckCircle,
  Info,
  AlertTriangle,
  X,
} from "lucide-react-native";

// Alert types
type AlertType = "success" | "error" | "warning" | "info";

interface AlertConfig {
  title: string;
  message: string;
  type?: AlertType;
  confirmText?: string;
  cancelText?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  showCancel?: boolean;
}

interface AlertContextType {
  showAlert: (config: AlertConfig) => void;
  showConfirm: (config: AlertConfig) => Promise<boolean>;
  hideAlert: () => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

// Hook for using alerts
export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error("useAlert must be used within an AlertProvider");
  }
  return context;
};

// Icon component based on type
const AlertIcon = ({ type }: { type: AlertType }) => {
  const colors = {
    success: "#22c55e",
    error: "#ef4444",
    warning: "#f59e0b",
    info: "#3b82f6",
  };
  const color = colors[type];

  switch (type) {
    case "success":
      return <CheckCircle size={28} color={color} />;
    case "error":
      return <AlertCircle size={28} color={color} />;
    case "warning":
      return <AlertTriangle size={28} color={color} />;
    case "info":
    default:
      return <Info size={28} color={color} />;
  }
};

// Alert Provider Component
export const AlertProvider = ({ children }: { children: ReactNode }) => {
  const [visible, setVisible] = useState(false);
  const [config, setConfig] = useState<AlertConfig | null>(null);
  const [resolvePromise, setResolvePromise] = useState<
    ((value: boolean) => void) | null
  >(null);
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  const showAlert = useCallback(
    (alertConfig: AlertConfig) => {
      setConfig({ ...alertConfig, showCancel: false });
      setVisible(true);
      Animated.spring(fadeAnim, {
        toValue: 1,
        useNativeDriver: true,
      }).start();
    },
    [fadeAnim],
  );

  const showConfirm = useCallback(
    (alertConfig: AlertConfig): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfig({ ...alertConfig, showCancel: true });
        setResolvePromise(() => resolve);
        setVisible(true);
        Animated.spring(fadeAnim, {
          toValue: 1,
          useNativeDriver: true,
        }).start();
      });
    },
    [fadeAnim],
  );

  const hideAlert = useCallback(() => {
    Animated.timing(fadeAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setVisible(false);
      setConfig(null);
      setResolvePromise(null);
    });
  }, [fadeAnim]);

  const handleConfirm = useCallback(() => {
    config?.onConfirm?.();
    resolvePromise?.(true);
    hideAlert();
  }, [config, resolvePromise, hideAlert]);

  const handleCancel = useCallback(() => {
    config?.onCancel?.();
    resolvePromise?.(false);
    hideAlert();
  }, [config, resolvePromise, hideAlert]);

  const type = config?.type || "info";
  const typeColors = {
    success: { bg: "#dcfce7", border: "#22c55e" },
    error: { bg: "#fee2e2", border: "#ef4444" },
    warning: { bg: "#fef3c7", border: "#f59e0b" },
    info: { bg: "#dbeafe", border: "#3b82f6" },
  };

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, hideAlert }}>
      {children}
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={hideAlert}
      >
        <View style={styles.overlay}>
          <Animated.View
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                transform: [
                  {
                    scale: fadeAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 1],
                    }),
                  },
                ],
              },
            ]}
          >
            {/* Close button */}
            <TouchableOpacity style={styles.closeButton} onPress={hideAlert}>
              <X size={20} color="#94a3b8" />
            </TouchableOpacity>

            {/* Icon */}
            <View
              style={[
                styles.iconContainer,
                { backgroundColor: typeColors[type].bg },
              ]}
            >
              <AlertIcon type={type} />
            </View>

            {/* Content */}
            <Text style={styles.title}>{config?.title}</Text>
            <Text style={styles.message}>{config?.message}</Text>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {config?.showCancel && (
                <TouchableOpacity
                  style={[styles.button, styles.cancelButton]}
                  onPress={handleCancel}
                >
                  <Text style={styles.cancelButtonText}>
                    {config?.cancelText || "Cancel"}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[
                  styles.button,
                  styles.confirmButton,
                  { backgroundColor: typeColors[type].border },
                  !config?.showCancel && { flex: 1 },
                ]}
                onPress={handleConfirm}
              >
                <Text style={styles.confirmButtonText}>
                  {config?.confirmText || "OK"}
                </Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </AlertContext.Provider>
  );
};

const { width } = Dimensions.get("window");

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  container: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 24,
    width: width - 48,
    maxWidth: 400,
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 10,
  },
  closeButton: {
    position: "absolute",
    top: 12,
    right: 12,
    padding: 8,
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
    textAlign: "center",
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    color: "#64748b",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 24,
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#f1f5f9",
  },
  cancelButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#64748b",
  },
  confirmButton: {
    backgroundColor: "#dc2626",
  },
  confirmButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: "white",
  },
});

export default AlertProvider;
