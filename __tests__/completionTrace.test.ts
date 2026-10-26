const mockActivity = jest.fn();
jest.mock("../utils/logger", () => ({
  __esModule: true,
  default: { activity: (...args: any[]) => mockActivity(...args) },
}));

import { startCompletionTrace } from "../utils/completionTrace";

const reasons = () => mockActivity.mock.calls.map((c) => c[3].reason);

beforeEach(() => {
  jest.useFakeTimers();
  mockActivity.mockClear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe("startCompletionTrace", () => {
  it("reports nothing for a completion that finishes quickly", () => {
    const trace = startCompletionTrace("CHILLER_READING");
    trace.step("sign_confirm");
    trace.finish("ok");
    jest.advanceTimersByTime(10_000);
    expect(mockActivity).not.toHaveBeenCalled();
  });

  it("reports the last step reached when still running after 5s", () => {
    const trace = startCompletionTrace("SITE_LOG");
    trace.step("sign_captured");
    jest.advanceTimersByTime(5_000);
    expect(mockActivity.mock.calls[0][3]).toMatchObject({
      reason: "still_running",
      last_step: "sign_captured",
    });
  });

  it("reports a timeout and then the late finish", () => {
    const trace = startCompletionTrace("CHILLER_READING");
    jest.advanceTimersByTime(15_000);
    trace.finish("timeout");
    trace.finish("ok");
    expect(reasons()).toEqual(["still_running", "timeout", "finished_after_timeout"]);
  });

  it("reports an error immediately", () => {
    startCompletionTrace("SITE_LOG").finish("error", { error: "boom" });
    expect(mockActivity.mock.calls[0][3]).toMatchObject({ reason: "error", error: "boom" });
  });
});
