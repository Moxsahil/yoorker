import { useSyncExternalStore } from "react";

const QUERY = "(max-width: 767px)";

function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

/** True below the 768px breakpoint, kept in step as the window resizes. */
export function useIsMobile() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
}
