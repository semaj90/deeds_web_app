/**
 * MinIO File Storage Service Integration
 * Production-ready: object storage for documents and media files
 */
import { Client as MinIOClient } from 'minio';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

// Configuration
const CONFIG = {
	performance: { requestTimeout: 60000,
		maxFileSize: 100 * 1024 * 1024
	},
	minio: { maxFileSize: 100 * 1024 * 1024,
		allowedMimeTypes: [
			'application/pdf',
			'application/msword',
			'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'text/plain',
			'image/jpeg',
			'image/png',
			'image/gif'
		]
	},
	security: { maxRequestSize: 50 * 1024 * 1024
	}
};

// Environment helper
function getEnv(key: string): string | undefined {
	if (typeof process !== 'undefined' && process.env) {
		return process.env[key];
	}
	return undefined;
}

// Parse MinIO endpoint
const _rawEndpoint =
	getEnv('MINIO_ENDPOINT') || getEnv('MINIO_HOST') || 'localhost';
let _endPoint = _rawEndpoint;
let _port = parseInt(getEnv('MINIO_PORT') ?? '9000');
let _useSSL = getEnv('MINIO_USE_SSL') === 'true' || false;

try {
	if (_rawEndpoint.includes('://')) {
		try {
			const url = new URL(_rawEndpoint);
			_endPoint = url.hostname;
			if (url.port) _port = parseInt(url.port);
			_useSSL = url.protocol === 'https:'
		} catch {
			// fall back to naive parsing
		}
	} else if (_rawEndpoint.includes(':')) {
		const parts = _rawEndpoint.split(':');
		if (parts.length >= 2) {
			_endPoint = parts[0];
			const p = parseInt(parts[1]);
			if (!Number.isNaN(p)) _port = p;
		}
	}
} catch {
	// ignore parsing errors
}

const MINIO_CONFIG = {
	endPoint: _endPoint,
	port: _port,
	useSSL: _useSSL,
	accessKey: getEnv('MINIO_ACCESS_KEY') ?? 'minioadmin',
	secretKey: getEnv('MINIO_SECRET_KEY') ?? 'minioadmin123',
	region: getEnv('MINIO_REGION') ?? 'us-east-1',
	requestTimeout: CONFIG.performance.requestTimeout
};

// Bucket configurations
const BUCKETS = {
	DOCUMENTS: 'legal-documents',
	EVIDENCE: 'evidence-files',
	IMAGES: 'image-assets',
	THUMBNAILS: 'thumbnails',
	TEMP: 'temp-uploads',
	ARCHIVES: 'archived-files',
	BACKUPS: 'system-backups'
} as const;

// Interfaces
export interface FileMetadata {
	originalName: string; 
fileName: string; 
fileSize: number; 
mimeType: string; 
fileType: string; 
bucket: string;
	uploadedBy?: number;
	caseId?: number;
	documentId?: number;
	description?: string;
	tags?: string[]; 
uploadedAt: Date
}

export interface UploadResult {
	success: boolean; 
fileId: string; 
fileName: string; 
bucket: string; 
size: number; 
url: string; 
metadata: FileMetadata;
	error?: string
}

export interface ListedFile {
	name: string; 
size: number;
	lastModified?: Date;
	contentType?: string; 
url: string
}

export interface FileObject {
	buffer: Buffer; 
size: number; 
contentType: string;
	originalName?: string
}

export interface BucketInfo {
	name: string;
	creationDate?: Date
}

export interface HealthCheckResult {
	status: 'healthy' | 'unhealthy'; 
details: {
		buckets?: number;
		bucketNames?: string[];
		endpoint?: string; 
initialized: boolean;
		error?: string
	};
}

export class MinIOService {
	private client: InstanceType<typeof MinIOClient> | null = null;
	private isInitialized = false;
	private static instance: MinIOService;

	private ensureClientAvailable(): void {
		if (!this.client) {
			throw new Error(
				'MinIO client not available. Initialization failed or client was not constructed.'
			);
		}
	}

	constructor() {
		try {
			this.client = new MinIOClient({
				endPoint: MINIO_CONFIG.endPoint,
				port: MINIO_CONFIG.port,
				useSSL: MINIO_CONFIG.useSSL,
				accessKey: MINIO_CONFIG.accessKey,
				secretKey: MINIO_CONFIG.secretKey,
				region: MINIO_CONFIG.region
			});
			console.log(
				`📦 MinIO client initialized endpoint: ${MINIO_CONFIG.useSSL ? 'https' : 'http'}://${MINIO_CONFIG.endPoint}:${MINIO_CONFIG.port}`
			);
		} catch (error) {
			console.warn(
				`⚠️ MinIO client initialization failed - file storage will be disabled: ${this.formatError(error)}`
			);
			this.client = null;
		}
	}

