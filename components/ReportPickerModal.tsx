import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  Ticket,
  AlertTriangle,
  ListChecks,
  Activity,
  X,
  Eye,
  ArrowLeft,
  ShieldOff,
} from "lucide-react-native";
import {
  useAttendanceGate,
  ReadOnlyDomain,
} from "@/contexts/AttendanceGateContext";

interface ReportPickerModalProps {
  visible: boolean;
  onClose: () => void;
}

type DomainOption = {
  domain: ReadOnlyDomain;
  label: string;
  description: string;
  route: "/(tabs)/tickets" | "/(tabs)/incidents" | "/(tabs)/preventive-maintenance" | "/(tabs)/site-logs";
  Icon: React.ComponentType<{ size: number; color: string; strokeWidth?: number }>;
  accent: string;
};

const OPTIONS: DomainOption[] = [
  {
    domain: "tickets",
    label: "Tickets",
    description: "Browse open and closed tickets",
    route: "/(tabs)/tickets",
    Icon: Ticket,
    accent: "#ef4444",
  },
  {
    domain: "incidents",
    label: "Incidents",
    description: "Review incidents and RCAs",
    route: "/(tabs)/incidents",
    Icon: AlertTriangle,
    accent: "#dc2626",
  },
  {
    domain: "pm",
    label: "Preventive Maintenance",
    description: "View PM checklists and history",
    route: "/(tabs)/preventive-maintenance",
    Icon: ListChecks,
    accent: "#3b82f6",
  },
  {
    domain: "site-logs",
    label: "Site Logs",
    description: "Chillers, chemicals, temp/RH, water",
    route: "/(tabs)/site-logs",
    Icon: Activity,
    accent: "#f59e0b",
  },
];

type Step = "pick" | "confirm";

export function ReportPickerModal({ visible, onClose }: ReportPickerModalProps) {
  const { enableReadOnly } = useAttendanceGate();
  const [step, setStep] = useState<Step>("pick");
  const [selected, setSelected] = useState<DomainOption | null>(null);

  const reset = () => {
    setStep("pick");
    setSelected(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handlePick = (option: DomainOption) => {
    setSelected(option);
    setStep("confirm");
  };

  const handleBack = () => {
    setStep("pick");
    setSelected(null);
  };

  const handleConfirm = () => {
    if (!selected) return;
    enableReadOnly(selected.domain);
    const route = selected.route;
    reset();
    onClose();
    router.push(route);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={handleClose}
    >
      <View className="flex-1 bg-black/50 justify-end">
        <View className="bg-white dark:bg-slate-900 rounded-t-3xl pt-2 pb-8 max-h-[85%]">
          <View className="items-center pt-2 pb-3">
            <View className="w-12 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          </View>

          {step === "pick" ? (
            <PickStep onClose={handleClose} onPick={handlePick} />
          ) : selected ? (
            <ConfirmStep
              option={selected}
              onBack={handleBack}
              onConfirm={handleConfirm}
            />
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function PickStep({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (option: DomainOption) => void;
}) {
  return (
    <>
      <View className="flex-row items-center justify-between px-5 pb-3">
        <View className="flex-1">
          <Text className="text-lg font-bold text-slate-900 dark:text-white">
            View Reports
          </Text>
          <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Pick what you want to see in read-only mode
          </Text>
        </View>
        <Pressable
          onPress={onClose}
          hitSlop={10}
          className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center"
        >
          <X size={18} color="#64748b" />
        </Pressable>
      </View>

      <ScrollView className="px-5 pt-2">
        {OPTIONS.map((opt) => (
          <Pressable
            key={opt.domain}
            onPress={() => onPick(opt)}
            className="flex-row items-center bg-slate-50 dark:bg-slate-800 rounded-2xl px-4 py-4 mb-3 active:opacity-80"
          >
            <View
              className="w-11 h-11 rounded-xl items-center justify-center mr-3"
              style={{ backgroundColor: `${opt.accent}1A` }}
            >
              <opt.Icon size={22} color={opt.accent} strokeWidth={2.2} />
            </View>
            <View className="flex-1">
              <Text className="text-base font-semibold text-slate-900 dark:text-white">
                {opt.label}
              </Text>
              <Text className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {opt.description}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </>
  );
}

function ConfirmStep({
  option,
  onBack,
  onConfirm,
}: {
  option: DomainOption;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <View className="flex-row items-center px-5 pb-3">
        <Pressable
          onPress={onBack}
          hitSlop={10}
          className="w-9 h-9 rounded-full bg-slate-100 dark:bg-slate-800 items-center justify-center mr-3"
        >
          <ArrowLeft size={18} color="#64748b" />
        </Pressable>
        <Text className="text-lg font-bold text-slate-900 dark:text-white flex-1">
          Confirm
        </Text>
      </View>

      <View className="px-5 pt-2">
        <View className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5">
          <View className="flex-row items-center mb-3">
            <ShieldOff size={20} color="#b45309" />
            <Text className="ml-2 text-base font-semibold text-amber-900 dark:text-amber-100">
              Read-only mode
            </Text>
          </View>
          <Text className="text-sm text-amber-900 dark:text-amber-100 leading-5">
            You&apos;ll see {option.label} without starting your day. You cannot
            create, edit, or submit anything. Start your day for full access.
          </Text>
        </View>

        <Pressable
          onPress={onConfirm}
          className="mt-6 bg-slate-900 dark:bg-white rounded-xl py-4 flex-row items-center justify-center"
        >
          <Eye size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text className="text-white dark:text-slate-900 font-semibold text-base">
            Continue to {option.label}
          </Text>
        </Pressable>

        <Pressable
          onPress={onBack}
          className="mt-3 rounded-xl py-4 items-center"
        >
          <Text className="text-slate-600 dark:text-slate-300 font-medium">
            Cancel
          </Text>
        </Pressable>
      </View>
    </>
  );
}

export default ReportPickerModal;
