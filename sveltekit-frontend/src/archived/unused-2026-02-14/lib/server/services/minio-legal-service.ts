import { env } from '$lib/env';
import { Client } from 'minio';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

const MINIO_ENDPOINT = env?.MINIO_ENDPOINT ?? 'localhost:9000';
const MINIO_ACCESS_KEY = env?.MINIO_ACCESS_KEY ?? 'minioadmin';
const MINIO_SECRET_KEY = env?.MINIO_SECRET_KEY ?? 'minioadmin';
const MINIO_USE_SSL = env.MINIO_USE_SSL === 'true';

const BUCKET_LAWS = 'minio_bucket_laws';
const BUCKET_LAWS_PARSED = 'minio_bucket_laws_parsed';
const BUCKET_LAWS_METADATA = 'minio_bucket_laws_metadata';

let minioClient: Client | null = null;

/**
 * Get or create MinIO client
 */
function getMinioClient(): Client {
    if (!minioClient) {
        minioClient = new Client({
            endPoint: MINIO_ENDPOINT.split(':')[0],
            port: parseInt(MINIO_ENDPOINT.split(':')[1] ?? '9000'),
            useSSL: MINIO_USE_SSL,
            accessKey: MINIO_ACCESS_KEY,
            secretKey: MINIO_SECRET_KEY,
        });
    }
    return minioClient;
}

/**
 * Initialize MinIO buckets for legal search
 */
export async function initializeMinIOBuckets() {
    try {
        const client = getMinioClient();
        console.log('[MinIO] Initializing legal search buckets...');

        // Create buckets if they don't exist
        const buckets = [BUCKET_LAWS, BUCKET_LAWS_PARSED, BUCKET_LAWS_METADATA];

        for (const bucket of buckets) {
            try {
                const exists = await client.bucketExists(bucket);
                if (!exists) {
                    await client.makeBucket(bucket, 'us-east-1');
                    console.log(`[MinIO] Created bucket: ${bucket}`);
                } else {
                    console.log(`[MinIO] Bucket already exists: ${bucket}`);
                }
            } catch (error) {
                console.error(`[MinIO] Error creating bucket ${bucket}:`, error);
                throw error;
            }
        }

        console.log('[MinIO] Legal search buckets initialized successfully');
        return true;
    } catch (error) {
        console.error('[MinIO] Error initializing buckets:', error);
        throw error;
    }
}

/**
 * Upload raw PDF to MinIO
 */
export async function uploadRawPDF(
    jurisdiction: string,
    codeAbbrev: string,
    sectionNumber: string,
    fileBuffer: Buffer,
    fileName: string
): Promise<string> {
    try {
        const client = getMinioClient();
        const key = `${jurisdiction}/${codeAbbrev}/${sectionNumber}/${fileName}`;

        await client.putObject(BUCKET_LAWS, key, fileBuffer, fileBuffer.length, {
            'Content-Type': 'application/pdf',
        });

        console.log(`[MinIO] Uploaded raw PDF: ${key}`);
        return key;
    } catch (error) {
        console.error('[MinIO] Error uploading raw PDF:', error);
        throw error;
    }
}

/**
 * Upload parsed text to MinIO
 */
export async function uploadParsedText(
    jurisdiction: string,
    codeAbbrev: string,
    sectionNumber: string,
    text: string
): Promise<string> {
    try {
        const client = getMinioClient();
        const key = `${jurisdiction}/${codeAbbrev}/${sectionNumber}.txt`;
        const buffer = Buffer.from(text, 'utf-8');

        await client.putObject(BUCKET_LAWS_PARSED, key, buffer, buffer.length, {
            'Content-Type': 'text/plain',
        });

        console.log(`[MinIO] Uploaded parsed text: ${key}`);
        return key;
    } catch (error) {
        console.error('[MinIO] Error uploading parsed text:', error);
        throw error;
    }
}

/**
 * Upload metadata JSON to MinIO
 */
export async function uploadMetadata(
    jurisdiction: string,
    codeAbbrev: string,
    sectionNumber: string,
    metadata: Record<string, any>
): Promise<string> {
    try {
        const client = getMinioClient();
        const key = `${jurisdiction}/${codeAbbrev}/${sectionNumber}.json`;
        const buffer = Buffer.from(JSON.stringify(metadata, null, 2), 'utf-8');

        await client.putObject(BUCKET_LAWS_METADATA, key, buffer, buffer.length, {
            'Content-Type': 'application/json',
        });

        console.log(`[MinIO] Uploaded metadata: ${key}`);
        return key;
    } catch (error) {
        console.error('[MinIO] Error uploading metadata:', error);
        throw error;
    }
}

/**
 * Upload case file chunk to MinIO
 */
export async function uploadCaseChunk(
    jurisdiction: string,
    caseId: string,
    chunkIndex: number,
    fileBuffer: Buffer,
    fileName: string
): Promise<string> {
    try {
        const client = getMinioClient();
        const key = `cases/${jurisdiction}/${caseId}/chunk_${chunkIndex}/${fileName}`;

        await client.putObject(BUCKET_LAWS, key, fileBuffer, fileBuffer.length, {
            'Content-Type': 'application/pdf',
        });

        console.log(`[MinIO] Uploaded case chunk: ${key}`);
        return key;
    } catch (error) {
        console.error('[MinIO] Error uploading case chunk:', error);
        throw error;
    }
}

/**
 * Download file from MinIO
 */
export async function downloadFile(bucket: string, key: string): Promise<Buffer> {
    try {
        const client = getMinioClient();
        const chunks: Buffer[] = [];

        return new Promise((resolve, reject) => {
            client.getObject(bucket, key, (error, stream) => {
                if (error) {
                    reject(error);
                    return;
                }

                stream.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                stream.on('end', () => {
                    resolve(Buffer.concat(chunks));
                });

                stream.on('error', (error) => {
                    reject(error);
                });
            });
        });
    } catch (error) {
        console.error('[MinIO] Error downloading file:', error);
        throw error;
    }
}

/**
 * Check MinIO health
 */
export async function checkMinIOHealth(): Promise<boolean> {
    try {
        const client = getMinioClient();
        // Try to list buckets as a health check
        await client.listBuckets();
        return true;
    } catch (error) {
        console.error('[MinIO] Health check failed:', error);
        return false;
    }
}
