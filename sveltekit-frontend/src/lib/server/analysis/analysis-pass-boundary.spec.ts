import { describe, expect, it } from 'vitest';
import { buildAnalysisPassBoundaryProofSnapshot } from './analysis-pass-boundary.js';

describe('analysis pass boundary proof snapshot', () => {
	it('returns a shaped snapshot and records the canonical boundary contract', async () => {
		const snapshot = await buildAnalysisPassBoundaryProofSnapshot();

		expect(snapshot.generatedAt).toBeTruthy();
		expect(snapshot.canonicalRepresentationId).toBe('semantic_768');
		expect(snapshot.canonicalDimension).toBe(768);
		expect(snapshot.appendOnlyHistoryTable).toBe('analysis_pass_results');
		expect(snapshot.currentMaterializationView).toBe('analysis_pass_current');
		expect(['available', 'unavailable']).toContain(snapshot.status);
		expect(['view_only', 'unique_materialization', 'unknown']).toContain(snapshot.currentBoundaryKind);
		expect(snapshot.reuseBoundary).toBe('application_level_reuse');
		expect(typeof snapshot.uniqueConstraintPresent).toBe('boolean');
	});
});
