import type { FileEntry } from "../../store/sceneStore";

// Format bytes to human readable
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

export function formatEntrySize(entry: FileEntry): string {
  const size = formatSize(entry.size);

  if (entry.is_dir && entry.size_complete === false) {
    return entry.size > 0 ? `>${size}` : "large";
  }

  return size;
}
