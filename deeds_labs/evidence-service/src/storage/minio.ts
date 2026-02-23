import * as Minio from 'minio';
import { env } from '../env.js';
import { logger } from '../utils/logger.js';
import fs from 'fs';

const minioClient = new Minio.Client({
  endPoint: env.minio.endpoint,
  port: env.minio.port,
  useSSL: env.minio.useSSL,
  accessKey: env.minio.accessKey,
  secretKey: env.minio.secretKey,
});

export async function ensureBucket(): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(env.minio.bucket);
    if (!exists) {
      await minioClient.makeBucket(env.minio.bucket, 'us-east-1');
      logger.info('MinIO bucket created', { bucket: env.minio.bucket });
    }
  } catch (error) {
    logger.error('Failed to ensure bucket exists', { error });
    throw error;
  }
}

export async function uploadFile(
  filePath: string,
  objectName: string,
  metadata?: Record<string, string>
): Promise<string> {
  try {
    await ensureBucket();

    const stat = fs.statSync(filePath);
    const metaData = {
      'Content-Type': 'application/octet-stream',
      ...metadata,
    };

    await minioClient.fPutObject(env.minio.bucket, objectName, filePath, metaData);

    logger.info('File uploaded to MinIO', { objectName, size: stat.size });
    return objectName;
  } catch (error) {
    logger.error('Failed to upload file to MinIO', { error });
    throw error;
  }
}

export async function downloadFile(objectName: string, destPath: string): Promise<void> {
  try {
    await minioClient.fGetObject(env.minio.bucket, objectName, destPath);
    logger.info('File downloaded from MinIO', { objectName, destPath });
  } catch (error) {
    logger.error('Failed to download file from MinIO', { error });
    throw error;
  }
}

export async function getPresignedUrl(objectName: string, expirySeconds: number = 3600): Promise<string> {
  try {
    const url = await minioClient.presignedGetObject(env.minio.bucket, objectName, expirySeconds);
    return url;
  } catch (error) {
    logger.error('Failed to generate presigned URL', { error });
    throw error;
  }
}

export async function deleteFile(objectName: string): Promise<void> {
  try {
    await minioClient.removeObject(env.minio.bucket, objectName);
    logger.info('File deleted from MinIO', { objectName });
  } catch (error) {
    logger.error('Failed to delete file from MinIO', { error });
    throw error;
  }
}
