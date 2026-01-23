import React, {
  useState,
  useRef,
  useImperativeHandle,
  forwardRef,
} from "react";
import { View, StyleSheet, TouchableOpacity, Text } from "react-native";
import Svg, { Path } from "react-native-svg";
import {
  PanGestureHandler,
  GestureHandlerRootView,
  State,
} from "react-native-gesture-handler";

interface SignaturePadProps {
  onClear?: () => void;
  onChange?: (signature: string | null) => void;
}

export interface SignaturePadHandle {
  getSignature: () => string | null;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ onClear, onChange }, ref) => {
    const [paths, setPaths] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>("");

    useImperativeHandle(ref, () => ({
      getSignature: () => {
        if (paths.length === 0) return null;
        return paths.join(";");
      },
      clear: () => {
        setPaths([]);
        setCurrentPath("");
        if (onClear) onClear();
        if (onChange) onChange(null);
      },
    }));

    const onGestureEvent = (event: any) => {
      const { x, y } = event.nativeEvent;
      if (currentPath === "") {
        setCurrentPath(`M${x},${y}`);
      } else {
        setCurrentPath(`${currentPath} L${x},${y}`);
      }
    };

    const onHandlerStateChange = (event: any) => {
      if (event.nativeEvent.state === State.END) {
        if (currentPath) {
          const newPaths = [...paths, currentPath];
          setPaths(newPaths);
          setCurrentPath("");
          if (onChange) onChange(newPaths.join(";"));
        }
      }
    };

    return (
      <GestureHandlerRootView style={styles.container}>
        <View style={styles.pad}>
          <PanGestureHandler
            onGestureEvent={onGestureEvent}
            onHandlerStateChange={onHandlerStateChange}
          >
            <View style={styles.svgContainer}>
              <Svg style={StyleSheet.absoluteFill}>
                {paths.map((p, i) => (
                  <Path
                    key={i}
                    d={p}
                    stroke="#0f172a"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ))}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke="#0f172a"
                    strokeWidth={3}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                ) : null}
              </Svg>
            </View>
          </PanGestureHandler>

          <TouchableOpacity
            onPress={() => {
              setPaths([]);
              setCurrentPath("");
              if (onClear) onClear();
              if (onChange) onChange(null);
            }}
            activeOpacity={0.7}
            className="absolute bottom-4 right-4 bg-white dark:bg-slate-800 px-4 py-2 rounded-xl border border-slate-100 dark:border-slate-700"
            style={{
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: 0.1,
              shadowRadius: 2,
              elevation: 2,
            }}
          >
            <Text className="text-slate-600 dark:text-slate-300 text-[10px] font-bold uppercase tracking-wider">
              Clear
            </Text>
          </TouchableOpacity>
        </View>
      </GestureHandlerRootView>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    height: 180,
    width: "100%",
    backgroundColor: "#fff",
    borderRadius: 12,
    overflow: "hidden",
  },
  pad: {
    flex: 1,
    position: "relative",
  },
  svgContainer: {
    flex: 1,
  },
});
