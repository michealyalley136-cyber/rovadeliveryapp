export function startVisiblePolling(options: {
  interval: number;
  maxInterval: number;
  run: (signal: AbortSignal) => Promise<void>;
  onError: (error: unknown) => void;
  immediate?: boolean;
}) {
  let stopped = false;
  let failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let controller: AbortController | undefined;

  function cancel() {
    clearTimeout(timer);
    controller?.abort();
    controller = undefined;
  }
  async function poll() {
    if (stopped || document.visibilityState !== "visible" || controller) return;
    const request = new AbortController();
    controller = request;
    try {
      await options.run(request.signal);
      if (!request.signal.aborted) failures = 0;
    } catch (error) {
      if (!request.signal.aborted && !stopped) {
        failures++;
        if (failures === 1) options.onError(error);
      }
    } finally {
      if (controller === request) {
        controller = undefined;
        if (!stopped && document.visibilityState === "visible") {
          timer = setTimeout(poll, Math.min(options.maxInterval, options.interval * 2 ** Math.min(failures, 10)));
        }
      }
    }
  }
  function resume() {
    cancel();
    if (document.visibilityState === "visible") void poll();
  }
  document.addEventListener("visibilitychange", resume);
  window.addEventListener("online", resume);
  if (options.immediate) void poll();
  else timer = setTimeout(poll, options.interval);
  return () => {
    stopped = true;
    cancel();
    document.removeEventListener("visibilitychange", resume);
    window.removeEventListener("online", resume);
  };
}
