// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Platform, View, Text } from "react-native";
import { Tabs } from "expo-router";
import {
  LayoutDashboard,
  Activity,
  ListChecks,
  Ticket,
  AlertTriangle,
  User,
} from "lucide-react-native";
import { useTheme } from "@/contexts/ThemeContext";
import { AnimatedTabBarButton } from "@/components/AnimatedTabBarButton";
import { SiteAccessGate } from "@/components/SiteAccessGate";
import UpdateService from "@/services/UpdateService";

function TabsContent() {
  const { isDark } = useTheme();
  const [hasUpdate, setHasUpdate] = useState(false);

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
        tabBarStyle: {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          borderTopWidth: 0,
          height: Platform.OS === "ios" ? 88 : 80,
          paddingTop: 8,
          paddingBottom: Platform.OS === "ios" ? 28 : 16,
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

export default function TabLayout() {
  return (
    <SiteAccessGate>
      <TabsContent />
    </SiteAccessGate>
  );
}
