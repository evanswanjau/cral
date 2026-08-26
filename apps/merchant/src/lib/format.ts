/** Human file size, e.g. 1.4MB or 480KB. */
export function formatFileSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)}MB` : `${Math.round(bytes / 1024)}KB`;
}
