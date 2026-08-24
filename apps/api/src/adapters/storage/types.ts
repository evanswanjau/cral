export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<{ key: string }>;
  /** Short-lived signed URL for reading an object — never a public bucket URL (spec §22). */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}
