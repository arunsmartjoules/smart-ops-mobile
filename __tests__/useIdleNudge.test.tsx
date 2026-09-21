/**
 * The FAB's idle attention nudge. Pure timer logic — no RN components, so it
 * runs without the theme/native mocks a component render would need.
 */
import React from "react";
import renderer, { act } from "react-test-renderer";
import { useIdleNudge } from "@/hooks/useIdleNudge";

type Probe = { nudge: boolean; bump: () => void };

/** Renders the hook and keeps every value it returned, newest last. */
function mount(delayMs: number, enabled: boolean) {
  const seen: Probe[] = [];
  const Harness = ({ on }: { on: boolean }) => {
    seen.push(useIdleNudge(delayMs, on) as Probe);
    return null;
  };
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<Harness on={enabled} />);
  });
  return {
    latest: () => seen[seen.length - 1]!,
    setEnabled: (on: boolean) => act(() => tree.update(<Harness on={on} />)),
    unmount: () => act(() => tree.unmount()),
  };
}

describe("useIdleNudge", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("stays quiet until the delay has elapsed", () => {
    const h = mount(6000, true);
    expect(h.latest().nudge).toBe(false);
    act(() => void jest.advanceTimersByTime(5999));
    expect(h.latest().nudge).toBe(false);
    act(() => void jest.advanceTimersByTime(1));
    expect(h.latest().nudge).toBe(true);
    h.unmount();
  });

  it("bump() clears an active nudge and restarts the wait", () => {
    const h = mount(6000, true);
    act(() => void jest.advanceTimersByTime(6000));
    expect(h.latest().nudge).toBe(true);

    act(() => h.latest().bump());
    expect(h.latest().nudge).toBe(false);

    act(() => void jest.advanceTimersByTime(5999));
    expect(h.latest().nudge).toBe(false);
    act(() => void jest.advanceTimersByTime(1));
    expect(h.latest().nudge).toBe(true);
    h.unmount();
  });

  it("never nudges while disabled, and hides an armed nudge at once", () => {
    const h = mount(6000, false);
    act(() => void jest.advanceTimersByTime(60000));
    expect(h.latest().nudge).toBe(false);

    // Re-enabling starts a fresh wait rather than firing immediately.
    h.setEnabled(true);
    expect(h.latest().nudge).toBe(false);
    act(() => void jest.advanceTimersByTime(6000));
    expect(h.latest().nudge).toBe(true);

    // A sheet opening mid-nudge must take the animation away immediately.
    h.setEnabled(false);
    expect(h.latest().nudge).toBe(false);
    h.unmount();
  });

  it("does not fire after unmount", () => {
    const h = mount(6000, true);
    h.unmount();
    expect(() => act(() => void jest.advanceTimersByTime(6000))).not.toThrow();
  });
});
