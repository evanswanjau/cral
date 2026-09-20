import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { PutObjectInput, StorageAdapter } from "./types.js";

/**
 * Backblaze B2 via its S3-compatible API — the first real storage provider
 * in this codebase, replacing LocalStorageAdapter's dev-only disk writes.
 *
 * Why this exists: the local adapter writes to the container filesystem,
 * which any container host wipes on redeploy. A `documents` row outlives the
 * bytes it points at, and a photo that 404s reads as a corrupt document. The
 * bucket is the only place file bytes survive a deploy.
 *
 * B2 speaks S3, so this is the AWS SDK pointed at a different endpoint —
 * `forcePathStyle` because B2 addresses buckets as a path segment, not a
 * hostname prefix.
 *
 * The bucket must stay PRIVATE (spec §22). Nothing here ever builds a public
 * URL: reads go through getObject (streamed to the owner over an
 * authenticated request) or a short-lived presigned URL.
 */
export class B2StorageAdapter implements StorageAdapter {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const bucket = process.env.B2_BUCKET;
    const endpoint = process.env.B2_ENDPOINT;
    const region = process.env.B2_REGION;
    const accessKeyId = process.env.B2_KEY_ID;
    const secretAccessKey = process.env.B2_APPLICATION_KEY;

    // Thrown from the constructor, at boot, the same way TextSmsAdapter
    // handles a missing key — a storage adapter that can't reach its bucket
    // should fail the deploy, not the first upload an hour later.
    const missing = Object.entries({
      B2_BUCKET: bucket,
      B2_ENDPOINT: endpoint,
      B2_REGION: region,
      B2_KEY_ID: accessKeyId,
      B2_APPLICATION_KEY: secretAccessKey,
    })
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length > 0) {
      throw new Error(`STORAGE_ADAPTER=b2 needs ${missing.join(", ")} in the environment`);
    }

    this.bucket = bucket as string;
    this.client = new S3Client({
      // Narrowed by the `missing` check above; TS can't see through the
      // Object.entries filter, and the project runs exactOptionalPropertyTypes.
      endpoint: endpoint as string,
      region: region as string,
      forcePathStyle: true,
      credentials: {
        accessKeyId: accessKeyId as string,
        secretAccessKey: secretAccessKey as string,
      },
    });
  }

  async putObject(input: PutObjectInput): Promise<{ key: string }> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.body,
        ContentType: input.contentType,
      }),
    );
    return { key: input.key };
  }

  async getObject(key: string): Promise<Buffer> {
    const res = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!res.Body) throw new Error(`Object has no body: ${key}`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  /**
   * Idempotent, matching the interface's contract: S3 DeleteObject already
   * succeeds on a key that was never there, so there is no ENOENT branch to
   * mirror from the local adapter.
   */
  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async getSignedUrl(key: string, expiresInSeconds: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  }
}
