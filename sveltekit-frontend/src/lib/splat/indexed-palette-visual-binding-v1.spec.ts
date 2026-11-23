import { describe, expect, it, vi } from 'vitest';
import {
	fetchIndexedPaletteVisualBindingV1,
	indexedPaletteVisualBindingV1Schema,
} from './indexed-palette-visual-binding-v1.js';

const digest = `sha256:${'a'.repeat(64)}`;
const binding = {
	schema: 'atlas.indexed-palette-visual-binding.v1',
	caseId: 'case-a',
	sceneId: 'scene-a',
	sceneRevision: 3,
	objectId: 'floor-01',
	sourceRevision: digest,
	paletteAssetId: 'palette-01',
	paletteUrl: '/api/scene-assets/palette-01/bytes',
	paletteArtifact: {
		schema: 'atlas-indexed-palette16-v1',
		width: 4,
		height: 4,
		byteLength: 8,
		sha256: digest,
	},
	coordinateSpace: 'NORMALIZED_UV',
	uvAffine: [1, 0, 0.25, 0, 1, 0],
	canonicalAuthority: false,
	writesPerformed: false,
} as const;

describe('indexed palette visual binding v1', () => {
	it('accepts a scoped visual-only binding', () => {
		expect(indexedPaletteVisualBindingV1Schema.parse(binding)).toMatchObject({
			objectId: 'floor-01',
			coordinateSpace: 'NORMALIZED_UV',
			canonicalAuthority: false,
		});
	});

	it('rejects external URLs, unsupported transforms, and candidate bitsets in the visual binding', () => {
		expect(() => indexedPaletteVisualBindingV1Schema.parse({ ...binding, paletteUrl: 'https://other.test/a' })).toThrow();
		expect(() => indexedPaletteVisualBindingV1Schema.parse({ ...binding, uvAffine: [1, 0] })).toThrow();
		expect(() => indexedPaletteVisualBindingV1Schema.parse({ ...binding, candidateBitset: '0xff' })).toThrow();
	});

	it('rejects a stale case/scene/object/source scope before fetching bytes', async () => {
		const fetchSpy = vi.spyOn(globalThis, 'fetch');
		await expect(fetchIndexedPaletteVisualBindingV1(binding, {
			caseId: 'case-b', sceneId: 'scene-a', sceneRevision: 3, objectId: 'floor-01', sourceRevision: digest,
		}, new AbortController().signal)).rejects.toThrow('PALETTE_VISUAL_BINDING_SCOPE_MISMATCH:caseId');
		expect(fetchSpy).not.toHaveBeenCalled();
		fetchSpy.mockRestore();
	});
});
