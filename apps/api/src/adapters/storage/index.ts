import type { StorageAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local-adapter.js";

export type { StorageAdapter, PutObjectInput } from "./types.js";

export function createStorageAdapter(): StorageAdapter {
  const kind = process.env.STORAGE_ADAPTER ?? "local";
  switch (kind) {
    case "local":
      return new LocalStorageAdapter();
    default:
      throw new Error(`Unknown STORAGE_ADAPTER "${kind}"`);
  }
}
