import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startVisiblePolling } from "../../lib/visible-polling";

describe("visible polling", () => {
  let doc: EventTarget & { visibilityState: string };
  let win: EventTarget;

  beforeEach(() => {
    vi.useFakeTimers();
    doc = Object.assign(new EventTarget(), { visibilityState: "visible" });
    win = new EventTarget();
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", win);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it("backs off failures, resumes on success, and stops on cleanup", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const onError = vi.fn();
    const stop = startVisiblePolling({ interval: 1000, maxInterval: 4000, immediate: true, run, onError });
    await vi.advanceTimersByTimeAsync(1999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(4000);
    expect(run).toHaveBeenCalledTimes(3);
    expect(onError).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(run).toHaveBeenCalledTimes(4);
    stop();
    await vi.advanceTimersByTimeAsync(10000);
    expect(run).toHaveBeenCalledTimes(4);
  });

  it("aborts pending work when hidden and revalidates once on return", async () => {
    const signals: AbortSignal[] = [];
    const run = vi.fn((signal: AbortSignal) => {
      signals.push(signal);
      return new Promise<void>((resolve) => signal.addEventListener("abort", () => resolve()));
    });
    const stop = startVisiblePolling({ interval: 1000, maxInterval: 4000, immediate: true, run, onError: vi.fn() });
    doc.visibilityState = "hidden";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(signals[0].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(1);
    doc.visibilityState = "visible";
    doc.dispatchEvent(new Event("visibilitychange"));
    expect(run).toHaveBeenCalledTimes(2);
    stop();
    expect(signals[1].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(5000);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
