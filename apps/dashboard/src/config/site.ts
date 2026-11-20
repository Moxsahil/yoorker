import { BRAND } from "@/config/brand";
import type { ShellConfig } from "@/kit/shell/types";

import { NAV, SECONDARY_NAV } from "./nav";

/** The shell's fixed parts; the venues and the user come from the API (features/shell). */
export const SITE: Omit<ShellConfig, "workspaces" | "user"> = {
  brand: { name: BRAND.name, logo: BRAND.mark },
  nav: NAV,
  secondary: SECONDARY_NAV,
  workspaceLabels: { group: "Venues", add: "Add a venue" },
};
