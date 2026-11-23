/**
 * Content-addressed writer for SAM 2 silhouette masks (derivative artifacts only).
 *
 * - Key: `derived/sam2/<sha256>.png` in the artifacts bucket supplied by the caller. Never the
 *   evidence bucket, so original evidence bytes cannot be touched through this path.
 * - Idempotent: identical bytes map to the same key and are not re-uploaded.
 * - Fail-closed: a key that already holds different bytes is a collision and throws; objects are
 *   never overwritten; the stored length is read back after every write.
 * - Storage is an injected port. Nothing here talks to SeaweedFS directly.
 */
import { createHash } from 'node:crypto';
import type { Sam2MaskWriterV1 } from './sam2-silhouette-adapter-v1.js';

export const SAM2_MASK_KEY_PREFIX_V1 = 'derived/sam2/' as const;

export type Sam2MaskStoragePortV1 = {
	/** Returns the stored length, or null when the object does not exist. */
	head(input: { bucket: string; objectKey: string }): Promise<{ contentLength: number } | null>;
	put(input: {
		bucket: string;
		objectKey: string;
		bytes: Uint8Array;
		contentType: string;
		metadata: Record<string, string>;
	}): Promise<{ etag: string | null }>;
};

export function sam2MaskObjectKeyV1(maskSha256: string): string {
	if (!/^[a-f0-9]{64}$/.test(maskSha256)) throw new Error('SAM2_MASK_SHA256_INVALID');
	return `${SAM2_MASK_KEY_PREFIX_V1}${maskSha256}.png`;
}

export function createSam2MaskWriterV1(options: { bucket: string; storage: Sam2MaskStoragePortV1 }): Sam2MaskWriterV1 {
	if (!options.bucket) throw new Error('SAM2_MASK_BUCKET_REQUIRED');
	return async ({ maskPng, maskSha256 }) => {
		const actual = createHash('sha256').update(maskPng).digest('hex');
		if (actual !== maskSha256) throw new Error('SAM2_MASK_HASH_MISMATCH');
		const objectKey = sam2MaskObjectKeyV1(maskSha256);
		const existing = await options.storage.head({ bucket: options.bucket, objectKey });
		if (existing) {
			if (existing.contentLength !== maskPng.byteLength) throw new Error('SAM2_MASK_KEY_COLLISION');
			return { maskObjectKey: objectKey };
		}
		await options.storage.put({
			bucket: options.bucket,
			objectKey,
			bytes: maskPng,
			contentType: 'image/png',
			metadata: { artifactKind: 'sam2_alpha_silhouette', canonicalAuthority: 'false', is3DReconstruction: 'false' },
		});
		const readback = await options.storage.head({ bucket: options.bucket, objectKey });
		if (!readback || readback.contentLength !== maskPng.byteLength) throw new Error('SAM2_MASK_READBACK_MISMATCH');
		return { maskObjectKey: objectKey };
	};
}