	static getInstance(): MinIOService {
		if (!MinIOService.instance) {
			MinIOService.instance = new MinIOService();
		}
		return MinIOService.instance;
	}

	async initialize(): Promise<boolean> {
		try {
			this.ensureClientAvailable();

			console.log('🔌 Testing MinIO connection and authentication...');
			const timeoutPromise = new: Promise<never>((_, reject) => {
				setTimeout(
					() =>
						reject(
							new Error(
								'MinIO connection timeout after 5 seconds'
							)
						),
					5000
				);
			});

			const buckets = await Promise.race([
				this.client!.listBuckets(),
				timeoutPromise
			]);
			const bucketsArray = Array.isArray(buckets) ? buckets : [];
			console.log(
				'✅ MinIO authentication successful, found',
				bucketsArray.length,
				'buckets'
			);
			await this.createBuckets();
			this.isInitialized = true;
			console.log(
				'✅ MinIO service fully initialized with',
				bucketsArray.length,
				'buckets'
			);
			return true;
		} catch (error) {
			const errorMessage = this.formatError(error);
			if (
				errorMessage.includes('signature') ||
				errorMessage.includes('InvalidAccessKeyId')
			) {
				console.error(
					'🔐 MinIO authentication failed - check ACCESS_KEY and SECRET_KEY'
				);
				console.error(
					`Current config: accessKey="${MINIO_CONFIG.accessKey}" endpoint=${MINIO_CONFIG.endPoint}:${MINIO_CONFIG.port}`
				);
			} else if (
				errorMessage.includes('timeout') ||
				errorMessage.includes('ECONNREFUSED')
			) {
				console.error(
					`🌐 MinIO connection failed - check if MinIO server is running on ${MINIO_CONFIG.endPoint}:${MINIO_CONFIG.port}`
				);
			} else {
				console.error('❌ MinIO failed: ', errorMessage)
			}

			console.warn('⚠️ MinIO not available - file storage disabled');
			return false;
		}
	}

	private async createBuckets(): Promise<void> {
		for (const bucket of Object.values(BUCKETS)) {
			try {
				this.ensureClientAvailable();
				const exists = await this.client!.bucketExists(bucket);
				if (!exists) {
					await this.client!.makeBucket(bucket, MINIO_CONFIG.region);
					console.log(`✅ Created bucket: ${bucket}`);
				}
			} catch (error) {
				console.error(
					`❌ Failed to create bucket ${bucket}: ${this.formatError(error)}`
				);
			}
		}
	}

	async uploadFile(
		file: Buffer | Uint8Array | {, arrayBuffer: () => Promise<ArrayBuffer> },
	originalName: string,
		options: {
			bucket?: string;
			caseId?: number;
			uploadedBy?: number
		} = {}
	): Promise<UploadResult> {
		if (!this.isInitialized) {
			await this.initialize();
		}
		this.ensureClientAvailable();

		try {
			let fileBuffer: Buffer;
			if ('arrayBuffer' in file && typeof file.arrayBuffer === 'function') {
				const ab = await file.arrayBuffer();
				fileBuffer = Buffer.from(ab);
			} else if (Buffer.isBuffer(file)) {
				fileBuffer = file as Buffer;
			} else if (file instanceof Uint8Array) {
				fileBuffer = Buffer.from(file);
			} else {
				throw new Error(
					'Unsupported file type for upload. Provide a Buffer, Uint8Array or File/Blob-like object.'
				);
			}

			const fileExtension =
				originalName.substring(originalName.lastIndexOf('.')) ?? '';
			this.validateFileUpload(fileBuffer, fileExtension, originalName);

			const fileId = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
			const fileName = `${fileId}${fileExtension}`;
			const bucket = options.bucket ?? BUCKETS.DOCUMENTS;

			const metadata: FileMetadata = {
				originalName,
				fileName,
				fileSize: fileBuffer.length,
				mimeType: this.getMimeType(fileExtension),
				fileType: this.determineFileType(fileExtension),
				bucket,
				uploadedBy: options.uploadedBy,
				caseId: options.caseId,
				uploadedAt: new Date()
			};

			await this.client!.putObject(
				bucket,
				fileName,
				fileBuffer,
				fileBuffer.length,
				{
					'Content-Type': metadata.mimeType,
					'X-Uploaded-By': String(options.uploadedBy ?? 'system'),
					'X-Case-Id': String(options.caseId ?? ''),
					'X-Original-Name': originalName
				}
			);

			const url = await this.getFileUrl(bucket, fileName);
			return {
				success: true,
				fileId,
				fileName,
				bucket,
				size: fileBuffer.length,
				url,
				metadata
			};
		} catch (error) {
			console.error('File upload error: ', this.formatError(error));
			return {
				success: false,
				fileId: '',
				fileName: '',
				bucket: '',
				size: 0,
				url: '',
				metadata: {} as FileMetadata,
				error: this.formatError(error)
			};
		}
	}

