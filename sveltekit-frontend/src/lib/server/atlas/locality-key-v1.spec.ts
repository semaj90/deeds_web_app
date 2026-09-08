import { describe, expect, it } from 'vitest';
import { hilbertIndexND } from './tensors/tetris-6d-hilbert-step1.js';
import { hammingDistance1Bit, hammingSimilarity1Bit } from '../search/mla-kv-compress.js';
import {
	bytesToHammingSig,
	compareAtlasHammingSigV1,
	computeAtlasHilbertKeyV1,
	createAtlasLocalityKeyV1,
	hammingPrefilterCandidatesV1,
	hammingSigToBytes,
} from './locality-key-v1.js';

describe('AtlasLocalityKeyV1 — Hilbert reuse (no duplicate implementation)', () => {
	it('computeAtlasHilbertKeyV1 returns EXACTLY what hilbertIndexND returns for the same input', () => {
		const point = [3, 7, 12, 1];
		const bitsPerAxis = 8;
		const direct = hilbertIndexND(point, bitsPerAxis);
		const viaWrapper = computeAtlasHilbertKeyV1(point, bitsPerAxis);
		expect(viaWrapper).toBe(direct);
		expect(typeof viaWrapper).toBe('bigint');
	});
});

describe('AtlasLocalityKeyV1 — Hamming reuse (no duplicate popcount implementation)', () => {
	it('compareAtlasHammingSigV1 delegates to hammingDistance1Bit/hammingSimilarity1Bit exactly', () => {
		const a = bytesToHammingSig(new Uint8Array([0b1010_1010, 0b0000_1111]));
		const b = bytesToHammingSig(new Uint8Array([0b1010_1000, 0b1111_1111]));
		const result = compareAtlasHammingSigV1(a, b);
		const expectedDistance = hammingDistance1Bit(hammingSigToBytes(a), hammingSigToBytes(b));
		const expectedSimilarity = hammingSimilarity1Bit(hammingSigToBytes(a), hammingSigToBytes(b));
		expect(result.distance).toBe(expectedDistance);
		expect(result.similarity).toBe(expectedSimilarity);
	});

	it('hex <-> bytes round-trips exactly', () => {
		const bytes = new Uint8Array([0x00, 0xff, 0x1a, 0x2b]);
		const hex = bytesToHammingSig(bytes);
		expect(hex).toBe('00ff1a2b');
		expect(Array.from(hammingSigToBytes(hex))).toEqual(Array.from(bytes));
	});
});

describe('AtlasLocalityKeyV1 contract', () => {
	it('constructs a valid locality key with all fields', () => {
		const key = createAtlasLocalityKeyV1({
			domainId: 3,
			lod: 2,
			residency: 'WARM',
			clusterId: 42,
			somCell: 1000,
			hilbertKey: computeAtlasHilbertKeyV1([1, 2, 3], 8),
			hammingSig: bytesToHammingSig(new Uint8Array([1, 2])),
			packetOrdinal: 99,
		});
		expect(key.schema).toBe('atlas.locality-key.v1');
		expect(key.somCell).toBe(1000);
		expect(key.packetOrdinal).toBe(99);
	});

	it('rejects an out-of-range somCell (must fit uint16, matching PacketGlyphV1 convention)', () => {
		expect(() =>
			createAtlasLocalityKeyV1({
				domainId: 0,
				lod: 0,
				residency: 'ABSENT',
				clusterId: 0,
				somCell: 70000,
				hilbertKey: 0n,
				hammingSig: '',
				packetOrdinal: 0,
			}),
		).toThrow();
	});

	it('rejects a non-hex hammingSig', () => {
		expect(() =>
			createAtlasLocalityKeyV1({
				domainId: 0,
				lod: 0,
				residency: 'ABSENT',
				clusterId: 0,
				somCell: 0,
				hilbertKey: 0n,
				hammingSig: 'not-hex!',
				packetOrdinal: 0,
			}),
		).toThrow();
	});
});

describe('AtlasLocalityKeyV1 — Hamming pre-filter is a radius cut, not a ranked result', () => {
	it('returns only candidates within maxDistance, in original order (no re-ranking)', () => {
		const query = bytesToHammingSig(new Uint8Array([0b1111_1111]));
		const candidates = [
			{ id: 'far', hammingSig: bytesToHammingSig(new Uint8Array([0b0000_0000])) }, // distance 8
			{ id: 'near', hammingSig: bytesToHammingSig(new Uint8Array([0b1111_1110])) }, // distance 1
			{ id: 'exact', hammingSig: query }, // distance 0
		];
		const filtered = hammingPrefilterCandidatesV1(candidates, query, 1);
		expect(filtered.map((c) => c.id)).toEqual(['near', 'exact']);
	});
});
