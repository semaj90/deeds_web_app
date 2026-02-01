import { env } from '$lib/env';
import { Client } from 'minio';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface MinioS3ClientConfig {
  endPoint: string;
	port: number;
  useSSL: boolean;
	accessKey: string;
  secretKey: string;
	bucket: string;
}

export function getMinioConfig(): MinioS3ClientConfig {
  return {
    endPoint: env.MINIO_HOST ?? 'localhost',
    port: parseInt(env.MINIO_PORT ?? '9000', 10),
    useSSL: env.MINIO_USE_SSL === 'true',
    accessKey: env.MINIO_ACCESS_KEY ?? 'minioadmin',
    secretKey: env.MINIO_SECRET_KEY ?? 'minioadmin',
    bucket: env.MINIO_BUCKET ?? 'legal-docs',
  };
}

let minioClientInstance: Client | null = null;

export function getMinioS3Client(): Client {
  if (!minioClientInstance) {
    const config = getMinioConfig();
    minioClientInstance = new Client({
      endPoint: config.endPoint,
      port: config.port,
      useSSL: config.useSSL,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
    });
  }
  return minioClientInstance;
}

export class MinIOService {
  private client: Client;
  private bucket: string;

  constructor() {
    const config = getMinioConfig();
    this.client = getMinioS3Client();
    this.bucket = config.bucket;
  }

  async ensureBucketExists(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket, 'us-east-1');
    }
  }

  async uploadFile(file: File, userId: string): Promise<{
	bucket: string; key: string;
	url: string }> {
    try {
      await this.ensureBucketExists();

      const key = `${userId}/${Date.now()}-${file.name}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      await this.client.putObject(this.bucket, key, buffer, file.size, {
        'Content-Type': file.type,
      });

      const config = getMinioConfig();
      const protocol = config.useSSL ? 'https' : 'http';
      const url = `${protocol}://${config.endPoint}:${config.port}/${this.bucket}/${key}`;

      return { bucket: this.bucket, key, url };
    } catch (error) {
      console.error('MinIO upload error:', error);
      throw error;
    }
  }

  async getObjectBuffer(key: string): Promise<Buffer> {
    await this.ensureBucketExists();
    const stream = await this.client.getObject(this.bucket, key);

    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', (err) => reject(err));
    });
  }

  async getTextContent(key: string): Promise<{
	content: string; metadata: Record<string, unknown> }> {
    const buffer = await this.getObjectBuffer(key);
    return {
      content: buffer.toString('utf-8'),
      metadata: {},
	};
  }

  static extractKeyFromUrl(url: string, bucket: string): string {
    if (url.startsWith('minio://')) {
      return url.replace('minio://', '');
    }
    if (url.startsWith('http')) {
      // Try to extract key from URL: http://host:port/bucket/key
      const parts = url.split('/');
      // parts[0]=http: parts[1]='', parts[2]=host:port, parts[3]=bucket
      if (parts.length >= 5 && parts[3] === bucket) {
        return parts.slice(4).join('/');
      }
    }
    return url; // Assume it's the key
  }

  // Static helpers for direct usage
  static async getTextContentFromUrl(url: string): Promise<{
	content: string; metadata: Record<string, unknown> } | null> {
    try {
      const service = new MinIOService();
      const key = MinIOService.extractKeyFromUrl(url, service.bucket);
      return await service.getTextContent(key);
    } catch (e) {
      console.error('MinIOService.getTextContent failed', e);
      return null;
    }
  }

  static async getObjectBufferFromUrl(url: string): Promise<Buffer> {
    const service = new MinIOService();
    const key = MinIOService.extractKeyFromUrl(url, service.bucket);
    return await service.getObjectBuffer(key);
  }
}
