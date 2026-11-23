import { BRAND } from "@/config/brand";
import type { ShellConfig } from "@/kit/shell/types";

import { NAV, SECONDARY_NAV } from "./nav";

export const SITE: Omit<ShellConfig, "workspaces" | "user"> = {
  brand: { name: BRAND.name, logo: BRAND.mark },
  nav: NAV,
  secondary: SECONDARY_NAV,
  workspaceLabels: { group: "Venues", add: "Add a venue" },
};