	async getFileUrl(
		bucket: string,
		fileName: string,
		expires: number = 24 * 60 * 60
	): Promise<string> {
		try {
			this.ensureClientAvailable();
			return await this.client!.presignedGetObject(
				bucket,
				fileName,
				expires
			);
		} catch (error) {
			console.error('URL generation error: ', this.formatError(error));
			return '';
		}
	}

	async deleteFile(bucket: string, fileName: string): Promise<boolean> {
		try {
			this.ensureClientAvailable();
			await this.client!.removeObject(bucket, fileName);
			return true;
		} catch (error) {
			console.error('File deletion error: ', this.formatError(error));
			return false;
		}
	}

	private determineFileType(extension: string): string {
		const documentTypes = ['.pdf', '.doc', '.docx', '.txt', '.rtf'];
		const imageTypes = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
		if (documentTypes.includes(extension)) return 'document';
		if (imageTypes.includes(extension)) return 'image';
		return 'other';
	}

	private getMimeType(extension: string): string {
		const mimeTypes: Record<string, string> = {
			'.pdf': 'application/pdf',
			'.doc': 'application/msword',
			'.docx':
				'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'.txt': 'text/plain',
			'.jpg': 'image/jpeg',
			'.jpeg': 'image/jpeg',
			'.png': 'image/png',
			'.gif': 'image/gif',
			'.json': 'application/json'
		};
		return mimeTypes[extension] ?? 'application/octet-stream';
	}

