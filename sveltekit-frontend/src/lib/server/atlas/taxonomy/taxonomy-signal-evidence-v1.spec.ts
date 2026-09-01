import { describe, expect, it } from 'vitest';
import { buildTaxonomySignalEvidenceV1, TaxonomySignalEvidenceV1Schema } from './taxonomy-signal-evidence-v1.js';

describe('TaxonomySignalEvidenceV1', () => {
	it('binds a non-null signal to evidence and revisions', () => {
		const signal = buildTaxonomySignalEvidenceV1({
			signalKind: 'graph',
			score: 0.82,
			evidenceRefs: ['pagerank:run-1:packet-1'],
			producerRevision: 'pagerank.v1',
			workspaceRevision: 'workspace-1',
			sourceRevision: 'source-1',
			graphRevision: 'graph-1',
		});
		expect(TaxonomySignalEvidenceV1Schema.parse(signal)).toEqual(signal);
		expect(signal.checksum).toHaveLength(64);
	});

	it('rejects a scored signal without evidence', () => {
		expect(() => TaxonomySignalEvidenceV1Schema.parse({
			schema: 'atlas.taxonomy-signal-evidence.v1', signalKind: 'lexical', score: 0.4,
			evidenceRefs: [], producerRevision: 'fts.v1', workspaceRevision: 'workspace-1',
			sourceRevision: null, graphRevision: null, checksum: 'a'.repeat(64),
		})).toThrow();
	});
});
