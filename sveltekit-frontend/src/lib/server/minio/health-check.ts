/**
 * Object Storage Health Check Utility
 * Validates SeaweedFS or MinIO-compatible connectivity and bucket access
 *
 * Requirements: 5.1, 5.3, 5.5
 */
import { Client } from 'minio';
import { ENV } from '$lib/server/env.server.js';

export interface MinioHealthResult {
	healthy: boolean;
	timestamp: string;
	connection: {
	connected: boolean;
		endpoint?: string;
		error?: string;
	};
	buckets: {
	evidence: boolean;
		chatImages: boolean;
	};
	latency?: number;
}

// Bucket names from environment
const EVIDENCE_BUCKET = ENV.MINIO_EVIDENCE_BUCKET;
const AI_CHAT_IMAGES_BUCKET = process.env.SEAWEED_S3_BUCKET ?? ENV.MINIO_LIBRARY_BUCKET;

/**
 * Create object-storage client for health checks
 */
function createMinioClient(): Client {
	return new Client({
		endPoint: ENV.SEAWEED_ENDPOINT ?? ENV.MINIO_ENDPOINT,
		port: parseInt(ENV.SEAWEED_S3_PORT ?? ENV.MINIO_PORT, 10),
		useSSL: ENV.MINIO_USE_SSL === 'true',
		accessKey: ENV.SEAWEED_ACCESS_KEY ?? ENV.MINIO_ACCESS_KEY,
		secretKey: ENV.SEAWEED_SECRET_KEY ?? ENV.MINIO_SECRET_KEY
	});
}

/**
 * Check object-storage connectivity and bucket status
 */
export async function checkMinioHealth(): Promise<MinioHealthResult> {
	const startTime = Date.now();
	const result: MinioHealthResult = {
		healthy: false,
		timestamp: new Date().toISOString(),
		connection: {
	connected: false
		},
	buckets: {
	evidence: false,
			chatImages: false
		}
	};

	try {
		const client = createMinioClient();
		const endpoint = ENV.SEAWEED_ENDPOINT ?? ENV.MINIO_ENDPOINT;
		result.connection.endpoint = endpoint;

		// Test connection by listing buckets (with timeout)
		const bucketListPromise = client.listBuckets();
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('Object storage connection timeout')), 5000)
		);

		const buckets = await Promise.race([bucketListPromise, timeoutPromise]);
		result.connection.connected = true;

		// Check if required buckets exist
		const bucketNames = buckets.map((b: {
	name: string }) => b.name);
		result.buckets.evidence = bucketNames.includes(EVIDENCE_BUCKET);
		result.buckets.chatImages = bucketNames.includes(AI_CHAT_IMAGES_BUCKET);

		// Overall health: connected and at least evidence bucket exists
		result.healthy = result.connection.connected && result.buckets.evidence;
		result.latency = Date.now() - startTime;

	} catch (error: unknown) {
		const err = error as Error;
		result.connection.error = err.message || 'Unknown object storage error';
		result.latency = Date.now() - startTime;
		console.warn('⚠️ Object storage health check failed:', err.message);
	}

	return result;
}

/**
 * Verify file upload capability
 */
export async function verifyUploadCapability(): Promise<{
	canUpload: boolean;
	error?: string;
}> {
	try {
		const client = createMinioClient();

		// Ensure evidence bucket exists
		const bucketExists = await client.bucketExists(EVIDENCE_BUCKET);
		if (!bucketExists) {
			await client.makeBucket(EVIDENCE_BUCKET);
			console.log(`✅ Created object storage bucket: ${EVIDENCE_BUCKET}`);
		}

		// Test upload with a small test file
		const testKey = `_health-check/${Date.now()}.txt`;
		const testContent = Buffer.from('health-check-test');

		await client.putObject(EVIDENCE_BUCKET, testKey, testContent, {
			'Content-Type': 'text/plain'
		});

		// Clean up test file
		await client.removeObject(EVIDENCE_BUCKET, testKey);

		return { canUpload: true };
	} catch (error: unknown) {
		const err = error as Error;
		return {
			canUpload: false,
			error: err.message || 'Upload verification failed'
		};
	}
}

/**
 * Verify file retrieval capability
 */
export async function verifyRetrievalCapability(
	bucket: string,
	objectName: string
): Promise<{
	canRetrieve: boolean;
	error?: string;
}> {
	try {
		const client = createMinioClient();

		// Check if object exists
		await client.statObject(bucket, objectName);
		return { canRetrieve: true };
	} catch (error: unknown) {
		const err = error as Error;
		// NotFound is expected for non-existent files
		if (err.message?.includes('Not Found') || err.message?.includes('NoSuchKey')) {
			return { canRetrieve: false, error: 'Object not found' };
		}
		return {
			canRetrieve: false,
			error: err.message || 'Retrieval verification failed'
		};
	}
}

/**
 * Get object-storage status for API endpoints
 */
export async function getMinioStatus(): Promise<{
	status: 'healthy' | 'degraded' | 'unavailable';
	details: MinioHealthResult;
}> {
	const health = await checkMinioHealth();

	let status: 'healthy' | 'degraded' | 'unavailable' = 'unavailable';

	if (health.healthy) {
		status = 'healthy';
	} else if (health.connection.connected) {
		status = 'degraded';
	}

	return { status, details: health };
}

/**
 * Graceful file upload with error handling
 */
export async function safeUploadFile(
	bucket: string,
	objectName: string,
	buffer: Buffer,
	contentType: string = 'application/octet-stream'
): Promise<{
	success: boolean;
	objectName?: string;
	error?: string;
}> {
	try {
		const client = createMinioClient();

		// Ensure bucket exists
		const bucketExists = await client.bucketExists(bucket);
		if (!bucketExists) {
			await client.makeBucket(bucket);
		}

		await client.putObject(bucket, objectName, buffer, {
			'Content-Type': contentType
		});

		return { success: true, objectName };
	} catch (error: unknown) {
		const err = error as Error;
		console.error('❌ Object storage upload failed:', err.message);
		return {
			success: false,
			error: err.message || 'Upload failed'
		};
	}
}

export default {
	checkMinioHealth,
	verifyUploadCapability,
	verifyRetrievalCapability,
	getMinioStatus,
	safeUploadFile
};