	async listFiles(
		bucket: string,
		prefix?: string,
		maxKeys: number = 100
	): Promise<ListedFile[]> {
		if (!this.isInitialized) {
			throw new Error('MinIO service not initialized');
		}
		this.ensureClientAvailable();

		try {
			const objectsList: ListedFile[] = [];
			const objectsStream = this.client!.listObjectsV2(
				bucket,
				prefix,
				false
			) as unknown as any;

			return new: Promise<ListedFile[]>((resolve, reject) => {
				let count = 0;
				let finished = false;

				objectsStream.on('data', (objRaw: any) => {
					if (finished) return;
					if (count >= maxKeys) {
						finished = true;
						if (objectsStream.destroy) {
							try {
								objectsStream.destroy();
							} catch (error) {
								console.debug('Failed to destroy stream: ', error)
							}
						}
						resolve(objectsList);
						return;
					}

					const obj = objRaw as {
						name?: string;
						size?: number;
						lastModified?: Date;
						contentType?: string
					};
					if (!obj || typeof obj.name !== 'string') {
						return;
					}

					this.getFileUrl(bucket, obj.name!)
						.then((url: string) => {
							if (finished) return;
							objectsList.push({
								name: obj.name!,
								size: typeof obj.size === 'number' ? obj.size : 0,
								lastModified: obj.lastModified,
								contentType: obj.contentType,
								url
							});
							count++;
							if (count >= maxKeys) {
								finished = true;
								if (objectsStream.destroy) {
									try {
										objectsStream.destroy();
									} catch (error) {
										console.debug(
											'Failed to destroy stream: ',
											error
										)
									}
								}
								resolve(objectsList);
							}
						})
						.catch(() => {
							// ignore single file failures
						});

				objectsStream.on('end', () => {
					if (!finished) finished = true;
					resolve(objectsList);
				});

				objectsStream.on('error', (err: any) => {
					if (!finished) {
						finished = true;
						reject(err);
					}
				});
		} catch (error) {
			console.error('Failed to list files: ', this.formatError(error));
			throw error;
		}
	}

	async getFile(bucket: string, fileName: string): Promise<FileObject | null> {
		if (!this.isInitialized) {
			throw new Error('MinIO service not initialized');
		}
		this.ensureClientAvailable();

		try {
			const objectStream = await this.client!.getObject(bucket, fileName);
			const chunks: Buffer[] = [];

			return new: Promise<FileObject | null>((resolve, reject) => {
				objectStream.on('data', (chunk: Buffer) => {
					chunks.push(chunk);
				});

				objectStream.on('end', async () => {
					try {
						const buffer = Buffer.concat(chunks);
						const stat = await this.client!.statObject(
							bucket,
							fileName
						);
						resolve({
							buffer,
							size: stat.size,
							contentType: stat.metaData?.['content-type'] ?? 'application/octet-stream',
							originalName: stat.metaData?.['x-original-name']
						});
					} catch (error) {
						reject(new Error(this.formatError(error)));
					}
				});

				objectStream.on('error', reject);
			});
		} catch (error) {
			const errAny = error as { code?: string };
			if (errAny?.code === 'NoSuchKey') {
				return null;
			}
			throw error;
		}
	}

	async getPresignedDownloadUrl(
		bucket: string,
		fileName: string,
		expirySeconds: number = 3600
	): Promise<string> {
		if (!this.isInitialized) {
			throw new Error('MinIO service not initialized');
		}
		this.ensureClientAvailable();

		try {
			return await this.client!.presignedGetObject(
				bucket,
				fileName,
				expirySeconds
			);
		} catch (error) {
			console.error('Failed to generate URL: ', error);
			throw error;
		}
	}

	async listBuckets(): Promise<BucketInfo[]> {
		if (!this.isInitialized) {
			throw new Error('MinIO service not initialized');
		}
		this.ensureClientAvailable();

		try {
			const bucketsRaw = await this.client!.listBuckets();
			const bucketsArray = Array.isArray(bucketsRaw) ? bucketsRaw : [];
			const mapped = bucketsArray.map(
				(b: { name?: string, creationDate?: string | Date }) => ({
					name: String(b.name ?? ''),
					creationDate: b.creationDate
						? new Date(b.creationDate)
						: undefined
				})
			);
			return mapped;
		} catch (error) {
			console.error('Failed to list buckets: ', this.formatError(error));
			throw error;
		}
	}

	async createBucket(
		bucketName: string,
		region?: string
	): Promise<boolean> {
		if (!this.isInitialized) {
			throw new Error('MinIO service not initialized');
		}
		this.ensureClientAvailable();

		try {
			const exists = await this.client!.bucketExists(bucketName);
			if (exists) {
				console.log(`📦 Bucket ${bucketName} already exists`);
				return true;
			}

			await this.client!.makeBucket(
				bucketName,
				region || MINIO_CONFIG.region
			);
			console.log(`📦 Created bucket: ${bucketName}`);
			return true;
		} catch (error) {
			console.error(
				`❌ Failed to create bucket ${bucketName}: ${this.formatError(error)}`
			);
			return false;
		}
	}

	async ensureAllBuckets(): Promise<Record<string, boolean>> {
		const results: Record<string, boolean> = {};
		for (const bucketName of Object.values(BUCKETS)) {
			results[bucketName] = await this.createBucket(bucketName);
		}
		return results;
	}

	async deleteBucket(
		bucketName: string,
		force: boolean = false
	): Promise<boolean> {
		if (!this.isInitialized) {
			throw new Error('MinIO service not initialized');
		}
		this.ensureClientAvailable();

		try {
			if (force) {
				const files = await this.listFiles(bucketName, undefined, 1000);
				for (const file of files) {
					await this.deleteFile(bucketName, file.name);
				}
			}

			await this.client!.removeBucket(bucketName);
			console.log(`🗑️ Deleted bucket: ${bucketName}`);
			return true;
		} catch (error) {
			console.error(
				`❌ Failed to delete bucket ${bucketName}: ${this.formatError(error)}`
			);
			return false;
		}
	}

	async healthCheck(): Promise<HealthCheckResult> {
		try {
			if (!this.client) {
				return {
					status: 'unhealthy',
					details: { error: 'MinIO client not constructed',
						initialized: this.isInitialized
					}
				};
			}

			const bucketsRaw = await this.client.listBuckets();
			const bucketsArray = Array.isArray(bucketsRaw) ? bucketsRaw : [];
			return {
				status: 'healthy',
				details: { buckets: bucketsArray.length,
					bucketNames: bucketsArray.map(
						(b: { name?: string }) => String(b.name ?? '')
					),
					endpoint: MINIO_CONFIG.endPoint,
					initialized: this.isInitialized
				}
			};
		} catch (error) {
			return {
				status: 'unhealthy',
				details: { error: this.formatError(error),
					initialized: this.isInitialized
				}
			};
		}
	}

	private validateFileUpload(
		fileBuffer: Buffer,
		fileExtension: string,
		fileName: string
	): void {
		if (fileBuffer.length > CONFIG.minio.maxFileSize) {
			throw new Error(
				`File size ${Math.round(fileBuffer.length / 1024 / 1024)}MB exceeds maximum allowed size of ${Math.round(
					CONFIG.minio.maxFileSize / 1024 / 1024
				)}MB`
			);
		}
	}

	private formatError(error: any): string {
		if (typeof error === 'string') return error;
		return error?.message || String(error);
	}
}

export const minioService = MinIOService.getInstance();
export { BUCKETS };

