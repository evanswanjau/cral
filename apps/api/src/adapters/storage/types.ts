export interface PutObjectInput {
  key: string;
  body: Buffer;
  contentType: string;
}

export interface StorageAdapter {
  putObject(input: PutObjectInput): Promise<{ key: string }>;
  /**
   * Reads an object's bytes back. Used by the API to stream a document to
   * its owner over an authenticated request, rather than handing the
   * browser a URL — the local adapter has no HTTP surface of its own, and
   * a real provider's bucket must never be public (spec §22).
   */
  getObject(key: string): Promise<Buffer>;
  /** Short-lived signed URL for reading an object — never a public bucket URL (spec §22). */
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
  /**
   * Removes an object. Idempotent: deleting a key that isn't there resolves
   * rather than throwing, so a retried delete and a delete racing a cleanup
   * both settle.
   *
   * Every caller deletes the database row first and the bytes second. The
   * reverse order can leave a row pointing at nothing, which reads as a
   * corrupt document; this order can at worst leak a file, which is
   * recoverable.
   */
  deleteObject(key: string): Promise<void>;
}
