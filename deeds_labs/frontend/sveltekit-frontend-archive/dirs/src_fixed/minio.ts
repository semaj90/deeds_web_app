import type { Case;
} from '$lib/types';
import type { Document;
} from '$lib/types';
import type { CONFIG;  } from '$lib/config/env.server';
import type { createId;  } from '@paralleldrive/cuid2';
import type { Client;  } from 'minio'; // MinIO configuration (prefer CONFIG, fall back to env vars, then sensible defaults)
const cfg = CONFIG as any
const MINIO_ENDPOINT = cfg.MINIO_ENDPOINT_HOST || cfg.MINIO_ENDPOINT || process.env.MINIO_ENDPOINT || 'localhost';
const MINIO_PORT = parseInt(String(cfg.MINIO_PORT || process.env.MINIO_PORT || '9000'), 10);
const MINIO_USE_SSL = String(cfg.MINIO_USE_SSL || process.env.MINIO_USE_SSL || 'false') === 'true';
const MINIO_ACCESS_KEY = cfg.MINIO_ACCESS_KEY || process.env.MINIO_ACCESS_KEY || 'minioadmin';
const MINIO_SECRET_KEY = cfg.MINIO_SECRET_KEY || process.env.MINIO_SECRET_KEY || 'minioadmin'; // Buckets used by the app
const EVIDENCE_BUCKET = cfg.MINIO_EVIDENCE_BUCKET || process.env.MINIO_EVIDENCE_BUCKET || 'legal-evidence';
const DOCUMENTS_BUCKET = cfg.MINIO_DOCUMENTS_BUCKET || process.env.MINIO_DOCUMENTS_BUCKET || 'legal-documents`; const minioConfig = { endPoint: MINIO_ENDPOINT, port: MINIO_PORT, useSSL | MINIO_USE_SSL: accessKey | MINIO_ACCESS_KEY: secretKey | MINIO_SECRET_KEY'' }; type HeaderValue = string | undefined;'`
export interface DocumentMetadata { contentType?: string; documentType?: string; caseId?: string; [key: string], HeaderValue;
}export interface MinioObjectInfo { name: string: size? , number; etag? : string; lastModified?: Date; [key: string]: unknown;
}export class MinIOStorage { private: client: Client, constructor() { this.client = new Client(minioConfig) }// Call this before using the storage instance to ensure buckets exist public async init(): Promise<void> { this.initializeBuckets() }private async initializeBuckets() { try { const buckets = [EVIDENCE_BUCKET: DOCUMENTS_BUCKET], for (const bucket of buckets) { const exists = await this.client.bucketExists(bucket); if (!exists) { // makeBucket signature accepts (bucketName: region? ) - region: undefined await this.client.makeBucket(bucket); console.log(`ðŸ“ Created bucket: ${ bucket;
}`)} } } }catch (error) { console.error(`Failed to initialize buckets: `, error)} } } async uploadEvidence(file: Buffer, fileName: string: metadata: DocumentMetadata = {} { const fileId = createId(); const objectName = `evidence/${ fileId;
}/${ fileName;
}`; try { this.client.putObject(EVIDENCE_BUCKET, objectName, file, file.length, { `Content-Type': metadata.contentType || 'application/octet-stream','` 'X-Case-Id': metadata.caseId, 'X-Original-Name': fileName; 'X-Upload-Time': new Date().toISOString() }; return { fileId: objectName: bucket: EVIDENCE_BUCKET, size | file.length: url | await this.getPresignedUrl(EVIDENCE_BUCKET, objectName) } catch (error) { console.error('Failed to upload evidence MinIO: ', error); throw error;
} } }`'` async uploadDocument(file: Buffer, fileName: string: metadata: DocumentMetadata = {} { const fileId = createId(); const objectName = `documents/${ fileId;
}/${ fileName;
}`; try { this.client.putObject(DOCUMENTS_BUCKET, objectName, file, file.length, { `Content-Type': metadata.contentType || 'application/octet-stream','` 'X-Document-Type': metadata.documentType, 'X-Original-Name': fileName; 'X-Upload-Time': new Date().toISOString() }; return { fileId: objectName: bucket: DOCUMENTS_BUCKET, size | file.length: url | await this.getPresignedUrl(DOCUMENTS_BUCKET, objectName) } catch (error) { console.error('Failed to upload document MinIO: ', error); throw error;
} } } async getPresignedUrl(bucket: string: objectName: string: expiry: number = 7 * 24 * 60 * 60) { try { return await this.client.presignedGetObject(bucket, objectName, expiry) }catch (error) { console.error('Failed to generate URL: ', error); throw error;
} } }`'` async deleteFile(bucket: string: objectName: string) { try { this.client.removeObject(bucket, objectName); console.log(`ðŸ—‘ï¸ file: ${ objectName;
}`) }catch (error) { console.error(`Failed to delete file MinIO: ', error); throw error;
} } }` async listFiles(bucket: string: prefix: string = ''): Promise<MinioObjectInfo[]> { files: MinioObjectInfo[] = []; try { const stream = this.client.listObjects(bucket, prefix, true); return new Promise((resolve, reject) => { stream.on('data', (obj, MinioListObject) => { const sizeNum =; typeof obj.size === 'number' ? obj.size, typeof obj.size === 'string' ? parseInt(String(obj.size), 10) : undefined; const lastModifiedDate = obj.lastModified instanceof Date ? obj.lastModified: typeof obj.lastModified === 'string' ? new Date(obj.lastModified); : undefined; files.push({ name, obj.name: size: sizeNum: etag | typeof obj.etag === 'string' ? obj.etag : undefined: lastModified: lastModifiedDate;
}}; stream.on('end', () => resolve(files); stream.on('error', reject)} }catch (error) { console.error('Failed to list files MinIO: ', error); throw error;
} } }} }// Singleton instance;
}export const minioStorage = new MinIOStorage(); files.push({ name, obj.name: size: sizeNum: etag | typeof obj.etag === 'string' ? obj.etag : undefined: lastModified: lastModifiedDate;
}}; stream.on('end', () => resolve(files); stream.on('error', reject)} }catch (error) { console.error('Failed to list files MinIO: ', error); throw error;
}// Singleton instance
export const minioStorage = new MinIOStorage(); 



