import { z } from 'zod';
import { INDEXED_PALETTE_TEXTURE_REVISION_V1, type IndexedTexture4BppV1 } from './indexed-palette-texture-v1.js';

export const scenePaletteArtifactSchemaV1 = z.object({
	schema: z.literal(INDEXED_PALETTE_TEXTURE_REVISION_V1),
	width: z.number().int().min(1).max(256),
	height: z.number().int().min(1).max(256),
	byteLength: z.number().int().min(1).max(256 * 256 / 2),
	sha256: z.string().regex(/^sha256:[a-f0-9]{64}$/),
}).strict().refine((entry) => entry.byteLength === Math.ceil(entry.width * entry.height / 2));

export interface ScenePalettePreviewV1 {
	url: string;
	sourceRevision: string;
	artifact: z.infer<typeof scenePaletteArtifactSchemaV1>;
}

export async function fetchScenePalettePreviewV1(
	preview: ScenePalettePreviewV1,
	signal: AbortSignal,
): Promise<IndexedTexture4BppV1> {
	const artifact = scenePaletteArtifactSchemaV1.parse(preview.artifact);
	const response = await fetch(preview.url, { credentials: 'same-origin', cache: 'no-store', signal });
	if (!response.ok || !response.body) throw new Error('Palette texture is unavailable.');

	const packedIndices = new Uint8Array(artifact.byteLength);
	const reader = response.body.getReader();
	let offset = 0;
	try {
		for (let part = await reader.read(); !part.done; part = await reader.read()) {
			if (part.value.byteLength > packedIndices.length - offset) {
				await reader.cancel().catch(() => {});
				throw new Error('Palette texture exceeded its recorded length.');
			}
			packedIndices.set(part.value, offset);
			offset += part.value.byteLength;
		}
	} finally {
		reader.releaseLock();
	}
	if (offset !== packedIndices.length) throw new Error('Palette texture was truncated.');
	const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', packedIndices));
	const hex = Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join('');
	if (`sha256:${hex}` !== artifact.sha256) throw new Error('Palette texture failed digest verification.');
	return {
		format: artifact.schema, paletteRevision: artifact.schema,
		width: artifact.width, height: artifact.height, pixelCount: artifact.width * artifact.height, packedIndices,
	};
}
