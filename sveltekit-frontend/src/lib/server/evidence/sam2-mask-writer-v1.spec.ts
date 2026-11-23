import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createSam2MaskWriterV1, sam2MaskObjectKeyV1, type Sam2MaskStoragePortV1 } from './sam2-mask-writer-v1.js';

const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);
const sha = createHash('sha256').update(png).digest('hex');
const BUCKET = 'atlas-artifacts';

function memoryStorage(options: { dropOnPut?: boolean; corruptLength?: boolean } = {}) {
	const objects = new Map<string, { bytes: Uint8Array; metadata: Record<string, string> }>();
	const puts: string[] = [];
	const storage: Sam2MaskStoragePortV1 = {
		async head({ bucket, objectKey }) {
			if (bucket !== BUCKET) throw new Error('WRONG_BUCKET');
			const hit = objects.get(objectKey);
			if (!hit) return null;
			return { contentLength: options.corruptLength ? hit.bytes.byteLength + 1 : hit.bytes.byteLength };
		},
		async put({ bucket, objectKey, bytes, metadata }) {
			if (bucket !== BUCKET) throw new Error('WRONG_BUCKET');
			puts.push(objectKey);
			if (!options.dropOnPut) objects.set(objectKey, { bytes, metadata });
			return { etag: 'e' };
		},
	};
	return { storage, objects, puts };
}

describe('sam2 mask writer v1', () => {
	it('writes a new mask under the derived key with artifact metadata and returns that key', async () => {
		const { storage, objects, puts } = memoryStorage();
		const writer = createSam2MaskWriterV1({ bucket: BUCKET, storage });
		const { maskObjectKey } = await writer({ maskPng: png, maskSha256: sha, targetBoxIndex: 0 });
		expect(maskObjectKey).toBe(`derived/sam2/${sha}.png`);
		expect(puts).toEqual([maskObjectKey]);
		expect(objects.get(maskObjectKey)?.metadata).toMatchObject({ canonicalAuthority: 'false', is3DReconstruction: 'false' });
	});

	it('is idempotent: identical bytes are not re-uploaded', async () => {
		const { storage, puts } = memoryStorage();
		const writer = createSam2MaskWriterV1({ bucket: BUCKET, storage });
		await writer({ maskPng: png, maskSha256: sha, targetBoxIndex: 0 });
		const second = await writer({ maskPng: png, maskSha256: sha, targetBoxIndex: 1 });
		expect(second.maskObjectKey).toBe(`derived/sam2/${sha}.png`);
		expect(puts).toHaveLength(1);
	});

	it('rejects bytes whose SHA-256 does not match the declared hash', async () => {
		const { storage, puts } = memoryStorage();
		const writer = createSam2MaskWriterV1({ bucket: BUCKET, storage });
		await expect(writer({ maskPng: png, maskSha256: 'a'.repeat(64), targetBoxIndex: 0 })).rejects.toThrow('SAM2_MASK_HASH_MISMATCH');
		expect(puts).toHaveLength(0);
	});

	it('fails closed when an existing key holds a different length (collision)', async () => {
		const { storage, objects } = memoryStorage();
		objects.set(`derived/sam2/${sha}.png`, { bytes: new Uint8Array(png.byteLength + 5), metadata: {} });
		const writer = createSam2MaskWriterV1({ bucket: BUCKET, storage });
		await expect(writer({ maskPng: png, maskSha256: sha, targetBoxIndex: 0 })).rejects.toThrow('SAM2_MASK_KEY_COLLISION');
	});

	it('fails when the readback does not show the stored object', async () => {
		const { storage } = memoryStorage({ dropOnPut: true });
		const writer = createSam2MaskWriterV1({ bucket: BUCKET, storage });
		await expect(writer({ maskPng: png, maskSha256: sha, targetBoxIndex: 0 })).rejects.toThrow('SAM2_MASK_READBACK_MISMATCH');
	});

	it('fails when the readback length differs from the written bytes', async () => {
		const { storage } = memoryStorage({ corruptLength: true });
		const writer = createSam2MaskWriterV1({ bucket: BUCKET, storage });
		await expect(writer({ maskPng: png, maskSha256: sha, targetBoxIndex: 0 })).rejects.toThrow();
	});

	it('refuses an empty bucket and malformed hashes', () => {
		const { storage } = memoryStorage();
		expect(() => createSam2MaskWriterV1({ bucket: '', storage })).toThrow('SAM2_MASK_BUCKET_REQUIRED');
		expect(() => sam2MaskObjectKeyV1('not-a-hash')).toThrow('SAM2_MASK_SHA256_INVALID');
	});
});
