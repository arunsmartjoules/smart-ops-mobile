jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
  },
}));
// The module registry pulls in icon components; the pin rules don't need them.
jest.mock("lucide-react-native", () => new Proxy({}, { get: () => () => null }));

import { setPins, togglePin } from "../services/NavPins";
import AsyncStorage from "@react-native-async-storage/async-storage";

function lastSaved(): unknown {
  const calls = (AsyncStorage.setItem as jest.Mock).mock.calls;
  return JSON.parse(calls[calls.length - 1][1]);
}

describe("NavPins.togglePin", () => {
  beforeEach(() => setPins(["tickets", "pm", "logs"]));

  it("pinning a fourth module drops the oldest pin", () => {
    togglePin("sla");
    expect(lastSaved()).toEqual(["pm", "logs", "sla"]);
  });

  it("tapping a pinned module unpins it", () => {
    togglePin("pm");
    expect(lastSaved()).toEqual(["tickets", "logs"]);
  });

  it("never unpins the last remaining module", () => {
    setPins(["comms"]);
    togglePin("comms");
    expect(lastSaved()).toEqual(["comms"]);
  });
});
