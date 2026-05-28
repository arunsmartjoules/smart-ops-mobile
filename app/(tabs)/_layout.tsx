// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Platform, View, Text, Pressable } from "react-native";
import { Tabs, router } from "expo-router";
import { ShieldOff, LogIn, X } from "lucide-react-native";
import {
  LayoutDashboard,
  Activity,
  ListChecks,
  Ticket,
  AlertTriangle,
  User,
} from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "@/contexts/ThemeContext";
import { AnimatedTabBarButton } from "@/components/AnimatedTabBarButton";
import { SiteAccessGate } from "@/components/SiteAccessGate";
import { useAttendanceGate } from "@/contexts/AttendanceGateContext";
import UpdateService from "@/services/UpdateService";

function TabsContent({ hideTabBar = false }: { hideTabBar?: boolean }) {
  const { isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const [hasUpdate, setHasUpdate] = useState(false);

  // System nav bar (gesture pill or 3-button bar) reports a bottom inset.
  // Add it on top of the bar's content height so icons/labels are never
  // hidden behind it. Keep a small floor so devices reporting 0 inset
  // (most older Android 3-button setups) still get breathing room.
  const bottomInset = Math.max(insets.bottom, Platform.OS === "ios" ? 28 : 12);
  const TAB_CONTENT_HEIGHT = Platform.OS === "ios" ? 60 : 64;

  useEffect(() => {
    const unsubscribe = UpdateService.subscribe(() => {
      setHasUpdate(UpdateService.isUpdateAvailable);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  return (
    <Tabs
      initialRouteName="dashboard"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#dc2626",
        tabBarInactiveTintColor: isDark ? "#64748b" : "#94a3b8",
        // Disable tab transition animation
        animation: "none",
        sceneContainerStyle: {
          backgroundColor: isDark ? "#0f172a" : "#f8fafc",
        },
        tabBarShowLabel: true,
        tabBarLabel: ({ color, children }) => (
          <Text
            allowFontScaling={false}
            numberOfLines={1}
            style={{
              color,
              fontSize: 9,
              fontWeight: "700",
              marginTop: -4,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: 0.2,
            }}
          >
            {String(children)}
          </Text>
        ),
        tabBarStyle: hideTabBar
          ? { display: "none" }
          : {
              backgroundColor: isDark ? "#0f172a" : "#ffffff",
              borderTopWidth: 0,
              height: TAB_CONTENT_HEIGHT + bottomInset,
              paddingTop: 8,
              paddingBottom: bottomInset,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.08,
              shadowRadius: 16,
              elevation: 25,
            },
        tabBarItemStyle: {
          paddingHorizontal: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: "Home",
          tabBarButton: (props) => (
            <AnimatedTabBarButton
              {...props}
              activeColor="#dc2626"
              inactiveColor={isDark ? "#64748b" : "#94a3b8"}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <LayoutDashboard
              size={22}
              color={focused ? "#dc2626" : color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarButton: (props) => (
            <AnimatedTabBarButton
              {...props}
              activeColor="#ef4444"
              inactiveColor={isDark ? "#64748b" : "#94a3b8"}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <Ticket
              size={22}
              color={focused ? "#ef4444" : color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="incidents"
        options={{
          title: "Incident",
          tabBarButton: (props) => (
            <AnimatedTabBarButton
              {...props}
              activeColor="#dc2626"
              inactiveColor={isDark ? "#64748b" : "#94a3b8"}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <AlertTriangle
              size={22}
              color={focused ? "#dc2626" : color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="site-logs"
        options={{
          title: "Logs",
          tabBarButton: (props) => (
            <AnimatedTabBarButton
              {...props}
              activeColor="#f59e0b"
              inactiveColor={isDark ? "#64748b" : "#94a3b8"}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <Activity
              size={22}
              color={focused ? "#f59e0b" : color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="preventive-maintenance"
        options={{
          title: "PM",
          tabBarButton: (props) => (
            <AnimatedTabBarButton
              {...props}
              activeColor="#3b82f6"
              inactiveColor={isDark ? "#64748b" : "#94a3b8"}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <ListChecks
              size={22}
              color={focused ? "#3b82f6" : color}
              strokeWidth={focused ? 2.5 : 2}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarButton: (props) => (
            <AnimatedTabBarButton
              {...props}
              activeColor="#ef4444"
              inactiveColor={isDark ? "#64748b" : "#94a3b8"}
            />
          ),
          tabBarIcon: ({ color, focused }) => (
            <View>
              <User
                size={22}
                color={focused ? "#ef4444" : color}
                strokeWidth={focused ? 2.5 : 2}
              />
              {hasUpdate && (
                <View
                  className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"
                  style={{ position: "absolute" }}
                />
              )}
            </View>
          ),
        }}
      />
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
