export type TokenMap = Record<string, string>;

export interface ThemePreset {
  id: string;
  name: string;
  swatches: readonly string[];
  radius: string;
  light: TokenMap;
  dark: TokenMap;
}

export function findPreset(presets: readonly ThemePreset[], id: string): ThemePreset {
  return presets.find((preset) => preset.id === id) ?? presets[0]!;
}

export function parseThemeCss(css: string): { light: TokenMap; dark: TokenMap } | null {
  const block = (selector: RegExp) => {
    const match = css.match(selector);
    if (!match) {
      return {};
    }
    const tokens: TokenMap = {};
    for (const [, name, value] of match[1]!.matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/gi)) {
      tokens[name!.trim()] = value!.trim();
    }
    return tokens;
  };
  const light = block(/:root\s*\{([^}]*)\}/);
  const dark = block(/\.dark\s*\{([^}]*)\}/);
  if (Object.keys(light).length === 0 && Object.keys(dark).length === 0) {
    return null;
  }
  return { light, dark };
}

export function themeCss(light: TokenMap, dark: TokenMap, radius: string): string {
  const lines = (tokens: TokenMap) =>
    Object.entries(tokens)
      .map(([name, value]) => `  --${name}: ${value};`)
      .join("\n");
  return `:root {\n  --radius: ${radius};\n${lines(light)}\n}\n\n.dark {\n${lines(dark)}\n}\n`;
}
