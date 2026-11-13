export interface LibraryUploadMetadataV1 {
	title: string;
	corpusType?: string;
	jurisdiction?: string;
	officialUrl?: string;
	effectiveDate?: string;
	caseId?: string;
}

const MIME_BY_EXTENSION: Record<string, string> = {
	pdf: 'application/pdf',
	jpg: 'image/jpeg',
	jpeg: 'image/jpeg',
	png: 'image/png',
	webp: 'image/webp',
};
const SUPPORTED_MIME_TYPES = new Set(Object.values(MIME_BY_EXTENSION));

export function resolveLibraryUploadMimeV1(file: Pick<File, 'name' | 'type'>): string | null {
	const declared = file.type.toLowerCase().split(';', 1)[0]?.trim() ?? '';
	const normalized = declared === 'image/jpg' ? 'image/jpeg' : declared;
	if (SUPPORTED_MIME_TYPES.has(normalized)) return normalized;
	const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
	return MIME_BY_EXTENSION[extension] ?? null;
}

export function encodeLibraryUploadMetadataHeaderV1(metadata: LibraryUploadMetadataV1): string {
	const bytes = new TextEncoder().encode(JSON.stringify(metadata));
	let binary = '';
	for (let offset = 0; offset < bytes.length; offset += 0x8000) {
		binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
	}
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

/** Sends the File as the request body so SvelteKit can use its bounded raw-stream path. */
export function uploadLibraryFileV1(
	file: File,
	metadata: LibraryUploadMetadataV1,
	signal?: AbortSignal,
): Promise<Response> {
	const mimeType = resolveLibraryUploadMimeV1(file);
	if (!mimeType) throw new Error('Unsupported file type. Use PDF, JPEG, PNG, or WebP.');
	if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error('Empty files are not accepted.');
	if (file.size > 200 * 1024 * 1024) throw new Error('File too large (200 MB max).');

	return fetch('/api/library/upload', {
		method: 'POST',
		headers: {
			'content-type': mimeType,
			'x-library-byte-length': String(file.size),
			'x-library-metadata': encodeLibraryUploadMetadataHeaderV1(metadata),
			'x-file-name': encodeURIComponent(file.name),
		},
		body: file,
		signal,
	});
}
