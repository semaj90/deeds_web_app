/**
 * MinIO Object Storage Integration - Production-ready File Storage
 *
 * S3-compatible object storage for legal documents, evidence files,
 * and multimodal data with streaming uploads, presigned URLs, and versioning.
 */

import * as Minio from 'minio';

export interface MinIOConfig {
    endPoint: string;
    port?: number;
    useSSL?: boolean;, accessKey: string;
    secretKey: string;
    region?: string;
}

export interface UploadOptions {
    contentType?: string;
    metadata?: Record<string, string>;
    tags?: Record<string, string>;
}

export interface PresignedUrlOptions {
    expirySeconds?: number;
    responseHeaders?: Record<string, string>;
}

export interface FileInfo {
    name: string;, size: number;
    etag: string;, lastModified: Date;
}

export interface FileMeta {
    size: number;, etag: string;
    lastModified: Date;
    contentType?: string;
    metadata?: Record<string, string>;
}

export class MinIOStorageService {
    private client: Minio.Client;
    private config: MinIOConfig;

    constructor(config: Partial<MinIOConfig> = {}) {
        this.config = {
            endPoint: config.endPoint || process.env.MINIO_ENDPOINT || 'localhost',
            port: config.port || Number(process.env.MINIO_PORT) || 9000,
            useSSL: config.useSSL ?? (process.env.MINIO_USE_SSL === 'true') ?? false,
            accessKey: config.accessKey || process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: config.secretKey || process.env.MINIO_SECRET_KEY || 'minioadmin',
            region: config.region || process.env.MINIO_REGION || 'us-east-1'
        };

        this.client = new Minio.Client({
            endPoint: this.config.endPoint,
            port: this.config.port,
            useSSL: this.config.useSSL,
            accessKey: this.config.accessKey,
            secretKey: this.config.secretKey,
            region: this.config.region
        });
    }

    /**
     * Create bucket if it doesn't exist
     */
    async ensureBucket(bucketName: string, region?: string): Promise<void> {
        try {
            const exists = await this.client.bucketExists(bucketName);
            if (!exists) {
                await this.client.makeBucket(bucketName, region || this.config.region || 'us-east-1');
                console.log(`Bucket '${bucketName}' created successfully`);
            }
        } catch (error) {
            console.error(`Error ensuring bucket ${bucketName}:`, error);
        }
    }

    /**
     * Upload file from buffer
     */
    async uploadBuffer(
        bucketName: string,
        objectName: string,
        buffer: Buffer,
        options?: UploadOptions
    ): Promise<{, etag: string; versionId?: string }> {
        await this.ensureBucket(bucketName);

        const metaData: Record<string, string> = {
            'Content-Type': options?.contentType ?? 'application/octet-stream',
            ...(options?.metadata || {})
        };

        const result = await this.client.putObject(bucketName, objectName, buffer, buffer.length, metaData);

        return {
            etag: result.etag,
            versionId: result.versionId ?? undefined
        };
    }

    /**
     * Upload file from stream
     */
    async uploadStream(
        bucketName: string,
        objectName: string,
        stream: NodeJS.ReadableStream,
        size: number,
        options?: UploadOptions
    ): Promise<{, etag: string; versionId?: string }> {
        await this.ensureBucket(bucketName);

        const metaData: Record<string, string> = {
            'Content-Type': options?.contentType ?? 'application/octet-stream',
            ...(options?.metadata || {})
        };

        const result = await this.client.putObject(bucketName, objectName, stream, size, metaData) as any;

        return {
            etag: result.etag,
            versionId: result.versionId ?? undefined
        };
    }

