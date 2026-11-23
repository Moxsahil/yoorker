export function whenIdle(task: () => void): () => void {
  if (typeof window === "undefined") {
    return () => {};
  }
  if ("requestIdleCallback" in window) {
    const handle = window.requestIdleCallback(task, { timeout: 2000 });
    return () => window.cancelIdleCallback(handle);
  }
  const timer = setTimeout(task, 1200);
  return () => clearTimeout(timer);
}
