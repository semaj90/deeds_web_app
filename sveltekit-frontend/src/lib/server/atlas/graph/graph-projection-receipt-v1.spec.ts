import { describe, expect, it } from 'vitest';
import { GraphProjectionReceiptV1Schema } from './graph-projection-receipt-v1.js';

const receipt = () => ({
	schema: 'atlas.graph-projection-receipt.v1',
	workspaceRevision: `sha256:${'a'.repeat(64)}`,
	graphRevision: `sha256:${'b'.repeat(64)}`,
	projectionRevision: `sha256:${'c'.repeat(64)}`,
	producerRevision: 'graph-fanout-proof-v1',
	projectionHash: 'd'.repeat(64),
	nodeTableHash: 'e'.repeat(64),
	edgeTableHash: 'f'.repeat(64),
	entityCount: 1,
	relationCount: 1,
	edgeCount: 1,
	rowCounts: { sourceRef: 1, packetKey: 1, featureId: 1, communityId: 0, pageRank: 0 },
	sampleRows: [{
		sourceRef: 'src/example.ts',
		packetKey: 'packet:example',
		featureId: 'feature:example',
		communityId: null,
		pageRank: null
	}],
	unresolvedParticipantCount: 0,
	status: 'DRY_RUN_COMPLETE',
	writesPerformed: false,
	canonicalAuthority: false,
	generatedAt: '2026-09-24T22:00:00.000Z'
});

describe('GraphProjectionReceiptV1', () => {
	it('accepts revision-qualified dry-run evidence and bounded sample rows', () => {
		expect(GraphProjectionReceiptV1Schema.parse(receipt()).status).toBe('DRY_RUN_COMPLETE');
	});

	it('rejects unbounded samples, unknown fields, and canonical promotion claims', () => {
		expect(() => GraphProjectionReceiptV1Schema.parse({
			...receipt(), sampleRows: Array.from({ length: 21 }, () => receipt().sampleRows[0])
		})).toThrow();
		expect(() => GraphProjectionReceiptV1Schema.parse({ ...receipt(), retrievedContext: {} })).toThrow();
		expect(() => GraphProjectionReceiptV1Schema.parse({ ...receipt(), canonicalAuthority: true })).toThrow();
	});

	it('requires explicit nulls instead of inventing optional projection evidence', () => {
		expect(GraphProjectionReceiptV1Schema.parse(receipt()).sampleRows[0]?.pageRank).toBeNull();
	});
});
