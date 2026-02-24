import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  ChevronLeft,
  Info,
  Calendar,
  Clock,
  User,
  Thermometer,
  Droplets,
  FlaskRound,
  Snowflake,
  Activity,
  ChevronRight,
} from "lucide-react-native";
import { database } from "@/database";
import { format } from "date-fns";
import { Svg, Path } from "react-native-svg";

import { API_BASE_URL } from "../constants/api";

const API_URL = API_BASE_URL;

export default function SiteLogDetail() {
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLog = async () => {
      try {
        const collection =
          type === "Chiller Logs"
            ? database.get("chiller_readings")
            : database.get("site_logs");

        const record = await collection.find(id as string);
        setLog(record);
      } catch (error) {
        console.error("Error fetching log detail:", error);
      } finally {
        setLoading(false);
      }
    };
    if (id) fetchLog();
  }, [id, type]);

  const renderSignature = (sig: string) => {
    if (!sig) return null;

    if (
      sig.startsWith("/") ||
      sig.startsWith("http") ||
      sig.startsWith("file://")
    ) {
      return (
        <View className="bg-white rounded-2xl h-48 w-full border border-slate-100 items-center justify-center overflow-hidden shadow-sm">
          <Image
            source={{ uri: sig.startsWith("/") ? `${API_URL}${sig}` : sig }}
            className="w-full h-full"
            resizeMode="contain"
          />
        </View>
      );
    }

    try {
      const paths = sig.split(";");
      return (
        <View className="bg-white rounded-2xl h-48 w-full border border-slate-100 items-center justify-center p-6 shadow-sm">
          <Svg height="100%" width="100%" viewBox="0 0 300 150">
            {paths.map((p, i) => (
              <Path
                key={i}
                d={p}
                stroke="#0f172a"
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
      );
    } catch (e) {
      return (
        <View className="bg-white rounded-2xl h-48 w-full border border-slate-100 items-center justify-center">
          <Text className="text-slate-400 text-xs italic">
            Signature display error
          </Text>
        </View>
      );
    }
  };

  if (loading) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center">
        <ActivityIndicator color="#dc2626" />
      </View>
    );
  }

  if (!log) {
    return (
      <View className="flex-1 bg-slate-50 items-center justify-center p-10">
        <Text className="text-slate-900 font-bold text-center">
          Entry not found
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-6 bg-red-600 px-8 py-3 rounded-xl"
        >
          <Text className="text-white font-bold uppercase text-xs">
            Go Back
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  const getIcon = () => {
    switch (type) {
      case "Temp RH":
        return <Thermometer size={20} color="#ef4444" />;
      case "Water":
        return <Droplets size={20} color="#3b82f6" />;
      case "Chemical Dosing":
        return <FlaskRound size={20} color="#8b5cf6" />;
      case "Chiller Logs":
        return <Snowflake size={20} color="#0d9488" />;
      default:
        return <Activity size={20} color="#64748b" />;
    }
  };

  const getThemeColor = () => {
    switch (type) {
      case "Temp RH":
        return "#ef4444";
      case "Water":
        return "#3b82f6";
      case "Chemical Dosing":
        return "#8b5cf6";
      case "Chiller Logs":
        return "#0d9488";
      default:
        return "#64748b";
    }
  };

  const DataRow = ({
    label,
    value,
  }: {
    label: string;
    value: string | number;
  }) => (
    <View className="mb-4">
      <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-1">
        {label}
      </Text>
      <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
        {value ?? "--"}
      </Text>
    </View>
  );

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1" edges={["top"]}>
        {/* Header */}
        <View className="px-5 py-4 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 flex-row items-center justify-between">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center"
          >
            <ChevronLeft size={20} color="#0f172a" />
          </TouchableOpacity>
          <Text className="text-slate-900 dark:text-slate-50 font-bold text-lg">
            Log Report
          </Text>
          <View className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center">
            <Info size={18} color="#94a3b8" />
          </View>
        </View>

        <ScrollView className="flex-1 p-5" showsVerticalScrollIndicator={false}>
          {/* Summary Card */}
          <View
            className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-50 dark:border-slate-800 mb-6"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <View className="flex-row items-center mb-6">
              <View
                className="w-12 h-12 rounded-xl items-center justify-center mr-4"
                style={{ backgroundColor: `${getThemeColor()}15` }}
              >
                {getIcon()}
              </View>
              <View className="flex-1">
                <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">
                  Entry Type
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 text-xl font-bold">
                  {type}
                </Text>
              </View>
            </View>

            <View className="flex-row items-center justify-between bg-slate-50 dark:bg-slate-800 rounded-xl p-4 border border-slate-100 dark:border-slate-700">
              <View className="flex-row items-center">
                <Calendar size={14} color="#94a3b8" />
                <Text className="text-slate-500 dark:text-slate-400 font-bold text-xs ml-2">
                  {log.createdAt
                    ? format(new Date(log.createdAt), "dd MMM yyyy")
                    : "--"}
                </Text>
              </View>
              <View className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-2" />
              <View className="flex-row items-center">
                <Clock size={14} color="#94a3b8" />
                <Text className="text-slate-500 dark:text-slate-400 font-bold text-xs ml-2">
                  {log.createdAt
                    ? format(new Date(log.createdAt), "hh:mm a")
                    : "--"}
                </Text>
              </View>
            </View>
          </View>

          {/* Details Section */}
          <View
            className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-50 dark:border-slate-800 mb-6"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.05,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-6">
              Technical Data
            </Text>

            <View className="gap-2">
              {type === "Temp RH" && (
                <View className="flex-row gap-8">
                  <View className="flex-1">
                    <DataRow
                      label="Temperature"
                      value={`${log.temperature}°C`}
                    />
                  </View>
                  <View className="flex-1">
                    <DataRow label="Humidity" value={`${log.rh}%`} />
                  </View>
                </View>
              )}

              {type === "Water" && (
                <>
                  <DataRow label="TDS Reading" value={`${log.tds} ppm`} />
                  <View className="flex-row gap-8">
                    <View className="flex-1">
                      <DataRow label="pH Level" value={log.ph} />
                    </View>
                    <View className="flex-1">
                      <DataRow label="Hardness" value={log.hardness} />
                    </View>
                  </View>
                </>
              )}

              {type === "Chemical Dosing" && (
                <DataRow
                  label="Dosing Details"
                  value={log.chemicalDosing || "N/A"}
                />
              )}

              {type === "Chiller Logs" && (
                <>
                  <DataRow label="Chiller ID" value={log.chillerId || "N/A"} />
                  <View className="flex-row flex-wrap">
                    <View className="w-1/2">
                      <DataRow
                        label="Cond. In"
                        value={`${log.condenserInletTemp}°C`}
                      />
                    </View>
                    <View className="w-1/2">
                      <DataRow
                        label="Cond. Out"
                        value={`${log.condenserOutletTemp}°C`}
                      />
                    </View>
                    <View className="w-1/2">
                      <DataRow
                        label="Evap. In"
                        value={`${log.evaporatorInletTemp}°C`}
                      />
                    </View>
                    <View className="w-1/2">
                      <DataRow
                        label="Evap. Out"
                        value={`${log.evaporatorOutletTemp}°C`}
                      />
                    </View>
                    <View className="w-1/2">
                      <DataRow
                        label="Oil Pressure"
                        value={`${log.oilPressure} PSI`}
                      />
                    </View>
                    <View className="w-1/2">
                      <DataRow
                        label="Load"
                        value={`${log.compressorLoadPercentage}%`}
                      />
                    </View>
                  </View>
                </>
              )}

              <View className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <Text className="text-slate-400 text-[10px] font-bold uppercase tracking-widest mb-2">
                  Remarks
                </Text>
                <Text className="text-slate-700 dark:text-slate-300 text-sm font-medium italic">
                  "{log.remarks || "No additional remarks provided"}"
                </Text>
              </View>
            </View>
          </View>

          {/* Signature Section */}
          <View className="mb-10">
            <Text className="text-slate-900 dark:text-slate-50 font-bold text-base mb-4 ml-1">
              Technician Signature
            </Text>
            {log.signature || log.signatureText ? (
              renderSignature(log.signature || log.signatureText)
            ) : (
              <View className="bg-white dark:bg-slate-900 rounded-2xl p-8 border border-slate-100 dark:border-slate-800 items-center justify-center shadow-sm">
                <Text className="text-slate-400 text-xs italic">
                  No signature captured
                </Text>
              </View>
            )}

            <View className="flex-row items-center mt-6 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-50 dark:border-slate-800">
              <View className="w-10 h-10 rounded-full bg-slate-50 dark:bg-slate-800 items-center justify-center mr-3 shadow-sm">
                <User size={18} color="#64748b" />
              </View>
              <View>
                <Text className="text-slate-400 text-[8px] font-bold uppercase tracking-widest mb-0.5">
                  Executor
                </Text>
                <Text className="text-slate-900 dark:text-slate-50 font-bold text-sm">
                  Technician #
                  {(log.executorId || "").slice(-4).toUpperCase() || "ADMIN"}
                </Text>
              </View>
            </View>
          </View>
          <View className="h-20" />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
