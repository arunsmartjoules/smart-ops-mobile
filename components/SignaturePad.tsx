import React, { useRef, useState } from "react";
import {
  View,
  Modal,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Alert,
} from "react-native";
import { X, Check } from "lucide-react-native";
import Svg, { Path } from "react-native-svg";
import {
  PanGestureHandler,
  GestureHandlerRootView,
  State,
} from "react-native-gesture-handler";
import ViewShot from "react-native-view-shot";

interface SignaturePadProps {
  onOK: (signatureUri: string) => void;
  onClear?: () => void;
  description?: string;
  trigger?: (open: () => void) => React.ReactNode;
  standalone?: boolean;
  okText?: string;
}

export default function SignaturePad({
  onOK,
  onClear,
  description = "Please sign here",
  trigger,
  standalone = false,
  okText = "Save Signature",
}: SignaturePadProps) {
  const isDark = useColorScheme() === "dark";
  const [visible, setVisible] = useState(false);
  const [signatureDone, setSignatureDone] = useState(false);

  // SVG drawing state
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");

  const viewShotRef = useRef<ViewShot>(null);

  const handleClear = () => {
    setPaths([]);
    setCurrentPath("");
    setSignatureDone(false);
    if (onClear) onClear();
  };

  const handleEnd = async () => {
    if (paths.length === 0 && !currentPath) {
      Alert.alert("Signature Required", "Please provide a signature before saving.");
      return;
    }

    try {
      if (viewShotRef.current && viewShotRef.current.capture) {
        // Capture the SVG view into a temporary JPG file
        const uri = await viewShotRef.current.capture();
        setSignatureDone(true);
        onOK(uri);

        if (!standalone) {
          setVisible(false);
        }
      }
    } catch (error) {
      console.error("Signature capture failed", error);
      Alert.alert("Error", "Failed to capture signature image.");
    }
  };

  const onGestureEvent = (event: any) => {
    const { x, y } = event.nativeEvent;
    if (currentPath === "") {
      setCurrentPath(`M${x},${y}`);
    } else {
      setCurrentPath(`${currentPath} L${x},${y}`);
    }
  };

  const onHandlerStateChange = (event: any) => {
    if (event.nativeEvent.state === State.END) {
      if (currentPath) {
        setPaths([...paths, currentPath]);
        setCurrentPath("");
      }
    }
  };

  const renderContent = () => (
    <View
      className={`${standalone ? "flex-1" : "bg-white dark:bg-slate-900 h-[70%] rounded-t-3xl overflow-hidden"}`}
    >
      {/* Header - Only for Modal mode */}
      {!standalone && (
        <View className="flex-row items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
            Sign Below
          </Text>
          <TouchableOpacity
            onPress={() => setVisible(false)}
            className="w-10 h-10 bg-slate-100 dark:bg-slate-800 rounded-full items-center justify-center"
          >
            <X size={20} color="#64748b" />
          </TouchableOpacity>
        </View>
      )}

      {/* Warning Text */}
      <View className="px-5 py-2">
        <Text className="text-slate-500 dark:text-slate-400 text-sm">
          {description}
        </Text>
      </View>

      {/* Canvas */}
      <View className={`flex-1 m-4 rounded-xl overflow-hidden border ${isDark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-white"}`}>
        <GestureHandlerRootView style={styles.gestureRoot}>
          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
            minDist={0} // Important to catch immediate taps
          >
            <View style={styles.flexView}>
              <ViewShot 
                ref={viewShotRef} 
                options={{ format: "jpg", quality: 0.8 }} 
                style={[styles.flexView, { backgroundColor: isDark ? "#1e293b" : "#ffffff" }]}
              >
                <Svg style={StyleSheet.absoluteFill}>
                  {paths.map((p, i) => (
                    <Path
                      key={i}
                      d={p}
                      stroke={isDark ? "#ffffff" : "#000000"}
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}
                  {currentPath ? (
                    <Path
                      d={currentPath}
                      stroke={isDark ? "#ffffff" : "#000000"}
                      strokeWidth={3}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ) : null}
                </Svg>
              </ViewShot>
            </View>
          </PanGestureHandler>
        </GestureHandlerRootView>
      </View>

      {/* Footer */}
      <View className="flex-row p-5 gap-3 bg-white dark:bg-slate-900 border-t border-slate-50 dark:border-slate-800">
        <TouchableOpacity
          onPress={handleClear}
          className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 rounded-xl items-center"
        >
          <Text className="font-bold text-slate-700 dark:text-slate-300">
            Clear
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleEnd}
          className="flex-1 py-4 bg-blue-600 rounded-xl items-center"
        >
          <Text className="font-bold text-white">{okText}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  if (standalone) {
    return renderContent();
  }

  return (
    <View>
      {trigger ? (
        trigger(() => setVisible(true))
      ) : (
        <TouchableOpacity
          onPress={() => setVisible(true)}
          className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg flex-row items-center justify-between border border-slate-200 dark:border-slate-700"
        >
          <Text className="text-slate-500 font-bold">{description}</Text>
          {signatureDone && <Check size={16} color="#16a34a" />}
        </TouchableOpacity>
      )}

      <Modal
        visible={visible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setVisible(false)}
      >
        <View className="flex-1 bg-black/50 justify-end">
          {renderContent()}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  flexView: {
    flex: 1,
  },
});
