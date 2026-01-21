import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import {
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  Thermometer,
  Droplets,
  FlaskRound,
  Snowflake,
  ChevronRight,
} from "lucide-react-native";
import { format } from "date-fns";

interface LogCardProps {
  log: any;
  type: string;
  onPress: () => void;
}

export const LogCard: React.FC<LogCardProps> = ({ log, type, onPress }) => {
  const isSynced = log.isSynced;
  const date = log.createdAt ? new Date(log.createdAt) : new Date();

  const getIcon = () => {
    switch (type) {
      case "Temp RH":
        return <Thermometer size={18} color="#ef4444" />;
      case "Water Parameters":
        return <Droplets size={18} color="#3b82f6" />;
      case "Chemical Dosing":
        return <FlaskRound size={18} color="#8b5cf6" />;
      case "Chiller Logs":
        return <Snowflake size={18} color="#06b6d4" />;
      default:
        return <Calendar size={18} color="#64748b" />;
    }
  };

  const getBgColor = () => {
    switch (type) {
      case "Temp RH":
        return "bg-red-50";
      case "Water Parameters":
        return "bg-blue-50";
      case "Chemical Dosing":
        return "bg-violet-50";
      case "Chiller Logs":
        return "bg-cyan-50";
      default:
        return "bg-slate-50";
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      className="bg-white dark:bg-slate-900 rounded-2xl p-4 mb-3"
      style={{
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      <View className="flex-row justify-between items-start">
        <View className="flex-row flex-1">
          <View
            className={`w-10 h-10 rounded-xl items-center justify-center mr-3 ${getBgColor()}`}
          >
            {getIcon()}
          </View>
          <View className="flex-1 mr-2">
            <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-1">
              {type === "Chiller Logs"
                ? `Chiller #${log.chillerId || "?"}`
                : log.logName || type}
            </Text>
            <View className="flex-row items-center">
              <Clock size={12} color="#94a3b8" />
              <Text className="text-slate-400 text-xs ml-1 font-medium">
                {format(date, "h:mm a")} • {format(date, "MMM dd")}
              </Text>
            </View>
          </View>
        </View>

        <View className="items-end">
          <View
            className={`flex-row items-center px-2 py-1 rounded-full ${
              isSynced ? "bg-green-50" : "bg-amber-50"
            }`}
          >
            {isSynced ? (
              <CheckCircle2 size={10} color="#16a34a" />
            ) : (
              <AlertCircle size={10} color="#d97706" />
            )}
            <Text
              className={`text-[10px] font-bold ml-1 uppercase ${
                isSynced ? "text-green-700" : "text-amber-700"
              }`}
            >
              {isSynced ? "Synced" : "Pending"}
            </Text>
          </View>
        </View>
      </View>
      
      {/* Optional: Add summary values here if available in log object */}
      {type === "Temp RH" && (log.temperature || log.rh) && (
        <View className="mt-3 pt-3 border-t border-slate-50 dark:border-slate-800 flex-row gap-4">
           <View>
             <Text className="text-[10px] text-slate-400 font-bold uppercase">Temp</Text>
             <Text className="text-slate-700 font-semibold">{log.temperature || "--"}°C</Text>
           </View>
           <View>
             <Text className="text-[10px] text-slate-400 font-bold uppercase">RH</Text>
             <Text className="text-slate-700 font-semibold">{log.rh || "--"}%</Text>
           </View>
        </View>
      )}
    </TouchableOpacity>
  );
};
