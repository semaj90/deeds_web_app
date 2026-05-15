import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
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

/**
 * Upload a file to SeaweedFS S3.
 */
export async function putFileToSeaweed(args: {
  objectKey: string;
  bytes: Uint8Array;
  contentType?: string;
}) {
  await seaweed.send(
    new PutObjectCommand({
      Bucket: seaweedBucket,
      Key: args.objectKey,
      Body: args.bytes,
      ContentType: args.contentType
    })
  );
}

/**
 * Delete a file from SeaweedFS S3.
 */
export async function deleteFileFromSeaweed(objectKey: string) {
  await seaweed.send(
    new DeleteObjectCommand({
      Bucket: seaweedBucket,
      Key: objectKey
    })
  );
}
