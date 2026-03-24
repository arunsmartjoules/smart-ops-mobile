import React, { useRef, useState } from "react";
import { View, Modal, Text, TouchableOpacity, StyleSheet, useColorScheme, Alert } from "react-native";
import SignatureScreen from "react-native-signature-canvas";
import { X, Check } from "lucide-react-native";

interface SignaturePadProps {
  onOK: (signature: string) => void;
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
  const ref = useRef<any>(null);
  const [visible, setVisible] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const isDark = useColorScheme() === "dark";

  const handleOK = (signature: string) => {
    onOK(signature);
    setSignature(signature);
    if (!standalone) {
      setVisible(false);
    }
  };

  const handleClear = () => {
    if (ref.current) {
      ref.current.clearSignature();
    }
    if (onClear) onClear();
    setSignature(null);
  };

  const handleEmpty = () => {
    Alert.alert("Signature Required", "Please provide a signature before saving.");
  };

  const handleEnd = () => {
    ref.current.readSignature();
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

      {/* Canvas */}
      <View className={`flex-1 ${isDark ? "bg-slate-900" : "bg-white"}`}>
        <SignatureScreen
          ref={ref}
          onOK={handleOK}
          onEmpty={handleEmpty}
          onClear={handleClear}
          autoClear={false}
          descriptionText={description}
          backgroundColor={isDark ? "#1e293b" : "#ffffff"}
          penColor={isDark ? "#ffffff" : "black"}
          androidHardwareAccelerationDisabled={true}
          webStyle={`
              .m-signature-pad--footer {display: none; margin: 0px;}
              .m-signature-pad {box-shadow: none; border: none; margin-left: 0px; margin-top: 0px;}
              body,html {width: 100%; height: 100%;}
          `}
        />
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
          {signature && <Check size={16} color="#16a34a" />}
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