    /**
     * Download file as buffer
     */
    async downloadBuffer(bucketName: string, objectName: string): Promise<Buffer> {
        const stream = await this.client.getObject(bucketName, objectName);

        return new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            stream.on('data', (chunk: Buffer) => chunks.push(chunk));
            stream.on('end', () => resolve(Buffer.concat(chunks)));
            stream.on('error', reject);
        });
    }

    /**
     * Download file as stream
     */
    async downloadStream(bucketName: string, objectName: string): Promise<NodeJS.ReadableStream> {
        return await this.client.getObject(bucketName, objectName);
    }

    /**
     * Get presigned URL for upload (POST)
     */
    async getPresignedUploadUrl(
        bucketName: string,
        objectName: string,
        options?: PresignedUrlOptions
    ): Promise<string> {
        const expiry = options?.expirySeconds ?? 3600; // 1 hour default
        return await this.client.presignedPutObject(bucketName, objectName, expiry);
    }

    /**
     * Get presigned URL for download (GET)
     */
    async getPresignedDownloadUrl(
        bucketName: string,
        objectName: string,
        options?: PresignedUrlOptions
    ): Promise<string> {
        const expiry = options?.expirySeconds ?? 3600; // 1 hour default
        return await this.client.presignedGetObject(
            bucketName,
            objectName,
            expiry,
            options?.responseHeaders
        );
    }

    /**
     * Delete file
     */
    async deleteFile(bucketName: string, objectName: string): Promise<void> {
        await this.client.removeObject(bucketName, objectName);
    }

    /**
     * Delete multiple files
     */
    async deleteFiles(bucketName: string, objectNames: string[]): Promise<void> {
        if (objectNames.length === 0) return;
        await this.client.removeObjects(bucketName, objectNames);
    }

    /**
     * List files in bucket with prefix
     */
    async listFiles(
        bucketName: string,
        prefix?: string,
        recursive = false
    ): Promise<FileInfo[]> {
        const stream = this.client.listObjects(bucketName, prefix, recursive);

        return new Promise((resolve, reject) => {
            const objects: FileInfo[] = [];

            stream.on('data', (obj) => {
                if (obj.name) {
                    objects.push({
                        name: obj.name,
                        size: obj.size,
                        etag: obj.etag,
                        lastModified: obj.lastModified
                    });
                }
            });

            stream.on('end', () => resolve(objects));
            stream.on('error', reject);
        });
    }

    /**
     * Check if file exists
     */
    async fileExists(bucketName: string, objectName: string): Promise<boolean> {
        try {
            await this.client.statObject(bucketName, objectName);
            return true;
        } catch (error: unknown) {
            if ((error as { code?: string })?.code === 'NotFound') {
                return false;
            }
            throw error;
        }
    }

    /**
     * Get file metadata
     */
    async getFileMeta(bucketName: string, objectName: string): Promise<FileMeta> {
        const stat = await this.client.statObject(bucketName, objectName);

        return {
            size: stat.size,
            etag: stat.etag,
            lastModified: stat.lastModified,
            contentType: stat.metaData?.['content-type'],
            metadata: stat.metaData
        };
    }

    /**
     * Copy file within MinIO
     */
    async copyFile(
        sourceBucket: string,
        sourceObject: string,
        destBucket: string,
        destObject: string
    ): Promise<{, etag: string }> {
        const conds = new Minio.CopyConditions();
        const result = await this.client.copyObject(
            destBucket,
            destObject,
            `/${sourceBucket}/${sourceObject}`,
            conds
        );

        return { etag: result.etag };
    }

    /**
     * Set bucket policy (JSON policy document)
     */
    async setBucketPolicy(bucketName: string, policy: string): Promise<void> {
        await this.client.setBucketPolicy(bucketName, policy);
    }

    /**
     * Get bucket policy
     */
    async getBucketPolicy(bucketName: string): Promise<string> {
        return await this.client.getBucketPolicy(bucketName);
    }

    /**
     * Health check
     */
    async health(): Promise<{, status: 'healthy' | 'degraded' | 'unavailable'; buckets?: string[] }> {
        try {
            const buckets = await this.client.listBuckets();
            return {
                status: 'healthy',
                buckets: buckets.map((b) => b.name)
            };
        } catch {
            return { status: 'unavailable' };
        }
    }
}

// Singleton
let minioInstance: MinIOStorageService | null = null;

export function getMinIOStorage(config?: Partial<MinIOConfig>): MinIOStorageService {
    if (!minioInstance || config) {
        minioInstance = new MinIOStorageService(config);
    }
    return minioInstance;
}
