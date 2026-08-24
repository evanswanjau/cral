import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import type { StorageAdapter, PutObjectInput } from "./types.js";

/**
 * Dev-only adapter: writes to a local directory and hands back a URL served
 * by nothing in particular yet. Real uploads (presigned PUT, virus scan,
 * thumbnailing) are built when a phase actually needs file uploads — this
 * just proves the interface so a real provider (S3/R2/GCS) drops in later
 * without touching call sites.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private readonly root: string;

  constructor(root = process.env.STORAGE_LOCAL_DIR ?? "./.local-storage") {
    this.root = resolve(root);
  }

  async putObject(input: PutObjectInput): Promise<{ key: string }> {
    const filePath = join(this.root, input.key);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, input.body);
    return { key: input.key };
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    return `local://${join(this.root, key)}?expires=${expiresAt}`;
  }
}
