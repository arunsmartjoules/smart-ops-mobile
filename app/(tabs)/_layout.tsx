// @ts-nocheck
import React from "react";
import { View, Text, Pressable } from "react-native";
import { Tabs, router } from "expo-router";
import { ShieldOff, LogIn, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { JouleTabBar } from "@/components/JouleTabBar";
import { SiteAccessGate } from "@/components/SiteAccessGate";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import { useDs } from "@/hooks/useDs";

function TabsContent({ hideTabBar = false }: { hideTabBar?: boolean }) {
  const ds = useDs();
  return (
    <Tabs
      initialRouteName="dashboard"
      // The bar is fully custom (see JouleTabBar) so the design's pill/label
      // treatment isn't fighting the navigator's own item layout.
      tabBar={(props) => (hideTabBar ? null : <JouleTabBar {...props} />)}
      screenOptions={{
        headerShown: false,
        animation: "none",
        sceneContainerStyle: { backgroundColor: ds.pageBg },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="dashboard" options={{ title: "Home" }} />
      <Tabs.Screen name="tickets" options={{ title: "Tickets" }} />
      <Tabs.Screen name="incidents" options={{ title: "Incidents" }} />
      <Tabs.Screen name="site-logs" options={{ title: "Logs" }} />
      <Tabs.Screen
        name="preventive-maintenance"
        options={{ title: "PM" }}
      />
      {/* Profile is reached from the Site Overview header avatar, not the bar. */}
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

function ReadOnlyBanner() {
  const { disableReadOnly } = useAttendanceGate();
  const insets = useSafeAreaInsets();
  return (
    <View
      className="flex-row items-center bg-amber-100 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800 px-4"
      style={{ paddingTop: insets.top + 6, paddingBottom: 8 }}
    >
      <Pressable
        onPress={() => {
          disableReadOnly();
          router.replace("/(tabs)/dashboard");
        }}
        hitSlop={8}
        className="w-7 h-7 rounded-full bg-amber-200 dark:bg-amber-800 items-center justify-center mr-2"
      >
        <X size={14} color="#92400e" />
      </Pressable>
      <ShieldOff size={14} color="#b45309" />
      <Text className="ml-2 text-xs font-medium text-amber-900 dark:text-amber-100 flex-1">
        Read-only mode — start your day for full access
      </Text>
      <Pressable
        onPress={() => router.push("/attendance")}
        hitSlop={8}
        className="flex-row items-center px-2.5 py-1 bg-amber-600 rounded-full active:opacity-90"
      >
        <LogIn size={11} color="white" />
        <Text className="ml-1 text-[11px] font-semibold text-white">
          Start Day
        </Text>
      </Pressable>
    </View>
  );
}

function AttendanceGatedTabs() {
  const { isPrivileged, isPunchedIn, isReadOnlyMode } = useAttendanceGate();

  if (isPrivileged || isPunchedIn) return <TabsContent />;
  if (isReadOnlyMode) {
    return (
      <View style={{ flex: 1 }}>
        <ReadOnlyBanner />
        <View style={{ flex: 1 }}>
          <TabsContent hideTabBar />
        </View>
      </View>
    );
  }
  // Locked: reuse the dashboard as the restricted screen — it already has
  // the Start Day widget. Tab bar is hidden so users can't escape to other
  // tabs without punching in. Dashboard hides its outbound nav buttons when
  // canEdit is false.
  return <TabsContent hideTabBar />;
}

export default function TabLayout() {
  return (
    <SiteAccessGate>
      <AttendanceGatedTabs />
    </SiteAccessGate>
  );
}
