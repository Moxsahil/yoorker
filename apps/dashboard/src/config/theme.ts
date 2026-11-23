import { defineTheme } from "@/kit/customizer/settings";
import { LIBRARY_PRESETS } from "@/kit/theme/library";

export const THEME = defineTheme({
  defaults: {
    preset: "default",
    custom: null,
    radius: "0.625rem",
    font: "hanken",
    scale: "md",
    contentWidth: "full",
    sidebarVariant: "inset",
    sidebarCollapsible: "icon",
    layout: "sidebar",
    direction: "ltr",
  },
  presets: [
    {
      id: "default",
      name: "Yoorker",
      swatches: [
        "oklch(0.515 0.19 263)",
        "oklch(0.215 0.028 264)",
        "oklch(0.974 0.006 255)",
        "oklch(0.62 0.12 228)",
      ],
      radius: "0.625rem",
      light: {},
      dark: {},
    },
    ...LIBRARY_PRESETS,
  ],
  fonts: [
    { id: "hanken", label: "Hanken Grotesk", variable: "var(--font-hanken)" },
    {
      id: "system",
      label: "System UI",
      variable: "ui-sans-serif, system-ui, sans-serif",
    },
  ],
});
