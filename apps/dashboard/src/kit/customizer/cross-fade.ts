import { flushSync } from "react-dom";

export function crossFade(change: () => void) {
  if (
    typeof document.startViewTransition !== "function" ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    change();
    return;
  }
  document.startViewTransition(() => flushSync(change));
}
