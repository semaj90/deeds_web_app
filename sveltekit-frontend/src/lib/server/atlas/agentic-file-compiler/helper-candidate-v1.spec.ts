import { describe, expect, it } from 'vitest';
import { assertHelperCandidateV1, buildHelperCandidateV1, dedupeHelperCandidatesByLane } from './helper-candidate-v1.js';

describe('buildHelperCandidateV1', () => {
	it('derives CANONICAL_ID when canonicalId is present', () => {
		const candidate = buildHelperCandidateV1({ lane: 'semantic', canonicalId: 'atlas:pkt:1', sourceRef: 'src/a.ts' });
		expect(candidate.identityResolution).toBe('CANONICAL_ID');
	});

	it('falls back through packetKey then sourceRef then UNRESOLVED', () => {
		expect(buildHelperCandidateV1({ lane: 'semantic', packetKey: 'packet:1' }).identityResolution).toBe('PACKET_KEY');
		expect(buildHelperCandidateV1({ lane: 'semantic', sourceRef: 'src/a.ts' }).identityResolution).toBe('SOURCE_REF');
		expect(buildHelperCandidateV1({ lane: 'semantic' }).identityResolution).toBe('UNRESOLVED');
	});

	it('round-trips and detects a tampered identityResolution', () => {
		const candidate = buildHelperCandidateV1({ lane: 'semantic', sourceRef: 'src/a.ts' });
		expect(assertHelperCandidateV1(candidate)).toEqual(candidate);
		expect(() => assertHelperCandidateV1({ ...candidate, identityResolution: 'CANONICAL_ID' } as typeof candidate)).toThrow(/CHECKSUM_MISMATCH/);
	});
});

describe('dedupeHelperCandidatesByLane', () => {
	it('collapses multiple executors under one lane to one vote per identity', () => {
		const qdrant = buildHelperCandidateV1({ lane: 'semantic', canonicalId: 'atlas:pkt:1' });
		const cagra = buildHelperCandidateV1({ lane: 'semantic', canonicalId: 'atlas:pkt:1' });
		const distinct = buildHelperCandidateV1({ lane: 'semantic', canonicalId: 'atlas:pkt:2' });
		const otherLane = buildHelperCandidateV1({ lane: 'lexical', canonicalId: 'atlas:pkt:1' });
		const deduped = dedupeHelperCandidatesByLane([qdrant, cagra, distinct, otherLane]);
		expect(deduped).toHaveLength(3);
		expect(deduped.filter((c) => c.lane === 'semantic')).toHaveLength(2);
		expect(deduped.filter((c) => c.lane === 'lexical')).toHaveLength(1);
	});

	it('keeps UNRESOLVED candidates from different lanes separate (identity never inferred across lanes)', () => {
		const a = buildHelperCandidateV1({ lane: 'graph' });
		const b = buildHelperCandidateV1({ lane: 'ast' });
		expect(dedupeHelperCandidatesByLane([a, b])).toHaveLength(2);
	});

	it('collapses two structurally identical UNRESOLVED candidates from the same lane (they carry no distinguishing evidence)', () => {
		const a = buildHelperCandidateV1({ lane: 'graph' });
		const b = buildHelperCandidateV1({ lane: 'graph' });
		expect(dedupeHelperCandidatesByLane([a, b])).toHaveLength(1);
	});
});
