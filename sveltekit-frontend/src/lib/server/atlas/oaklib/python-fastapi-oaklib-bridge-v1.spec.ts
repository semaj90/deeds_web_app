import { describe, expect, it } from 'vitest';
import {
	adaptRawOaklibTuplesToOntologyLinkedTuplesV1,
	buildOaklibOntologyCachePlan,
	parseOaklibPayload,
	RawOaklibTupleSchema,
	SIMDJSON_PARSE_THRESHOLD_BYTES,
	type RawOaklibTuple,
} from './python-fastapi-oaklib-bridge-v1.js';

describe('python-fastapi-oaklib-bridge-v1', () => {
	const sampleTuples: RawOaklibTuple[] = [
		['legal:bankruptcy', 'governed_by', 'statute:usc_title_11', 0.98],
		['legal:debtor', 'subclass_of', 'legal:party_in_interest', 0.92],
	];

	it('validates positional raw tuples from Python FastAPI', () => {
		const valid = RawOaklibTupleSchema.parse(['jurisdiction:federal', 'has_court', 'court:bankruptcy', 0.95]);
		expect(valid[0]).toBe('jurisdiction:federal');
		expect(valid[1]).toBe('has_court');
		expect(valid[2]).toBe('court:bankruptcy');
		expect(valid[3]).toBe(0.95);

		// Missing required items or invalid confidence
		expect(() => RawOaklibTupleSchema.parse(['only_subject'])).toThrow();
		expect(() => RawOaklibTupleSchema.parse(['sub', 'pred', 'obj', 2.5])).toThrow();
	});

	it('selects native V8 parser for < 1KB payloads', () => {
		const smallPayload = JSON.stringify({
			schema: 'python.oaklib-tuples.v1',
			sourceRef: 'docs/case_law.md',
			tuples: [['a', 'b', 'c', 0.9]],
		});
		expect(Buffer.byteLength(smallPayload, 'utf8')).toBeLessThan(SIMDJSON_PARSE_THRESHOLD_BYTES);

		const result = parseOaklibPayload(smallPayload) as { schema: string };
		expect(result.schema).toBe('python.oaklib-tuples.v1');
	});

	it('handles >= 1KB payloads with fastJsonParse', () => {
		const largeTuples: [string, string, string, number][] = [];
		for (let i = 0; i < 50; i++) {
			largeTuples.push([`concept:subject_${i}`, `predicate_${i}`, `concept:object_${i}`, 0.85]);
		}
		const largePayload = JSON.stringify({
			schema: 'python.oaklib-tuples.v1',
			sourceRef: 'docs/statutes.md',
			tuples: largeTuples,
		});
		expect(Buffer.byteLength(largePayload, 'utf8')).toBeGreaterThanOrEqual(SIMDJSON_PARSE_THRESHOLD_BYTES);

		const result = parseOaklibPayload(largePayload) as { tuples: unknown[] };
		expect(result.tuples.length).toBe(50);
	});

	it('adapts raw tuples to canonical OntologyLinkedTupleV1 records', () => {
		const adapted = adaptRawOaklibTuplesToOntologyLinkedTuplesV1({
			rawTuples: sampleTuples,
			packetKey: 'packet:test_123',
			sourceRef: 'corpus/statutes/title11.txt',
			taggerVersion: 'oaklib-0.6.2',
		});

		expect(adapted.length).toBe(2);
		expect(adapted[0].schemaVersion).toBe('ontology-linked-tuple.v1');
		expect(adapted[0].evidenceState).toBe('ACTIVE_VERIFIED');
		expect(adapted[0].label).toBe('governed_by');
		expect(adapted[0].ontologyIds).toEqual(['legal:bankruptcy', 'statute:usc_title_11']);
		expect(adapted[0].confidence).toBe(0.98);
		expect(adapted[0].provenance.taggerVersion).toBe('oaklib-0.6.2');
		expect(adapted[0].provenance.labelerVersion).toBe('oaklib-sidecar');
	});

	it('builds centroid-addressed cache plan for Valkey / Redis', () => {
		const persistedTuples = adaptRawOaklibTuplesToOntologyLinkedTuplesV1({
			rawTuples: sampleTuples,
			packetKey: 'packet:test_123',
			sourceRef: 'corpus/statutes/title11.txt',
		});

		const cachePlan = buildOaklibOntologyCachePlan({
			packetId: 'packet:test_123',
			packetRevision: 'rev-456',
			featureId: 'feature-bankruptcy-code',
			sourceRef: 'corpus/statutes/title11.txt',
			persistedTuples,
			domainClass: 'bankruptcy',
			kmeansCluster: 3,
			somCluster: '2:5',
			workspaceRevision: 'sha256:e24bb97187ea6394eeba457dd849915f570045b7a1867780fdc7aa9ea62b9acc',
			ontologyVersion: '2026.10',
		});

		expect(cachePlan.records[0].centroid.domainCentroidKey).toBe('atlas:centroid:domain:bankruptcy');
		expect(cachePlan.records[0].centroid.kmeansCentroidKey).toBe('atlas:centroid:kmeans:3');
		expect(cachePlan.records[0].centroid.somCentroidKey).toBe('atlas:centroid:som:2:5');
		expect(cachePlan.records.length).toBe(2);
		expect(cachePlan.records[0].tupleId).toBe(persistedTuples[0].tupleId);
	});
});
