import { describe, expect, it } from 'vitest';
import {
	buildParentAtlasPassFabricProofReport,
	getParentAtlasPassFabricProofSnapshot,
} from './pass-fabric-proof.js';

describe('parent atlas pass fabric proof snapshot', () => {
	it('reports a wired PF4 receipt with explicit open gaps', () => {
		const snapshot = getParentAtlasPassFabricProofSnapshot();

		expect(snapshot.summary.total).toBe(1);
	expect(snapshot.summary.canonicalRepresentationId).toBe('semantic_768');
	expect(snapshot.summary.canonicalDimension).toBe(768);
	expect(snapshot.summary.proofState).toBe('wired');
	expect(snapshot.summary.openGapCount).toBe(1);
	expect(snapshot.receipts[0].lane).toBe('PF4');
	expect(snapshot.receipts[0].proof_gate).toBe('PASS_FABRIC_LEDGER_RECONCILIATION_WIRED');
	expect(snapshot.receipts[0].open_gaps).toEqual([
		'PF4H uniqueness enforcement remains deferred until the logical-materialization boundary is proven and promoted',
	]);
	});

	it('produces a stable proof report', () => {
		expect(buildParentAtlasPassFabricProofReport()).toContain('Parent Atlas PF4 receipts: 1');
	});
});
