import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, Image } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { db, siteLogs, chillerReadings } from "@/database";
import { eq } from "drizzle-orm";
import { format } from "date-fns";
import { Svg, Path } from "react-native-svg";
import { Bx } from "@/components/jo/Bx";
import { Avatar, Card, EmptyState, JoPage, f, useJoTheme } from "@/components/jo/ui";
import { EntryHeader, EntryLoading, typeLook } from "@/components/sitelogs/LogsKit";

import { API_BASE_URL } from "../constants/api";

const API_URL = API_BASE_URL;

/**
 * Read-only report for one site log / chiller reading, in the artboard's
 * card language: type hero row, readings in raised cells, remarks,
 * signature and executor.
 */
export default function SiteLogDetail() {
  const t = useJoTheme();
  const { id, type } = useLocalSearchParams<{ id: string; type: string }>();
  const [log, setLog] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchLog = async () => {
      try {
        let record: any = null;
        if (type === "Chiller Logs") {
          const rows = await db
            .select()
            .from(chillerReadings)
            .where(eq(chillerReadings.id, id as string));
          record = rows[0] || null;
        } else {
          const rows = await db
            .select()
            .from(siteLogs)
            .where(eq(siteLogs.id, id as string));
          record = rows[0] || null;
        }
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
    const frame = {
      height: 180,
      width: "100%" as const,
      borderRadius: 22,
      backgroundColor: t.raised,
      alignItems: "center" as const,
      justifyContent: "center" as const,
      overflow: "hidden" as const,
    };

    if (
      sig.startsWith("/") ||
      sig.startsWith("http") ||
      sig.startsWith("file://")
    ) {
      return (
        <View style={frame}>
          <Image
            source={{ uri: sig.startsWith("/") ? `${API_URL}${sig}` : sig }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="contain"
          />
        </View>
      );
    }

    try {
      const paths = sig.split(";");
      return (
        <View style={[frame, { padding: 20 }]}>
          <Svg height="100%" width="100%" viewBox="0 0 300 150">
            {paths.map((p, i) => (
              <Path
                key={i}
                d={p}
                stroke={t.ink}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ))}
          </Svg>
        </View>
      );
    } catch {
      return (
        <View style={frame}>
          <Text style={[f.t(12), { color: t.muted, fontStyle: "italic" }]}>Signature display error</Text>
        </View>
      );
    }
  };

  if (loading) {
    return <EntryLoading label="Loading entry…" />;
  }

  if (!log) {
    return (
      <JoPage glow={false}>
        <EntryHeader title="Log report" onBack={() => router.back()} />
        <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
          <EmptyState
            icon="bx-error-circle"
            title="Entry not found"
            sub="It may have been removed or not synced to this device yet."
            action={{ label: "Go back", onPress: () => router.back() }}
          />
        </View>
      </JoPage>
    );
  }

  const look = typeLook(t, String(type ?? ""));

  const DataCell = ({ label, value }: { label: string; value: string | number }) => (
    <View
      style={{
        width: "48.5%",
        borderRadius: 16,
        backgroundColor: t.raised,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text style={[f.t(11.5, 500), { color: t.muted }]} numberOfLines={1}>
        {label}
      </Text>
      <Text style={[f.d(20, -0.02, 1.2), { color: t.ink, marginTop: 3 }]} numberOfLines={1}>
        {value ?? "--"}
      </Text>
    </View>
  );

  return (
    <JoPage glow={false}>
      <EntryHeader title="Log report" sub={String(type ?? "")} onBack={() => router.back()} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Summary */}
        <Card style={{ padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 46,
                height: 46,
                borderRadius: 23,
                backgroundColor: look.bg,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Bx name={look.icon} size={22} color={look.fg} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[f.t(11.5), { color: t.muted }]}>Entry type</Text>
              <Text style={[f.d(22, -0.02), { color: t.ink }]} numberOfLines={1}>
                {type}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: "row", gap: 6, marginTop: 14 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 38, borderRadius: 19, backgroundColor: t.raised, paddingHorizontal: 12 }}>
              <Bx name="bx-calendar" size={15} color={t.accentInk} />
              <Text style={[f.t(12.5, 600), { color: t.ink2 }]}>
                {log.created_at ? format(new Date(log.created_at), "dd MMM yyyy") : "--"}
              </Text>
            </View>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 6, height: 38, borderRadius: 19, backgroundColor: t.raised, paddingHorizontal: 12 }}>
              <Bx name="bx-time-five" size={15} color={t.accentInk} />
              <Text style={[f.t(12.5, 600), { color: t.ink2 }]}>
                {log.created_at ? format(new Date(log.created_at), "hh:mm a") : "--"}
              </Text>
            </View>
          </View>
        </Card>

        {/* Technical data */}
        <Card style={{ padding: 16 }}>
          <Text style={[f.t(15, 600), { color: t.ink }]}>Technical data</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8, marginTop: 12 }}>
            {type === "Temp RH" && (
              <>
                <DataCell label="Temperature" value={`${log.temperature}°C`} />
                <DataCell label="Humidity" value={`${log.rh}%`} />
              </>
            )}

            {type === "Water" && (
              <>
                <DataCell label="TDS reading" value={`${log.tds} ppm`} />
                <DataCell label="pH level" value={log.ph} />
                <DataCell label="Hardness" value={log.hardness} />
              </>
            )}

            {type === "Chemical Dosing" && (
              <DataCell label="Dosing details" value={log.chemical_dosing || "N/A"} />
            )}

            {type === "Chiller Logs" && (
              <>
                <DataCell label="Chiller ID" value={log.chiller_id || "N/A"} />
                <DataCell label="Cond. In" value={`${log.condenser_inlet_temp}°C`} />
                <DataCell label="Cond. Out" value={`${log.condenser_outlet_temp}°C`} />
                <DataCell label="Evap. In" value={`${log.evaporator_inlet_temp}°C`} />
                <DataCell label="Evap. Out" value={`${log.evaporator_outlet_temp}°C`} />
                <DataCell label="Oil Pressure" value={`${log.oil_pressure} PSI`} />
                <DataCell label="Load" value={`${log.compressor_load_percentage}%`} />
              </>
            )}
          </View>

          <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.line }}>
            <Text style={[f.t(12.5, 500), { color: t.ink3 }]}>Remarks</Text>
            <Text style={[f.t(14), { color: t.ink2, fontStyle: "italic", marginTop: 6, lineHeight: 20 }]}>
              &quot;{log.remarks || "No additional remarks provided"}&quot;
            </Text>
          </View>
        </Card>

        {/* Signature */}
        <Card style={{ padding: 16 }}>
          <Text style={[f.t(15, 600), { color: t.ink }]}>Technician signature</Text>
          <View style={{ marginTop: 12 }}>
            {log.signature || log.signature_text ? (
              renderSignature(log.signature || log.signature_text)
            ) : (
              <View style={{ height: 80, borderRadius: 22, backgroundColor: t.raised, alignItems: "center", justifyContent: "center" }}>
                <Text style={[f.t(12.5), { color: t.muted, fontStyle: "italic" }]}>No signature captured</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 14 }}>
            <Avatar name={log.executor_id || "Admin"} size={40} />
            <View>
              <Text style={[f.t(11.5), { color: t.muted }]}>Executor</Text>
              <Text style={[f.t(14, 600), { color: t.ink }]}>
                Technician #{(log.executor_id || "").slice(-4).toUpperCase() || "ADMIN"}
              </Text>
            </View>
          </View>
        </Card>
      </ScrollView>
    </JoPage>
  );
}
