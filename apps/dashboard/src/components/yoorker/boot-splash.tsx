import { useState } from "react";

import { YoorkerMark } from "./logo";

/**
 * The Yoorker mark on the page colour while the session loads. It is the same splash
 * index.html shows before React starts (its `.boot` styles live there), so the hand-over
 * is seamless: past the 400 ms fade-in the mark is already showing and stays put; before
 * it, the mark keeps waiting, so a fast load never flashes anything.
 */
export function BootSplash() {
  const [shown] = useState(() => performance.now() > 640);
  return (
    <div className={shown ? "boot now" : "boot"} role="status" aria-label="Loading Yoorker">
      <YoorkerMark />
    </div>
  );
}
