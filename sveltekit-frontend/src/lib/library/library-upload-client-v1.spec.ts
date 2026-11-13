import { describe, expect, it } from 'vitest';
import { encodeLibraryUploadMetadataHeaderV1, resolveLibraryUploadMimeV1 } from './library-upload-client-v1.js';

describe('library upload browser format selection v1', () => {
	it.each([
		[{ name: 'record.pdf', type: 'application/pdf' }, 'application/pdf'],
		[{ name: 'photo.jpg', type: '' }, 'image/jpeg'],
		[{ name: 'scan.png', type: 'application/octet-stream' }, 'image/png'],
		[{ name: 'photo.webp', type: 'image/webp' }, 'image/webp'],
		[{ name: 'photo.jpeg', type: 'image/jpg' }, 'image/jpeg'],
	] as const)('selects a supported transport MIME for %j', (file, expected) => {
		expect(resolveLibraryUploadMimeV1(file)).toBe(expected);
	});

	it('rejects a filename and MIME outside the admitted formats', () => {
		expect(resolveLibraryUploadMimeV1({ name: 'payload.exe', type: 'application/octet-stream' })).toBeNull();
	});

	it('encodes Unicode metadata into a URL-safe header value', () => {
		const encoded = encodeLibraryUploadMetadataHeaderV1({ title: 'Déclaration № 3', caseId: 'case-id' });
		const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - encoded.length % 4) % 4);
		expect(JSON.parse(Buffer.from(normalized, 'base64').toString('utf8'))).toEqual({ title: 'Déclaration № 3', caseId: 'case-id' });
		expect(encoded).not.toMatch(/[+/=]/);
	});
});
