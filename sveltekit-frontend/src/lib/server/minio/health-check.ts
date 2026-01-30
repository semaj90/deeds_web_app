/**
 * MinIO Evidence Storage Health Check Utility
 * Validates MinIO connectivity and bucket access
 *
 * Requirements: 5.1, 5.3, 5.5
 */
import { env } from '$lib/env';
import { Client } from 'minio';

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
const EVIDENCE_BUCKET = process.env.MINIO_EVIDENCE_BUCKET ?? 'legal-evidence';
const AI_CHAT_IMAGES_BUCKET = process.env.MINIO_AI_CHAT_IMAGES_BUCKET ?? 'ai-chat-images';

/**
 * Create MinIO client for health checks
 */
function createMinioClient(): Client {
	const endPoint = env?.MINIO_ENDPOINT ?? 'localhost';
	const port = parseInt(env?.MINIO_PORT ?? '9000', 10);
	const accessKey = env?.MINIO_ACCESS_KEY ?? 'minioadmin';
	const secretKey = env?.MINIO_SECRET_KEY ?? 'minioadmin';
	const useSSL = env?.MINIO_USE_SSL === 'true';

	return new Client({
		endPoint: endPoint.split(':')[0],
		port: endPoint.includes(':') ? parseInt(endPoint.split(':')[1], 10) : port,
		useSSL,
		accessKey,
		secretKey
	});
}

/**
 * Check MinIO connectivity and bucket status
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
		const endpoint = env?.MINIO_ENDPOINT ?? 'localhost:9000';
		result.connection.endpoint = endpoint;

		// Test connection by listing buckets (with timeout)
		const bucketListPromise = client.listBuckets();
		const timeoutPromise = new Promise<never>((_, reject) =>
			setTimeout(() => reject(new Error('MinIO connection timeout')), 5000)
		);

		const buckets = await Promise.race([bucketListPromise, timeoutPromise]);
		result.connection.connected = true;

		// Check if required buckets exist
		const bucketNames = buckets.map((b: { name: string }) => b.name);
		result.buckets.evidence = bucketNames.includes(EVIDENCE_BUCKET);
		result.buckets.chatImages = bucketNames.includes(AI_CHAT_IMAGES_BUCKET);

		// Overall health: connected and at least evidence bucket exists
		result.healthy = result.connection.connected && result.buckets.evidence;
		result.latency = Date.now() - startTime;

	} catch (error: unknown) {
		const err = error as Error;
		result.connection.error = err.message || 'Unknown MinIO error';
		result.latency = Date.now() - startTime;
		console.warn('⚠️ MinIO health check failed:', err.message);
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
			console.log(`✅ Created MinIO bucket: ${EVIDENCE_BUCKET}`);
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
 * Get MinIO storage status for API endpoints
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
		console.error('❌ MinIO upload failed:', err.message);
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
