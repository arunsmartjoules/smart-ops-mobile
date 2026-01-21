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
}

export interface SignaturePadHandle {
  getSignature: () => string | null;
  clear: () => void;
}

export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  ({ onClear }, ref) => {
    const [paths, setPaths] = useState<string[]>([]);
    const [currentPath, setCurrentPath] = useState<string>("");

    useImperativeHandle(ref, () => ({
      getSignature: () => {
        if (paths.length === 0) return null;
        // In a real app, you might want to convert the SVG to a base64 image
        // For now, we'll store the SVG path data as a string
        return paths.join(";");
      },
      clear: () => {
        setPaths([]);
        setCurrentPath("");
        if (onClear) onClear();
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
          setPaths([...paths, currentPath]);
          setCurrentPath("");
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
                    stroke="black"
                    strokeWidth={3}
                    fill="none"
                  />
                ))}
                {currentPath ? (
                  <Path
                    d={currentPath}
                    stroke="black"
                    strokeWidth={3}
                    fill="none"
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
            }}
            className="absolute bottom-2 right-2 bg-slate-100 px-3 py-1 rounded-full"
          >
            <Text className="text-slate-500 text-xs font-bold">Clear</Text>
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
    backgroundColor: "#f8fafc",
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  pad: {
    flex: 1,
    position: "relative",
  },
  svgContainer: {
    flex: 1,
  },
});
