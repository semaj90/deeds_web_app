// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { anchorRowValues, markerAnchorSchema } from './marker-anchor-v1.js';

describe('markerAnchorSchema', () => {
	it('accepts an image UV in [0, 1]', () => {
		expect(markerAnchorSchema.parse({ kind: 'IMAGE_UV', u: 0.25, v: 1 })).toEqual({ kind: 'IMAGE_UV', u: 0.25, v: 1 });
	});

	it('rejects an image UV outside [0, 1]', () => {
		expect(() => markerAnchorSchema.parse({ kind: 'IMAGE_UV', u: 1.2, v: 0.5 })).toThrow();
		expect(() => markerAnchorSchema.parse({ kind: 'IMAGE_UV', u: 0.5, v: -0.1 })).toThrow();
	});

	it('accepts a mesh anchor whose barycentric weights sum to 1', () => {
		expect(markerAnchorSchema.parse({ kind: 'MESH_SURFACE', meshId: 'mesh-1', triangleIndex: 3, barycentric: [0.5, 0.25, 0.25] })).toMatchObject({ triangleIndex: 3 });
	});

	it('rejects barycentric weights that do not sum to 1', () => {
		expect(() => markerAnchorSchema.parse({ kind: 'MESH_SURFACE', meshId: 'mesh-1', triangleIndex: 0, barycentric: [0.5, 0.5, 0.5] })).toThrow(/sum to 1/);
	});

	it('rejects a negative triangle index and unknown keys', () => {
		expect(() => markerAnchorSchema.parse({ kind: 'MESH_SURFACE', meshId: 'm', triangleIndex: -1, barycentric: [1, 0, 0] })).toThrow();
		expect(() => markerAnchorSchema.parse({ kind: 'IMAGE_UV', u: 0.5, v: 0.5, status: 'REVIEWED' })).toThrow();
	});

	it('does not accept a client-supplied review status through the anchor', () => {
		expect(() => markerAnchorSchema.parse({ kind: 'IMAGE_UV', u: 0.5, v: 0.5, anchorStatus: 'REVIEWED' })).toThrow();
	});
});

describe('anchorRowValues', () => {
	it('returns positional-only values when no anchor is given', () => {
		expect(anchorRowValues(null)).toMatchObject({ anchorKind: null, anchorU: null, meshId: null, anchorStatus: 'DRAFT' });
	});

	it('maps an image anchor to IMAGE_UV columns, always DRAFT', () => {
		expect(anchorRowValues({ kind: 'IMAGE_UV', u: 0.1, v: 0.9 })).toMatchObject({ anchorKind: 'IMAGE_UV', anchorU: 0.1, anchorV: 0.9, anchorStatus: 'DRAFT' });
	});

	it('maps a mesh anchor to MESH_SURFACE columns, always DRAFT', () => {
		expect(anchorRowValues({ kind: 'MESH_SURFACE', meshId: 'm', triangleIndex: 2, barycentric: [1, 0, 0] })).toMatchObject({
			anchorKind: 'MESH_SURFACE',
			meshId: 'm',
			triangleIndex: 2,
			barycentric: [1, 0, 0],
			anchorStatus: 'DRAFT',
		});
	});
});
