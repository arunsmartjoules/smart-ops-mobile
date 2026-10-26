/**
 * The "Sign to complete" sheet must never leave the operator with a button
 * that does nothing ("frozen, no response", Oct 2026). It now encodes the
 * strokes in JS and hands them over synchronously — nothing to wait on.
 */
import React from "react";
import { Alert, Text } from "react-native";
import renderer, { act } from "react-test-renderer";

// Lets a test "draw" a stroke by calling the pan handler's callbacks.
let mockPan: any = null;
jest.mock("react-native-gesture-handler", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  return {
    State: { END: 5 },
    GestureHandlerRootView: (p: any) => R.createElement(V, null, p.children),
    PanGestureHandler: (p: any) => {
      mockPan = p;
      return p.children;
    },
  };
});

jest.mock("react-native-svg", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  const Stub = (p: any) => R.createElement(V, null, p.children);
  return { __esModule: true, default: Stub, Path: Stub };
});

jest.mock("react-native-reanimated", () => {
  const R = require("react");
  const { View: V } = require("react-native");
  const anim = { duration: () => undefined };
  return {
    __esModule: true,
    default: { View: (p: any) => R.createElement(V, null, p.children) },
    FadeIn: anim,
    SlideInDown: anim,
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/components/jo/ui", () => {
  const R = require("react");
  const { Pressable: P, Text: T } = require("react-native");
  const Button = ({ label, onPress, busy }: any) =>
    R.createElement(P, { onPress, disabled: !!busy, accessibilityRole: "button" }, R.createElement(T, null, label));
  return {
    PrimaryButton: Button,
    SecondaryButton: Button,
    IconButton: ({ label, onPress }: any) => R.createElement(P, { onPress, accessibilityLabel: label }),
    f: { d: () => ({}), t: () => ({}) },
    useJoTheme: () => ({}),
  };
});

import { SignatureSheet } from "@/components/sitelogs/SignatureSheet";

function renderSheet({ draw = true } = {}) {
  const onOK = jest.fn();
  const onClose = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(
      <SignatureSheet
        visible
        title="Sign to complete"
        okText="Complete reading"
        onOK={onOK}
        onClose={onClose}
      />,
    );
  });
  if (draw) {
    act(() => mockPan.onGestureEvent({ nativeEvent: { x: 10, y: 10 } }));
    act(() => mockPan.onGestureEvent({ nativeEvent: { x: 40, y: 30 } }));
    act(() => mockPan.onHandlerStateChange({ nativeEvent: { state: 5 } }));
  }
  const hasText = (label: string) =>
    tree.root.findAll((n) => n.type === Text && n.props.children === label).length > 0;
  /** Press the mocked button whose label is `label`. */
  const press = (label: string) => {
    const button = tree.root.find(
      (n) => n.props.accessibilityRole === "button" &&
        n.findAll((c) => c.type === Text && c.props.children === label).length > 0,
    );
    return button.props.onPress();
  };
  // Backdrop and the X button are both labelled "Close"; either closes.
  const pressClose = () =>
    tree.root.findAll((n) => n.props.accessibilityLabel === "Close" && n.props.onPress)[0]!.props.onPress();
  return { hasText, press, pressClose, onOK, onClose };
}

let alertSpy: jest.SpyInstance;
beforeEach(() => {
  alertSpy = jest.spyOn(Alert, "alert").mockImplementation(() => {});
});
afterEach(() => alertSpy.mockRestore());

describe("SignatureSheet confirm", () => {
  it("hands over the signature in the same tap", () => {
    const { press, onOK } = renderSheet();
    act(() => press("Complete reading"));
    expect(onOK).toHaveBeenCalledTimes(1);
  });

  it("hands over an SVG data URI", () => {
    const { press, onOK } = renderSheet();
    act(() => press("Complete reading"));
    expect(onOK.mock.calls[0][0]).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it("includes a stroke still being drawn when confirmed", () => {
    const { press, onOK } = renderSheet({ draw: false });
    act(() => mockPan.onGestureEvent({ nativeEvent: { x: 10, y: 10 } }));
    act(() => mockPan.onGestureEvent({ nativeEvent: { x: 40, y: 30 } }));
    act(() => press("Complete reading"));
    expect(onOK).toHaveBeenCalledTimes(1);
  });

  it("asks for a signature when the pad is empty", () => {
    const { press, onOK } = renderSheet({ draw: false });
    act(() => press("Complete reading"));
    expect([alertSpy.mock.calls[0]?.[0], onOK.mock.calls.length]).toEqual(["Signature Required", 0]);
  });

  it("can always be closed", () => {
    const { pressClose, onClose } = renderSheet();
    act(() => pressClose());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
