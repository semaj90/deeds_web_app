import { describe, expect, it } from 'vitest';
import {
	isSupportedLibraryUploadMimeTypeV1,
	libraryOcrInputNameV1,
	validateLibraryUploadSignatureV1,
	type LibraryUploadMimeTypeV1,
} from './library-upload-format-v1.js';

describe('library upload format v1', () => {
	it.each([
		['application/pdf', Buffer.from('%PDF-1.7')],
		['image/jpeg', Buffer.from([0xff, 0xd8, 0xff, 0x00])],
		['image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
		['image/webp', Buffer.from('RIFF\x04\x00\x00\x00WEBP')],
	] as Array<[LibraryUploadMimeTypeV1, Buffer]>)('accepts a matching %s signature', (mimeType, bytes) => {
		expect(isSupportedLibraryUploadMimeTypeV1(mimeType)).toBe(true);
		expect(validateLibraryUploadSignatureV1(mimeType, bytes)).toBe(true);
	});

	it.each([
		['application/pdf', Buffer.from('<html>')],
		['image/jpeg', Buffer.from('%PDF-')],
		['image/png', Buffer.from([0x00, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])],
		['image/webp', Buffer.from('RIFFxxxxNOPE')],
	] as Array<[LibraryUploadMimeTypeV1, Buffer]>)('rejects a mismatched %s signature', (mimeType, bytes) => {
		expect(validateLibraryUploadSignatureV1(mimeType, bytes)).toBe(false);
	});

	it('rejects unsupported types and preserves the PDF extension for the OCR adapter', () => {
		expect(isSupportedLibraryUploadMimeTypeV1('application/octet-stream')).toBe(false);
		expect(isSupportedLibraryUploadMimeTypeV1('IMAGE/PNG')).toBe(true);
		expect(libraryOcrInputNameV1('doc-1', 'application/pdf')).toBe('doc-1.pdf');
		expect(libraryOcrInputNameV1('doc-1', 'image/jpeg')).toBe('doc-1.jpg');
	});
});
