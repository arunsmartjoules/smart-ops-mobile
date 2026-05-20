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
  focused?: boolean;
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
  // React Navigation v7 communicates the active tab via aria-selected on the
  // button props; BottomTabBarButtonProps no longer includes `focused`.
  "aria-selected"?: boolean;
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
  "aria-selected": ariaSelected,
}) => {
  const isFocused =
    focused ?? ariaSelected ?? accessibilityState?.selected ?? false;
  const pressScale = useSharedValue(1);
  const focusProgress = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focusProgress.value = withTiming(isFocused ? 1 : 0, { duration: 180 });
  }, [isFocused, focusProgress]);

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
      accessibilityState={accessibilityState ?? { selected: isFocused }}
      android_ripple={null}
      android_disableSound
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
