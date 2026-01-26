import { MIN_SCALE, MAX_SCALE } from "./constants";

let objectIdCounter = 0;

export function generateId(): string {
  return `obj_${objectIdCounter++}`;
}

export function formatSize(bytes: number): string {
  const KB = 1024;
  const MB = KB * 1024;
  const GB = MB * 1024;
  const TB = GB * 1024;

  if (bytes >= TB) return `${(bytes / TB).toFixed(1)} TB`;
  if (bytes >= GB) return `${(bytes / GB).toFixed(1)} GB`;
  if (bytes >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (bytes >= KB) return `${(bytes / KB).toFixed(1)} KB`;
  return `${bytes} B`;
}

export function sizeToScale(size: number, maxSize: number): number {
  if (maxSize <= 0 || size <= 0) return MIN_SCALE;
  const ratio = size / maxSize;
  const curved = Math.pow(ratio, 0.7);
  return MIN_SCALE + (MAX_SCALE - MIN_SCALE) * curved;
}
