import React, { useEffect, useRef } from "react";
import { View, Animated, StyleSheet, ViewStyle, useColorScheme } from "react-native";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  style?: ViewStyle;
  borderRadius?: number;
}

export default function Skeleton({
  width = "100%",
  height = 20,
  style,
  borderRadius = 8,
}: SkeletonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.6,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height: height as any,
          borderRadius,
          backgroundColor: isDark ? "#1e293b" : "#e2e8f0", // slate-800 : slate-200
          opacity,
        },
        style,
      ]}
    />
  );
}
