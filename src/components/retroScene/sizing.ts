import { MAX_DISK_SCALE, MAX_SCALE, MIN_DISK_SCALE, MIN_SCALE } from "./constants";

// Calculate scale based on size - more linear for noticeable differences
export function sizeToScale(size: number, maxSize: number): number {
  if (maxSize <= 0 || size <= 0) return MIN_SCALE;
  // Linear ratio with slight curve for better distribution
  const ratio = size / maxSize;
  // Gentle power curve to prevent tiny objects but keep differences visible
  const curved = Math.pow(ratio, 0.7);
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * curved;
}

export function diskSizeToScale(totalSpace: number, maxTotalSpace: number): number {
  return maxTotalSpace > 0
    ? MIN_DISK_SCALE + (MAX_DISK_SCALE - MIN_DISK_SCALE) * Math.sqrt(totalSpace / maxTotalSpace)
    : 1.0;
}

export function diskMaxScale(maxTotalSpace: number): number {
  return diskSizeToScale(maxTotalSpace, maxTotalSpace);
}
