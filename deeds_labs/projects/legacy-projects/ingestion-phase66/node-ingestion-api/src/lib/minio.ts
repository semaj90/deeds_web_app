import { Client } from 'minio';

const minioClient = new Client({
  endPoint: process.env.MINIO_ENDPOINT || 'minio',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: false,
  accessKey: process.env.MINIO_ACCESS_KEY || 'admin',
  secretKey: process.env.MINIO_SECRET_KEY || 'password'
});

const BUCKET_NAME = process.env.MINIO_BUCKET || 'legal-documents';

export async function ensureBucketExists() {
  try {
    const exists = await minioClient.bucketExists(BUCKET_NAME);
    if (!exists) {
      await minioClient.makeBucket(BUCKET_NAME);
      console.log(`📦 Created MinIO bucket: ${BUCKET_NAME}`);
    }
  } catch (error) {
    console.error('MinIO bucket creation error:', error);
    throw error;
  }
}

export async function storeRawFile(objectKey: string, buffer: Buffer, mimeType: string) {
  try {
    await ensureBucketExists();

    await minioClient.putObject(BUCKET_NAME, objectKey, buffer, buffer.length, {
      'Content-Type': mimeType
    });

    console.log(`💾 Stored file in MinIO: ${objectKey}`);
    return objectKey;
  } catch (error) {
    console.error('MinIO upload error:', error);
    throw error;
  }
}

export async function getFileStream(objectKey: string) {
  try {
    return await minioClient.getObject(BUCKET_NAME, objectKey);
  } catch (error) {
    console.error('MinIO download error:', error);
    throw error;
  }
}

export async function deleteFile(objectKey: string) {
  try {
    await minioClient.removeObject(BUCKET_NAME, objectKey);
    console.log(`🗑️ Deleted file from MinIO: ${objectKey}`);
  } catch (error) {
    console.error('MinIO delete error:', error);
    throw error;
  }
}

export async function checkMinIOConnection(): Promise<boolean> {
  try {
    await minioClient.listBuckets();
    return true;
  } catch (error) {
    console.error('MinIO connection check failed:', error);
    return false;
  }
}