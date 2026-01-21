import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import {
  ChevronLeft,
  Info,
  Calendar,
  Clock,
  User,
  HardDrive,
} from "lucide-react-native";
import { database } from "@/database";
import { format } from "date-fns";
import { Svg, Path } from "react-native-svg";

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

  if (loading) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-slate-400">Loading details...</Text>
      </View>
    );
  }

  if (!log) {
    return (
      <View className="flex-1 bg-white items-center justify-center">
        <Text className="text-slate-400">Log not found.</Text>
        <TouchableOpacity onPress={() => router.back()} className="mt-4">
          <Text className="text-blue-600">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const renderSignature = (sig: string) => {
    const paths = sig.split(";");
    return (
      <View className="bg-slate-50 rounded-2xl h-32 w-full border border-slate-100 items-center justify-center">
        <Svg height="100%" width="100%">
          {paths.map((p, i) => (
            <Path key={i} d={p} stroke="black" strokeWidth={2} fill="none" />
          ))}
        </Svg>
      </View>
    );
  };

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView className="flex-1" edges={["top"]}>
        <View className="px-5 py-4 flex-row items-center border-b border-slate-50">
          <TouchableOpacity onPress={() => router.back()} className="mr-3">
            <ChevronLeft size={24} color="#0f172a" />
          </TouchableOpacity>
          <Text className="text-xl font-bold text-slate-900">Log Details</Text>
        </View>

        <ScrollView className="flex-1 px-5 pt-6">
          <View className="flex-row items-center mb-6">
            <View className="w-12 h-12 bg-blue-50 rounded-2xl items-center justify-center mr-4">
              <Info size={24} color="#2563eb" />
            </View>
            <View>
              <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                Type
              </Text>
              <Text className="text-slate-900 text-lg font-bold">
                {type === "Chiller Logs" ? "Chiller Reading" : log.logName}
              </Text>
            </View>
          </View>

          <View className="bg-slate-50 p-6 rounded-[32px] border border-slate-100 mb-6">
            <View className="flex-row items-center justify-between mb-4 pb-4 border-b border-slate-200/50">
              <View className="flex-row items-center">
                <Calendar size={18} color="#64748b" />
                <Text className="text-slate-600 ml-2 font-medium">
                  {format(log.createdAt, "dd MMM yyyy")}
                </Text>
              </View>
              <View className="flex-row items-center">
                <Clock size={18} color="#64748b" />
                <Text className="text-slate-600 ml-2 font-medium">
                  {format(log.createdAt, "hh:mm a")}
                </Text>
              </View>
            </View>

            <View className="gap-6">
              {type === "Temp RH" && (
                <View className="flex-row gap-4">
                  <View className="flex-1">
                    <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                      Temperature
                    </Text>
                    <Text className="text-slate-900 text-xl font-bold">
                      {log.temperature}°C
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                      Humidity
                    </Text>
                    <Text className="text-slate-900 text-xl font-bold">
                      {log.rh}%
                    </Text>
                  </View>
                </View>
              )}

              {type === "Water Parameters" && (
                <>
                  <View>
                    <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                      TDS
                    </Text>
                    <Text className="text-slate-900 text-xl font-bold">
                      {log.tds} ppm
                    </Text>
                  </View>
                  <View className="flex-row gap-4">
                    <View className="flex-1">
                      <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                        pH
                      </Text>
                      <Text className="text-slate-900 text-xl font-bold">
                        {log.ph}
                      </Text>
                    </View>
                    <View className="flex-1">
                      <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                        Hardness
                      </Text>
                      <Text className="text-slate-900 text-xl font-bold">
                        {log.hardness}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {type === "Chemical Dosing" && (
                <View>
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Dosing Info
                  </Text>
                  <Text className="text-slate-900 text-base">
                    {log.chemicalDosing || "N/A"}
                  </Text>
                </View>
              )}

              {type === "Chiller Logs" && (
                <View>
                  <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                    Chiller ID
                  </Text>
                  <Text className="text-slate-900 text-xl font-bold">
                    {log.chillerId || "N/A"}
                  </Text>
                </View>
              )}

              <View className="pt-4 border-t border-slate-200/50">
                <Text className="text-slate-500 text-xs font-bold uppercase mb-1">
                  Remarks
                </Text>
                <Text className="text-slate-900 text-base">
                  {log.remarks || "No remarks"}
                </Text>
              </View>
            </View>
          </View>

          <View className="mb-10">
            <Text className="text-slate-500 text-xs font-bold uppercase tracking-wider mb-3 ml-1">
              Technician Signature
            </Text>
            {log.signature ? (
              renderSignature(log.signature)
            ) : (
              <Text className="text-slate-400 italic">
                No signature captured
              </Text>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
