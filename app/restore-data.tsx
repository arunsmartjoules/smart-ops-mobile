import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ArrowLeft, Upload, Search } from "lucide-react-native";
import { router } from "expo-router";
import { db, userSites } from "@/database";
import SiteLogService, {
  type RestoreLocalSiteLogsResult,
} from "@/services/SiteLogService";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import logger from "@/utils/logger";

const LOG_NAMES = ["", "Water", "Temp RH", "Chemical Dosing"] as const;

const todayIso = () => new Date().toISOString().slice(0, 10);
const daysAgoIso = (n: number) =>
  new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

export default function RestoreData() {
  const { isConnected } = useNetworkStatus();
  const [sites, setSites] = useState<{ site_code: string; site_name: string }[]>([]);
  const [siteCode, setSiteCode] = useState("");
  const [fromDate, setFromDate] = useState(daysAgoIso(7));
  const [toDate, setToDate] = useState(todayIso());
  const [logName, setLogName] = useState<(typeof LOG_NAMES)[number]>("");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RestoreLocalSiteLogsResult | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const rows = await db
          .select({ site_code: userSites.site_code, site_name: userSites.site_name })
          .from(userSites);
        const unique = Array.from(
          new Map(rows.map((r) => [r.site_code, r])).values(),
        );
        setSites(unique);
      } catch (err: any) {
        logger.error("RestoreData: load sites failed", { error: err?.message });
      }
    })();
  }, []);

  const validInput = useMemo(() => {
    return (
      siteCode.trim().length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(fromDate) &&
      /^\d{4}-\d{2}-\d{2}$/.test(toDate) &&
      fromDate <= toDate
    );
  }, [siteCode, fromDate, toDate]);

  const run = useCallback(
    async (dryRun: boolean) => {
      if (!validInput || running) return;
      if (isConnected === false) {
        Alert.alert("Offline", "You need to be online to restore data.");
        return;
      }
      setRunning(true);
      setResult(null);
      try {
        const r = await SiteLogService.restoreLocalSiteLogs({
          siteCode: siteCode.trim(),
          fromDate,
          toDate,
          logName: logName || undefined,
          dryRun,
        });
        setResult(r);
        if (!dryRun && r.failed === 0) {
          Alert.alert(
            "Restore complete",
            `Created: ${r.created}\nUpdated: ${r.updated}\nSkipped: ${r.skipped}`,
          );
        } else if (!dryRun && r.failed > 0) {
          Alert.alert(
            "Restore finished with errors",
            `Succeeded: ${r.created + r.updated}\nFailed: ${r.failed}\nSee error list below.`,
          );
        }
      } catch (err: any) {
        Alert.alert("Restore failed", err?.message || String(err));
      } finally {
        setRunning(false);
      }
    },
    [validInput, running, isConnected, siteCode, fromDate, toDate, logName],
  );

  const onRestorePress = useCallback(() => {
    if (!result) {
      Alert.alert(
        "Run a dry run first",
        "Please run a dry run to see what will change before performing the actual restore.",
      );
      return;
    }
    if (result.toCreate === 0 && result.toUpdate === 0) {
      Alert.alert("Nothing to restore", "No local rows differ from the server.");
      return;
    }
    Alert.alert(
      "Confirm restore",
      `This will POST ${result.toCreate} new rows and PUT ${result.toUpdate} updates to the backend. Proceed?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Restore", style: "destructive", onPress: () => run(false) },
      ],
    );
  }, [result, run]);

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-950">
      <SafeAreaView className="flex-1">
        <View className="px-5 pt-2 pb-3 flex-row items-center">
          <TouchableOpacity
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-white dark:bg-slate-900 items-center justify-center mr-3 border border-slate-200 dark:border-slate-800"
          >
            <ArrowLeft size={18} color="#64748b" />
          </TouchableOpacity>
          <View>
            <Text className="text-slate-400 dark:text-slate-500 text-[10px] font-black uppercase tracking-[0.2em]">
              Recovery
            </Text>
            <Text className="text-slate-900 dark:text-slate-50 text-xl font-black tracking-tight">
              Restore Local Data
            </Text>
          </View>
        </View>

        <ScrollView
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        >
          <View className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-2xl p-4 mb-4">
            <Text className="text-amber-900 dark:text-amber-200 text-xs leading-5">
              Pushes site_logs rows that exist on this device but are missing
              or empty on the backend. Match is by (date, task) within site/
              category. Use dry run first to preview.
            </Text>
          </View>

          <Text className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
            Site code
          </Text>
          <TextInput
            value={siteCode}
            onChangeText={setSiteCode}
            placeholder="e.g. JCL-KIMSNASHIK"
            autoCapitalize="characters"
            autoCorrect={false}
            placeholderTextColor="#94a3b8"
            className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 text-sm mb-2"
          />
          {sites.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              {sites.map((s) => (
                <TouchableOpacity
                  key={s.site_code}
                  onPress={() => setSiteCode(s.site_code)}
                  className={`px-3 py-1.5 rounded-full mr-2 border ${
                    siteCode === s.site_code
                      ? "bg-red-600 border-red-600"
                      : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                  }`}
                >
                  <Text
                    className={`text-xs font-bold ${
                      siteCode === s.site_code ? "text-white" : "text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {s.site_code}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          <View className="flex-row gap-3 mb-3">
            <View className="flex-1">
              <Text className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
                From (YYYY-MM-DD)
              </Text>
              <TextInput
                value={fromDate}
                onChangeText={setFromDate}
                placeholder="2026-04-01"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 text-sm"
              />
            </View>
            <View className="flex-1">
              <Text className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
                To (YYYY-MM-DD)
              </Text>
              <TextInput
                value={toDate}
                onChangeText={setToDate}
                placeholder="2026-04-28"
                placeholderTextColor="#94a3b8"
                autoCapitalize="none"
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-3 text-slate-900 dark:text-slate-50 text-sm"
              />
            </View>
          </View>

          <Text className="text-slate-500 text-[11px] font-bold uppercase tracking-wider mb-1">
            Category (optional)
          </Text>
          <View className="flex-row flex-wrap gap-2 mb-4">
            {LOG_NAMES.map((ln) => (
              <TouchableOpacity
                key={ln || "all"}
                onPress={() => setLogName(ln)}
                className={`px-3 py-1.5 rounded-full border ${
                  logName === ln
                    ? "bg-red-600 border-red-600"
                    : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
                }`}
              >
                <Text
                  className={`text-xs font-bold ${
                    logName === ln ? "text-white" : "text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {ln || "All"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View className="flex-row gap-3 mb-4">
            <TouchableOpacity
              onPress={() => run(true)}
              disabled={!validInput || running}
              className={`flex-1 rounded-xl px-4 py-3 flex-row items-center justify-center ${
                !validInput || running ? "bg-slate-300" : "bg-slate-800"
              }`}
            >
              {running ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Search size={16} color="#fff" />
              )}
              <Text className="text-white font-bold ml-2 text-sm">Dry run</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRestorePress}
              disabled={!validInput || running}
              className={`flex-1 rounded-xl px-4 py-3 flex-row items-center justify-center ${
                !validInput || running ? "bg-slate-300" : "bg-red-600"
              }`}
            >
              {running ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Upload size={16} color="#fff" />
              )}
              <Text className="text-white font-bold ml-2 text-sm">Restore</Text>
            </TouchableOpacity>
          </View>

          {isConnected === false && (
            <View className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 rounded-xl p-3 mb-4">
              <Text className="text-amber-900 dark:text-amber-200 text-xs">
                Offline — restore is disabled until you reconnect.
              </Text>
            </View>
          )}

          {result && (
            <View className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4">
              <Text className="text-slate-900 dark:text-slate-50 font-black text-base mb-3">
                {result.dryRun ? "Dry run results" : "Restore results"}
              </Text>
              <ResultRow label="Local rows scanned" value={result.scanned} />
              <ResultRow label="Server rows in range" value={result.serverFound} />
              <ResultRow label="Already in sync (skipped)" value={result.skipped} />
              <ResultRow label="To create" value={result.toCreate} highlight={result.toCreate > 0} />
              <ResultRow label="To update" value={result.toUpdate} highlight={result.toUpdate > 0} />
              {!result.dryRun && (
                <>
                  <ResultRow label="Created" value={result.created} highlight={result.created > 0} />
                  <ResultRow label="Updated" value={result.updated} highlight={result.updated > 0} />
                  <ResultRow label="Failed" value={result.failed} error={result.failed > 0} />
                </>
              )}
              {result.errors.length > 0 && (
                <View className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                  <Text className="text-red-600 font-bold text-xs mb-2">Errors</Text>
                  {result.errors.slice(0, 20).map((e, i) => (
                    <View key={`${e.localId}-${i}`} className="mb-2">
                      <Text className="text-slate-700 dark:text-slate-300 text-[11px] font-mono">
                        [{e.action}] {e.localId.slice(0, 8)}…
                      </Text>
                      <Text className="text-red-700 dark:text-red-400 text-[11px]">{e.error}</Text>
                    </View>
                  ))}
                  {result.errors.length > 20 && (
                    <Text className="text-slate-400 text-xs">
                      …and {result.errors.length - 20} more
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ResultRow({
  label,
  value,
  highlight,
  error,
}: {
  label: string;
  value: number;
  highlight?: boolean;
  error?: boolean;
}) {
  return (
    <View className="flex-row items-center justify-between py-1">
      <Text className="text-slate-600 dark:text-slate-400 text-sm">{label}</Text>
      <Text
        className={`font-black text-sm ${
          error
            ? "text-red-600"
            : highlight
              ? "text-slate-900 dark:text-slate-50"
              : "text-slate-500"
        }`}
      >
        {value}
      </Text>
    </View>
  );
}
