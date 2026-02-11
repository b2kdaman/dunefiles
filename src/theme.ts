export type ThemeName = "red" | "green" | "neon-blue";

export type ThemePalette = {
  name: ThemeName;
  primaryHex: number;
  accentHex: number;
  softHex: number;
  dimHex: number;
  backgroundHex: number;
  deepBackgroundHex: number;
  fogHex: number;
  planeHex: number;
  meshBaseHex: number;
  meshEmissiveHex: number;
  mechaTintHex: number;
};

const PALETTES: Record<ThemeName, ThemePalette> = {
  red: {
    name: "red",
    primaryHex: 0xff2f2f,
    accentHex: 0xff6666,
    softHex: 0xff8e8e,
    dimHex: 0xff4444,
    backgroundHex: 0x050101,
    deepBackgroundHex: 0x140808,
    fogHex: 0x3a0808,
    planeHex: 0x170b0b,
    meshBaseHex: 0x442a2a,
    meshEmissiveHex: 0x200505,
    mechaTintHex: 0x660000,
  },
  green: {
    name: "green",
    primaryHex: 0x4cff63,
    accentHex: 0x7dff90,
    softHex: 0xafffb8,
    dimHex: 0x36cc4a,
    backgroundHex: 0x010501,
    deepBackgroundHex: 0x081408,
    fogHex: 0x083a0d,
    planeHex: 0x0b170b,
    meshBaseHex: 0x26442a,
    meshEmissiveHex: 0x052005,
    mechaTintHex: 0x1f661f,
  },
  "neon-blue": {
    name: "neon-blue",
    primaryHex: 0x12d7ff,
    accentHex: 0x56e9ff,
    softHex: 0x8bf4ff,
    dimHex: 0x00a4ce,
    backgroundHex: 0x01040a,
    deepBackgroundHex: 0x081424,
    fogHex: 0x06354a,
    planeHex: 0x081520,
    meshBaseHex: 0x1f334a,
    meshEmissiveHex: 0x051220,
    mechaTintHex: 0x114466,
  },
};

let currentTheme: ThemeName = "red";

export function getThemePalette(theme: ThemeName): ThemePalette {
  return PALETTES[theme];
}

export function getCurrentThemePalette(): ThemePalette {
  return PALETTES[currentTheme];
}

export function setCurrentTheme(theme: ThemeName): void {
  currentTheme = theme;
}

export function hexToCss(hex: number): string {
  return `#${hex.toString(16).padStart(6, "0")}`;
}

export function rgbaFromHex(hex: number, alpha: number): string {
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
