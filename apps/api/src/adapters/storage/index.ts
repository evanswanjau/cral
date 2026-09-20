import type { StorageAdapter } from "./types.js";
import { LocalStorageAdapter } from "./local-adapter.js";
import { B2StorageAdapter } from "./b2-adapter.js";

export type { StorageAdapter, PutObjectInput } from "./types.js";

export function createStorageAdapter(): StorageAdapter {
  const kind = process.env.STORAGE_ADAPTER ?? "local";
  switch (kind) {
    case "local":
      return new LocalStorageAdapter();
    case "b2":
      return new B2StorageAdapter();
    default:
      throw new Error(`Unknown STORAGE_ADAPTER "${kind}"`);
  }
}
