import type { ThemePreset } from "./presets";

export type Font = string;
export type Scale = "sm" | "md" | "lg";
export type ContentWidth = "full" | "contained";
export type SidebarVariant = "sidebar" | "floating" | "inset";
export type SidebarCollapsible = "offcanvas" | "icon";
export type Layout = "sidebar" | "top";
export type Direction = "ltr" | "rtl";

export interface CustomizerSettings {
  preset: string;
  custom: { light: Record<string, string>; dark: Record<string, string> } | null;
  radius: string;
  font: Font;
  scale: Scale;
  contentWidth: ContentWidth;
  sidebarVariant: SidebarVariant;
  sidebarCollapsible: SidebarCollapsible;
  layout: Layout;
  direction: Direction;
}

export interface FontOption {
  id: string;
  label: string;
  variable: string;
}

export interface KitTheme {
  defaults: CustomizerSettings;
  presets: readonly ThemePreset[];
  fonts: readonly FontOption[];
}

export function defineTheme(theme: KitTheme): KitTheme {
  if (theme.presets.length === 0 || theme.fonts.length === 0) {
    throw new Error("KitTheme needs at least one preset and one font.");
  }
  if (!theme.presets.some((preset) => preset.id === theme.defaults.preset)) {
    throw new Error(`KitTheme default preset "${theme.defaults.preset}" is not in presets.`);
  }
  if (!theme.fonts.some((font) => font.id === theme.defaults.font)) {
    throw new Error(`KitTheme default font "${theme.defaults.font}" is not in fonts.`);
  }
  return theme;
}

export const STORAGE_KEY = "kit-customizer";

export const SCALE_SIZES: Record<Scale, string> = { sm: "15px", md: "16px", lg: "17px" };

export function fontVariables(fonts: readonly FontOption[]): Record<string, string> {
  return Object.fromEntries(fonts.map((font) => [font.id, font.variable]));
}

export function buildThemeCss(
  settings: Pick<CustomizerSettings, "preset" | "custom" | "radius" | "font" | "scale">,
  presets: { id: string; light: Record<string, string>; dark: Record<string, string> }[],
  fonts: Record<string, string>,
  sizes: Record<string, string>,
): string {
  const preset = (presets.find((candidate) => candidate.id === settings.preset) || presets[0])!;
  const light = settings.custom ? settings.custom.light : preset.light;
  const dark = settings.custom ? settings.custom.dark : preset.dark;
  const lines = (tokens: Record<string, string>) =>
    Object.keys(tokens)
      .map((name) => "--" + name + ":" + tokens[name] + ";")
      .join("");
  return (
    "html:root{--radius:" +
    settings.radius +
    ";--font-sans:" +
    (fonts[settings.font] || fonts[Object.keys(fonts)[0]!]) +
    ";font-size:" +
    (sizes[settings.scale] || "16px") +
    ";" +
    lines(light) +
    "}html:root.dark{" +
    lines(dark) +
    "}"
  );
}
