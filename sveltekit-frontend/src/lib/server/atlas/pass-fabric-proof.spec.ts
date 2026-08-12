import { describe, expect, it } from 'vitest';
import {
	buildParentAtlasPassFabricProofReport,
	getParentAtlasPassFabricProofSnapshot,
} from './pass-fabric-proof.js';

describe('parent atlas pass fabric proof snapshot', () => {
	it('reports a proven PF4 receipt with no open gaps', () => {
		const snapshot = getParentAtlasPassFabricProofSnapshot();

		expect(snapshot.summary.total).toBe(1);
	expect(snapshot.summary.canonicalRepresentationId).toBe('semantic_768');
	expect(snapshot.summary.canonicalDimension).toBe(768);
	expect(snapshot.summary.proofState).toBe('proven');
	expect(snapshot.summary.openGapCount).toBe(0);
	expect(snapshot.receipts[0].lane).toBe('PF4');
	expect(snapshot.receipts[0].proof_gate).toBe('PASS_FABRIC_CURRENT_MATERIALIZATION_PROVEN');
	expect(snapshot.receipts[0].open_gaps).toEqual([]);
	});

	it('produces a stable proof report', () => {
		expect(buildParentAtlasPassFabricProofReport()).toContain('Parent Atlas PF4 receipts: 1');
	});
});
