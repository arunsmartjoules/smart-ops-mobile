import React, { useEffect } from 'react';
import { TouchableOpacity, StyleSheet } from 'react-native';
import Animated, { 
  useAnimatedStyle, 
  withSpring, 
  useSharedValue 
} from 'react-native-reanimated';

interface AnimatedTabBarButtonProps {
  focused: boolean;
  onPress: () => void;
  children: React.ReactNode;
  activeColor: string;
  inactiveColor: string;
}

export const AnimatedTabBarButton: React.FC<AnimatedTabBarButtonProps> = ({ 
  focused, 
  onPress, 
  children,
  activeColor,
  inactiveColor
}) => {
  const scale = useSharedValue(1);
   const progress = useSharedValue(focused ? 1 : 0);

   useEffect(() => {
     progress.value = withSpring(focused ? 1 : 0, { damping: 15 });
   }, [focused, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ scale: scale.value }],
      backgroundColor: focused ? withSpring('#f8fafc', { damping: 12 }) : 'transparent',
    };
  });

   const handlePress = () => {
     scale.value = withSpring(0.9, { damping: 10 }, () => {
       scale.value = withSpring(1, { damping: 10 });
     });
     onPress();
   };

  return (
    <TouchableOpacity 
      onPress={handlePress}
      activeOpacity={0.8}
      style={styles.container}
    >
      <Animated.View style={[styles.inner, animatedStyle]}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    padding: 10,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
