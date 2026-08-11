import { describe, expect, it } from 'vitest';
import { buildAnalysisPassCurrentProofSnapshot } from './analysis-pass-current.js';

describe('analysis pass current proof snapshot', () => {
	it('returns a shaped snapshot even when the live view is unavailable', async () => {
		const snapshot = await buildAnalysisPassCurrentProofSnapshot(1);

		expect(snapshot.generatedAt).toBeTruthy();
		expect(snapshot.canonicalRepresentationId).toBe('semantic_768');
		expect(snapshot.canonicalDimension).toBe(768);
		expect(['available', 'unavailable']).toContain(snapshot.status);
	});
});
