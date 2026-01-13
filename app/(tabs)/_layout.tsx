// @ts-nocheck
import React from "react";

import { View } from "react-native";
import { Tabs } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import {
  LayoutDashboard,
  Activity,
  ListChecks,
  Ticket,
  User,
} from "lucide-react-native";
import { useColorScheme } from "nativewind";

export default function TabLayout() {
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === "dark";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#dc2626",
        tabBarInactiveTintColor: isDark ? "#64748b" : "#94a3b8",
        tabBarShowLabel: true,
        tabBarStyle: {
          backgroundColor: isDark ? "#0f172a" : "#ffffff",
          borderTopWidth: 0,
          height: 80,
          paddingTop: 12,
          paddingBottom: 20,
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.08,
          shadowRadius: 16,
          elevation: 25,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: "600",
          marginTop: 4,
        },
        tabBarIconStyle: {
          marginBottom: -2,
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
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? "#fef2f2" : "transparent",
                padding: 8,
                borderRadius: 12,
              }}
            >
              <LayoutDashboard
                size={22}
                color={focused ? "#dc2626" : color}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="site-logs"
        options={{
          title: "Logs",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? "#fffbeb" : "transparent",
                padding: 8,
                borderRadius: 12,
              }}
            >
              <Activity
                size={22}
                color={focused ? "#f59e0b" : color}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="preventive-maintenance"
        options={{
          title: "PM",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? "#eff6ff" : "transparent",
                padding: 8,
                borderRadius: 12,
              }}
            >
              <ListChecks
                size={22}
                color={focused ? "#3b82f6" : color}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: "Tickets",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? "#fef2f2" : "transparent",
                padding: 8,
                borderRadius: 12,
              }}
            >
              <Ticket
                size={22}
                color={focused ? "#ef4444" : color}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, focused }) => (
            <View
              style={{
                backgroundColor: focused ? "#fef2f2" : "transparent",
                padding: 8,
                borderRadius: 12,
              }}
            >
              <User
                size={22}
                color={focused ? "#ef4444" : color}
                strokeWidth={focused ? 2.5 : 2}
              />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}
