/// <reference types="nativewind/types" />

import * as React from "react";
import "react-native";

/**
 * React 19 + NativeWind Compatibility Fix
 *
 * This file uses interface merging to restore missing React.Component properties
 * to React Native components and fixes broken expo-router type definitions.
 */

declare module "react-native" {
  // Define a compatibility base that includes NativeWind props
  interface ComponentCompat<P> extends React.Component<P> {
    props: P & { className?: string; tw?: string };
  }

  // Augment core components
  interface View extends ComponentCompat<ViewProps> {}
  interface Text extends ComponentCompat<TextProps> {}
  interface Image extends ComponentCompat<ImageProps> {}
  interface ScrollView extends ComponentCompat<ScrollViewProps> {}
  interface TextInput extends ComponentCompat<TextInputProps> {}
  interface TouchableOpacity extends ComponentCompat<TouchableOpacityProps> {}
  interface Pressable extends ComponentCompat<PressableProps> {}
  interface FlatList<ItemT> extends ComponentCompat<FlatListProps<ItemT>> {}
  interface SectionList<ItemT, SectionT>
    extends ComponentCompat<SectionListProps<ItemT, SectionT>> {}
  interface Modal extends ComponentCompat<ModalProps> {}
  interface ActivityIndicator extends ComponentCompat<ActivityIndicatorProps> {}
  interface Switch extends ComponentCompat<SwitchProps> {}
  interface RefreshControl extends ComponentCompat<RefreshControlProps> {}
  interface StatusBar extends ComponentCompat<StatusBarProps> {}
  interface KeyboardAvoidingView
    extends ComponentCompat<KeyboardAvoidingViewProps> {}
  interface ImageBackground extends ComponentCompat<ImageBackgroundProps> {}
  interface SafeAreaView extends ComponentCompat<ViewProps> {}

  // Props augmentations
  interface ViewProps {
    className?: string;
    tw?: string;
  }
  interface TextProps {
    className?: string;
    tw?: string;
  }
  interface ImageProps {
    className?: string;
    tw?: string;
  }
  interface ScrollViewProps {
    className?: string;
    tw?: string;
  }
  interface TextInputProps {
    className?: string;
    tw?: string;
  }
  interface TouchableOpacityProps {
    className?: string;
    tw?: string;
  }
  interface PressableProps {
    className?: string;
    tw?: string;
  }
  interface RefreshControlProps {
    className?: string;
    tw?: string;
  }
  interface StatusBarProps {
    className?: string;
    tw?: string;
  }
  interface KeyboardAvoidingViewProps {
    className?: string;
    tw?: string;
  }
  interface ImageBackgroundProps {
    className?: string;
    tw?: string;
  }
}

declare module "react-native-safe-area-context" {
  import { ReactNode } from "react";
  import { ViewProps } from "react-native";
  interface SafeAreaViewProps extends ViewProps {
    className?: string;
    tw?: string;
    children?: ReactNode;
  }
}

declare module "expo-linear-gradient" {
  import { ReactNode } from "react";
  import { ViewProps } from "react-native";
  interface LinearGradientProps extends ViewProps {
    className?: string;
    tw?: string;
    children?: ReactNode;
  }
}

declare module "lucide-react-native" {
  import { LucideProps } from "lucide-react-native";
  import { ReactNode } from "react";
  export interface IconProps extends LucideProps {
    className?: string;
    tw?: string;
    children?: ReactNode;
  }
}

// Fix expo-router broken types
declare module "expo-router" {
  import { ComponentType } from "react";
  export const router: any;
  export const Link: ComponentType<any>;
  export const useRouter: () => any;
  export const useLocalSearchParams: <T>() => T;
  export const useGlobalSearchParams: <T>() => T;
  export const useSegments: () => string[];
  export const usePathname: () => string;
  export const useFocusEffect: (callback: () => void) => void;
  export const Stack: ComponentType<any> & { Screen: ComponentType<any> };
  export const Tabs: ComponentType<any> & { Screen: ComponentType<any> };
  export type Href = string | object;
}

// Ensure the JSX namespace is also compatible if libraries look there
declare global {
  namespace JSX {
    interface ElementClass {
      props: any;
    }
  }
}
