jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));
// The module registry pulls in icon components; the pin rules don't need them.
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

import { setPins, togglePin, visiblePins } from "../services/NavPins";
import AsyncStorage from "@react-native-async-storage/async-storage";

function lastSaved(): unknown {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  return JSON.parse(calls[calls.length - 1][1]);
}

describe("NavPins.togglePin", () => {
  beforeEach(() => setPins(["tickets", "pm"]));

  it("pinning a third module drops the oldest pin", () => {
    togglePin("sla");
    expect(lastSaved()).toEqual(["pm", "sla"]);
  });

  it("tapping a pinned module unpins it", () => {
    togglePin("pm");
    expect(lastSaved()).toEqual(["tickets"]);
  });

  it("never unpins the last remaining module", () => {
    setPins(["comms"]);
    togglePin("comms");
    expect(lastSaved()).toEqual(["comms"]);
  });
});

describe("visiblePins", () => {
  const fallback = ["tickets", "pm", "logs", "incidents", "sla"] as const;

  it("drops pins the role can't view and tops up from the fallback order", () => {
    const allowed = (k: string) => k !== "pm";
    expect(visiblePins(["tickets", "pm"], allowed, fallback)).toEqual(["tickets", "logs"]);
  });

  it("shows fewer pins when fewer modules are viewable", () => {
    const allowed = (k: string) => k === "sla";
    expect(visiblePins(["tickets", "pm"], allowed, fallback)).toEqual(["sla"]);
  });

  it("trims pins saved under the old three-pin bar", () => {
    expect(visiblePins(["tickets", "pm", "logs"], () => true, fallback)).toEqual(["tickets", "pm"]);
  });
});
