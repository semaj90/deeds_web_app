import { db } from '$lib/server/db/client.js';
import { uploadedFiles, type UploadedFile } from '$lib/server/db/schema.js';

export type UploadedFileStorageAdapter = (input: {
	objectKey: string;
	bytes: Uint8Array;
	contentType: string;
}) => Promise<void>;

export type CreateUploadedFileInput = {
	file: File;
	objectKey: string;
	bucket: string;
	storageBackend: 'seaweed' | 'minio';
	upload: UploadedFileStorageAdapter;
	metadata?: Record<string, unknown>;
	bytes?: Uint8Array;
	allowInsertFailure?: boolean;
};

export type CreateUploadedFileResult = {
	file: UploadedFile | null;
	objectKey: string;
	bucket: string;
	storageBackend: 'seaweed' | 'minio';
	contentType: string;
	sizeBytes: number;
};

export async function createUploadedFile(input: CreateUploadedFileInput): Promise<CreateUploadedFileResult> {
	const bytes = input.bytes ?? new Uint8Array(await input.file.arrayBuffer());
	const contentType = input.file.type || 'application/octet-stream';

	await input.upload({
		objectKey: input.objectKey,
		bytes,
		contentType,
	});

	const values = {
		originalName: input.file.name,
		objectKey: input.objectKey,
		bucket: input.bucket,
		mimeType: input.file.type || null,
		sizeBytes: input.file.size,
		status: 'uploaded',
		metadata: {
			...(input.metadata ?? {}),
			storageBackend: input.storageBackend,
		},
	};

	try {
		const [file] = await db.insert(uploadedFiles).values(values).returning();
		return {
			file: file ?? null,
			objectKey: input.objectKey,
			bucket: input.bucket,
			storageBackend: input.storageBackend,
			contentType,
			sizeBytes: input.file.size,
		};
	} catch (err) {
		if (input.allowInsertFailure) {
			console.warn('[upload-file-service] uploaded_files insert failed:', err);
			return {
				file: null,
				objectKey: input.objectKey,
				bucket: input.bucket,
				storageBackend: input.storageBackend,
				contentType,
				sizeBytes: input.file.size,
			};
		}

		throw err;
	}
}
