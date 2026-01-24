export interface Settings {
  pixel_size: number;
  dither_strength: number;
  gloom: number;
  contrast: number;
}

export const DEFAULT_SETTINGS: Settings = {
  pixel_size: 3.0,
  dither_strength: 0.9,
  gloom: 0.15,
  contrast: 0.75,
};
