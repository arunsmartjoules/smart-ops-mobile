import React, { useEffect } from "react";
import { Pressable, StyleProp, StyleSheet, ViewStyle } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

interface AnimatedTabBarButtonProps {
  focused: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
  children: React.ReactNode;
  activeColor: string;
  inactiveColor: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityState?: {
    selected?: boolean;
  };
  accessibilityLabel?: string;
}

export const AnimatedTabBarButton: React.FC<AnimatedTabBarButtonProps> = ({
  focused,
  onPress,
  onLongPress,
  children,
  activeColor,
  inactiveColor,
  style,
  testID,
  accessibilityState,
  accessibilityLabel,
}) => {
  const pressScale = useSharedValue(1);
  const focusProgress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withTiming(focused ? 1 : 0, { duration: 180 });
  }, [focused, focusProgress]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { scale: pressScale.value },
        { translateY: interpolate(focusProgress.value, [0, 1], [0, -2]) },
      ],
      backgroundColor: interpolateColor(
        focusProgress.value,
        [0, 1],
        ["transparent", `${activeColor}14`],
      ),
      opacity: interpolate(focusProgress.value, [0, 1], [0.9, 1]),
    };
  });

  const handlePressIn = () => {
    pressScale.value = withTiming(0.96, { duration: 90 });
  };

  const handlePressOut = () => {
    pressScale.value = withTiming(1, { duration: 120 });
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      testID={testID}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      style={[styles.container, style]}
    >
      <Animated.View style={[styles.inner, animatedStyle]}>
        {children}
      </Animated.View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  inner: {
    padding: 10,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
