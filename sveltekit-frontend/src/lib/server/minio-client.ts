import { ENV } from '$lib/server/env.server.js';
import { Client } from 'minio';

// Centralized MinIO client initialization
let minioClient: Client | null = null;

function getMinioClient(): Client {
 if (!minioClient) {
 const endPoint = ENV.MINIO_ENDPOINT;
 const port = parseInt(ENV.MINIO_PORT, 10);
 const accessKey = ENV.MINIO_ACCESS_KEY;
 const secretKey = ENV.MINIO_SECRET_KEY;
 const useSSL = ENV.MINIO_USE_SSL === 'true';

 minioClient = new Client({
   endPoint: endPoint.split(':')[0],
   port: endPoint.includes(':') ? parseInt(endPoint.split(':')[1], 10) : port,
   useSSL,
   accessKey,
   secretKey,
 });
 }
 return minioClient;
}

/**
 * Uploads a file to MinIO.
 * @param bucketName The name of the bucket.
 * @param objectName The name of the object (file) to create.
 * @param buffer The file content as a Buffer.
 * @param metaData Optional metadata for the object.
 */
export async function uploadFile(
 bucketName: string,
 objectName: string,
 buffer: Buffer,
 metaData: Record<string, string> = {}
): Promise<string> {
 const client = getMinioClient();

 // Ensure the bucket exists
 const bucketExists = await client.bucketExists(bucketName);
 if (!bucketExists) {
 await client.makeBucket(bucketName);
 console.log(`MinIO bucket '${bucketName}' created.`);
 }

 await client.putObject(bucketName, objectName, buffer, metaData);
 console.log(`File '${objectName}' uploaded to bucket '${bucketName}'.`);
 return objectName;
}

/**
 * Deletes a file from MinIO. Non-fatal — logs and returns false on failure.
 */
export async function deleteFile(bucketName: string, objectName: string): Promise<boolean> {
 try {
  const client = getMinioClient();
  await client.removeObject(bucketName, objectName);
  return true;
 } catch (err) {
  console.warn(`[minio] deleteFile failed: ${bucketName}/${objectName}`, err);
  return false;
 }
}

const BUCKET = ENV.MINIO_EVIDENCE_BUCKET;
const AI_CHAT_IMAGES_BUCKET = process.env.MINIO_AI_CHAT_IMAGES_BUCKET ?? 'ai-chat-images';

/**
 * Upload evidence file from FormData for AI chat
 */
export async function uploadEvidenceFile(opts: {
 caseId?: string, chatTurnId: string,
 file: File;
}) {
 const { caseId, chatTurnId, file } = opts;
 const client = getMinioClient();

 const ext = file.name.split('.').pop() ?? 'bin';
 const keyParts = ['evidence'];
 if (caseId) keyParts.push(caseId);
 keyParts.push(chatTurnId);
 const objectName = `${keyParts.join('/')}/${crypto.randomUUID()}.${ext}`;

 // Ensure bucket exists
 const bucketExists = await client.bucketExists(BUCKET);
 if (!bucketExists) {
 await client.makeBucket(BUCKET);
 console.log(`MinIO bucket '${BUCKET}' created.`);
 }

 // Convert File to Buffer for MinIO
 const arrayBuffer = await file.arrayBuffer();
 const buffer = Buffer.from(arrayBuffer);

 await client.putObject(BUCKET, objectName, buffer, {
 'Content-Type': file?.type ?? 'application/octet-stream',
 });

 return {
 bucket: BUCKET,
 objectName,
 };
}

/**
 * Upload image file to ai_chat_images bucket for contextual chat
 */
export async function uploadChatImage(opts: { caseId?: string, chatTurnId: string, file: File }) {
 const { caseId, chatTurnId, file } = opts;
 const client = getMinioClient();

 const ext = file.name.split('.').pop() ?? 'bin';
 const keyParts = ['chat-images'];
 if (caseId) keyParts.push(caseId);
 keyParts.push(chatTurnId);
 const objectName = `${keyParts.join('/')}/${crypto.randomUUID()}.${ext}`;

 // Ensure bucket exists
 const bucketExists = await client.bucketExists(AI_CHAT_IMAGES_BUCKET);
 if (!bucketExists) {
 await client.makeBucket(AI_CHAT_IMAGES_BUCKET);
 console.log(`MinIO bucket '${AI_CHAT_IMAGES_BUCKET}' created.`);
 }

 // Convert File to Buffer for MinIO
 const arrayBuffer = await file.arrayBuffer();
 const buffer = Buffer.from(arrayBuffer);

 await client.putObject(AI_CHAT_IMAGES_BUCKET, objectName, buffer, {
 'Content-Type': file?.type ?? 'application/octet-stream',
 });

 return {
 bucket: AI_CHAT_IMAGES_BUCKET,
 objectName,
 url: `minio://${AI_CHAT_IMAGES_BUCKET}/${objectName}`,
 };
}

/**
 * Fetches a file from MinIO as a Buffer.
 */
export async function getFile(bucketName: string, objectName: string): Promise<Buffer> {
 const client = getMinioClient();
 const stream = await client.getObject(bucketName, objectName);
 const chunks: Buffer[] = [];
 for await (const chunk of stream) {
  chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
 }
 return Buffer.concat(chunks);
}

/**
 * Get presigned URL for chat image
 */
export async function getChatImageUrl(objectName: string): Promise<string> {
 const client = getMinioClient();
 try {
 const url = await client.presignedGetObject(AI_CHAT_IMAGES_BUCKET, objectName, 24 * 60 * 60);
 return url;
 } catch (err) {
 console.error('Failed to get presigned URL:', err);
 return `minio://${AI_CHAT_IMAGES_BUCKET}/${objectName}`;
 }
}




