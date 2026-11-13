export type LibraryUploadMimeTypeV1 = 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp';

const LIBRARY_UPLOAD_EXTENSIONS_V1: Record<LibraryUploadMimeTypeV1, string> = {
	'application/pdf': '.pdf',
	'image/jpeg': '.jpg',
	'image/png': '.png',
	'image/webp': '.webp',
};

export function isSupportedLibraryUploadMimeTypeV1(value: string): value is LibraryUploadMimeTypeV1 {
	return Object.hasOwn(LIBRARY_UPLOAD_EXTENSIONS_V1, value.toLowerCase());
}

export function libraryUploadExtensionV1(mimeType: LibraryUploadMimeTypeV1): string {
	return LIBRARY_UPLOAD_EXTENSIONS_V1[mimeType];
}

export function validateLibraryUploadSignatureV1(mimeType: LibraryUploadMimeTypeV1, prefix: Buffer): boolean {
	switch (mimeType) {
		case 'application/pdf': return prefix.subarray(0, 5).equals(Buffer.from('%PDF-'));
		case 'image/jpeg': return prefix[0] === 0xff && prefix[1] === 0xd8 && prefix[2] === 0xff;
		case 'image/png': return prefix.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
		case 'image/webp': return prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP';
	}
}

/** OCR's PDF branch is extension-based; preserve a real .pdf suffix at this boundary. */
export function libraryOcrInputNameV1(documentId: string, mimeType: LibraryUploadMimeTypeV1): string {
	return `${documentId}${libraryUploadExtensionV1(mimeType)}`;
}
