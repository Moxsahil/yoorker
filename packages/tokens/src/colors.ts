/**
 * Yoorker color tokens.
 * Palette: green, dark navy, teal and orange, taken from the sprint plan's design.
 */

/** Primary: pitch green, the main brand color (buttons, links, "free" slots). */
export const primary = {
  50: "#f0fdf4",
  100: "#dcfce7",
  200: "#bbf7d0",
  300: "#86efac",
  400: "#4ade80",
  500: "#22c55e",
  600: "#16a34a", // main brand green
  700: "#15803d",
  800: "#166534",
  900: "#14532d",
} as const;

/** Secondary: night navy (headers, dark backgrounds, text). */
export const secondary = {
  50: "#f8fafc",
  100: "#f1f5f9",
  200: "#e2e8f0",
  300: "#cbd5e1",
  400: "#94a3b8",
  500: "#64748b",
  600: "#475569",
  700: "#334155",
  800: "#1e293b",
  900: "#0b1220", // main dark navy
} as const;

/** Accent: teal, used for highlights and secondary actions. */
export const accent = {
  100: "#ccfbf1",
  500: "#14b8a6",
  600: "#0d9488",
  700: "#0f766e",
} as const;

/** Neutral greys for borders, dividers and muted text. */
export const neutral = {
  0: "#ffffff",
  50: "#f9fafb",
  100: "#f3f4f6",
  200: "#e5e7eb",
  300: "#d1d5db",
  400: "#9ca3af",
  500: "#6b7280",
  600: "#4b5563",
  700: "#374151",
  800: "#1f2937",
  900: "#111827",
  1000: "#000000",
} as const;

/** Status colors for success, warnings, errors and info. */
export const status = {
  success: "#16a34a",
  warning: "#ea8a0c",
  error: "#dc2626",
  info: "#2563eb",
} as const;

/** Slot-grid states (Sprint 2): free, held, booked, blocked. */
export const slot = {
  free: primary[500],
  held: status.warning,
  booked: secondary[400],
  blocked: neutral[300],
} as const;

/** Semantic aliases: use these in components instead of raw scale values. */
export const colors = {
  brand: primary[600],
  brandLight: primary[300],
  background: neutral[0],
  backgroundDark: secondary[900],
  surface: neutral[50],
  border: neutral[200],
  text: secondary[900],
  textMuted: neutral[500],
  textOnDark: neutral[0],
  ...status,
} as const;

export type ColorToken = keyof typeof colors;
