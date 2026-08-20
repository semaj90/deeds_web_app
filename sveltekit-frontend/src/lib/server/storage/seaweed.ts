import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ENV } from "../env.server.js";

/**
 * SeaweedFS S3-compatible client.
 * Connects to the S3 gateway (port 8333).
 */
export const seaweed = new S3Client({
  region: ENV.SEAWEED_S3_REGION,
  endpoint: ENV.SEAWEED_S3_ENDPOINT,
  forcePathStyle: true,
  credentials: {
    accessKeyId: ENV.SEAWEED_ACCESS_KEY,
    secretAccessKey: ENV.SEAWEED_SECRET_KEY
  }
});

export const seaweedBucket = ENV.SEAWEED_S3_BUCKET;

function requireSeaweedBucket(bucket?: string): string {
  const resolved = bucket ?? seaweedBucket;
  if (!resolved) throw new Error("SEAWEED_S3_BUCKET is not configured");
  return resolved;
}

/**
 * Upload a file to SeaweedFS S3.
 */
export async function putFileToSeaweed(args: {
  objectKey: string;
  bytes: Uint8Array;
  contentType?: string;
  bucket?: string;
  metadata?: Record<string, string>;
}): Promise<{ etag: string | null }> {
  const result = await seaweed.send(
    new PutObjectCommand({
      Bucket: requireSeaweedBucket(args.bucket),
      Key: args.objectKey,
      Body: args.bytes,
      ContentType: args.contentType,
      Metadata: args.metadata,
    })
  );
  return { etag: result.ETag ?? null };
}

/**
 * Read a SeaweedFS object with a hard byte ceiling. The worker stops consuming
 * the response as soon as the budget is exceeded instead of first buffering an
 * arbitrarily large cold object into host memory.
 */
export async function getFileFromSeaweed(args: {
  objectKey: string;
  maximumBytes: number;
  bucket?: string;
}): Promise<Uint8Array> {
  if (!Number.isInteger(args.maximumBytes) || args.maximumBytes < 0) {
    throw new Error("maximumBytes must be a non-negative integer");
  }
  const response = await seaweed.send(new GetObjectCommand({
    Bucket: requireSeaweedBucket(args.bucket),
    Key: args.objectKey,
  }));
  if (!response.Body) throw new Error(`SeaweedFS object body missing: ${args.objectKey}`);

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
    const bytes = chunk instanceof Uint8Array ? chunk : new Uint8Array(chunk);
    total += bytes.byteLength;
    if (total > args.maximumBytes) {
      throw new Error(`SEAWEED_OBJECT_BYTE_BUDGET_EXCEEDED:${total}:${args.maximumBytes}`);
    }
    chunks.push(bytes);
  }

  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result;
}

export async function headFileInSeaweed(args: {
  objectKey: string;
  bucket?: string;
}): Promise<{ contentLength: number; contentType: string | null; etag: string | null }> {
  const response = await seaweed.send(new HeadObjectCommand({
    Bucket: requireSeaweedBucket(args.bucket),
    Key: args.objectKey,
  }));
  return {
    contentLength: response.ContentLength ?? 0,
    contentType: response.ContentType ?? null,
    etag: response.ETag ?? null,
  };
}

/**
 * Delete a file from SeaweedFS S3.
 */
export async function deleteFileFromSeaweed(objectKey: string, bucket?: string) {
  await seaweed.send(
    new DeleteObjectCommand({
      Bucket: requireSeaweedBucket(bucket),
      Key: objectKey
    })
  );
}
