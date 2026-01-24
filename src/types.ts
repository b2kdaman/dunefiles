export interface Settings {
  pixel_size: number;
  dither_strength: number;
  gloom: number;
  contrast: number;
}

export const DEFAULT_SETTINGS: Settings = {
  pixel_size: 3.0,
  dither_strength: 0.85,
  gloom: 0.12,
  contrast: 1.15,
};
