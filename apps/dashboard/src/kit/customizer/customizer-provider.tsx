import { createContext, useContext, useEffect, useState } from "react";
import { createStore, useStore, type StoreApi } from "zustand";
import { persist } from "zustand/middleware";

import {
  buildThemeCss,
  fontVariables,
  SCALE_SIZES,
  STORAGE_KEY,
  type CustomizerSettings,
  type KitTheme,
} from "./settings";

interface CustomizerState extends CustomizerSettings {
  hydrated: boolean;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
  set: (patch: Partial<CustomizerSettings>) => void;
  reset: () => void;
}

const CustomizerContext = createContext<{
  store: StoreApi<CustomizerState>;
  theme: KitTheme;
} | null>(null);

function createCustomizerStore(defaults: CustomizerSettings) {
  return createStore<CustomizerState>()(
    persist(
      (set) => ({
        ...defaults,
        hydrated: false,
        panelOpen: false,
        setPanelOpen: (panelOpen) => set({ panelOpen }),
        set: (patch) => set(patch),
        reset: () => set({ ...defaults }),
      }),
      {
        name: STORAGE_KEY,
        skipHydration: true,
        partialize: (state): CustomizerSettings => ({
          preset: state.preset,
          custom: state.custom,
          radius: state.radius,
          font: state.font,
          scale: state.scale,
          contentWidth: state.contentWidth,
          sidebarVariant: state.sidebarVariant,
          sidebarCollapsible: state.sidebarCollapsible,
          layout: state.layout,
          direction: state.direction,
        }),
        onRehydrateStorage: () => (state) => state?.set({}),
      },
    ),
  );
}

export function CustomizerProvider({
  theme,
  children,
}: {
  theme: KitTheme;
  children: React.ReactNode;
}) {
  const [store] = useState(() => createCustomizerStore(theme.defaults));
  const [value] = useState(() => ({ store, theme }));

  useEffect(() => {
    Promise.resolve(store.persist.rehydrate()).then(() => store.setState({ hydrated: true }));
  }, [store]);

  return (
    <CustomizerContext.Provider value={value}>
      <ThemeStyle store={store} theme={theme} />
      {children}
    </CustomizerContext.Provider>
  );
}

function ThemeStyle({ store, theme }: { store: StoreApi<CustomizerState>; theme: KitTheme }) {
  const settings = useStore(store);
  const css = buildThemeCss(settings, [...theme.presets], fontVariables(theme.fonts), SCALE_SIZES);

  useEffect(() => {
    if (!settings.hydrated) {
      return;
    }
    document.documentElement.dir = settings.direction;
    document.getElementById("kit-customizer-boot")?.remove();
  }, [settings.hydrated, settings.direction]);

  return settings.hydrated ? <style id="kit-customizer">{css}</style> : null;
}

function useCustomizerContext() {
  const context = useContext(CustomizerContext);
  if (!context) {
    throw new Error("useCustomizer must be used inside CustomizerProvider.");
  }
  return context;
}

export function useCustomizer<T>(select: (state: CustomizerState) => T): T {
  return useStore(useCustomizerContext().store, select);
}

export function useKitTheme(): KitTheme {
  return useCustomizerContext().theme;
}
