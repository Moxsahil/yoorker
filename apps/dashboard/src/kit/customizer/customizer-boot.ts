import {
  buildThemeCss,
  fontVariables,
  SCALE_SIZES,
  STORAGE_KEY,
  type CustomizerSettings,
  type KitTheme,
} from "./settings";

/**
 * Applies saved customizer settings before the first paint: call it in the entry file before
 * `createRoot(...).render(...)`, so a visitor who picked a different preset never sees the
 * default flash first. The provider removes this style once React owns the theme.
 */
export function bootCustomizer(theme: KitTheme): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as { state?: CustomizerSettings }).state : undefined;
    if (!saved) return;
    const style = document.createElement("style");
    style.id = "kit-customizer-boot";
    style.textContent = buildThemeCss(
      saved,
      [...theme.presets],
      fontVariables(theme.fonts),
      SCALE_SIZES,
    );
    document.head.appendChild(style);
    if (saved.direction) document.documentElement.dir = saved.direction;
  } catch {
    // Unreadable or blocked storage: start from the default theme.
  }
}
