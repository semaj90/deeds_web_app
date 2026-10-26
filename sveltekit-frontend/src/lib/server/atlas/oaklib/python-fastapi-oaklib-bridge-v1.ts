/**
 * python-fastapi-oaklib-bridge-v1.ts
 *
 * Bridge and enhancer for Python FastAPI sidecar (OakLib ontology extraction,
 * NLP triples, and concept relations).
 *
 * Invariants:
 * 1. Wire format: Python Tuple[str, str, str, float] serializes as JSON Array [s, p, o, conf].
 * 2. Parser threshold: < 1KB uses V8 JSON.parse; >= 1KB uses SIMDJSON N-API bridge.
 * 3. Validation: Raw parsed tuples are validated before conversion to OntologyLinkedTupleV1.
 * 4. Cache gating: Tuples must be persisted before writing to Valkey centroid cache.
 */

import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	OntologyLinkedTupleV1Schema,
	type OntologyLinkedTupleV1,
} from '../contracts/ontology-linked-tuple-v1.js';
import {
	buildOntologyLinkedTupleCachePlan,
	type OntologyLinkedTupleCachePlan,
} from '../ontology-linked-tuple-cache.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

export const RawOaklibTupleSchema = z.tuple([
	z.string().min(1), // subject
	z.string().min(1), // predicate
	z.string().min(1), // object
	z.number().min(0).max(1).optional(), // confidence
]);

export type RawOaklibTuple = z.infer<typeof RawOaklibTupleSchema>;

export const OaklibResponseEnvelopeSchema = z.object({
	schema: z.literal('python.oaklib-tuples.v1'),
	sourceRef: z.string().min(1),
	modelOrEngine: z.string().default('oaklib-fastapi-v1'),
	tuples: z.array(RawOaklibTupleSchema),
	metadata: z.record(z.string(), z.unknown()).optional(),
});

export type OaklibResponseEnvelope = z.infer<typeof OaklibResponseEnvelopeSchema>;

export const SIMDJSON_PARSE_THRESHOLD_BYTES = 1024;

/**
 * Adaptive payload parser: uses native V8 JSON.parse for small payloads (< 1KB)
 * to avoid N-API context-switch overhead, and fastJsonParse / SIMDJSON for >= 1KB.
 */
export function parseOaklibPayload(rawBody: string | Buffer): unknown {
	const byteLength = typeof rawBody === 'string' ? Buffer.byteLength(rawBody, 'utf8') : rawBody.length;
	const text = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8');

	if (byteLength < SIMDJSON_PARSE_THRESHOLD_BYTES) {
		return JSON.parse(text);
	}
	return fastJsonParse(text);
}

/**
 * Adapts raw Python OakLib tuples [subject, predicate, object, confidence?] into
 * canonical OntologyLinkedTupleV1 records suitable for database persistence.
 */
export function adaptRawOaklibTuplesToOntologyLinkedTuplesV1(input: {
	rawTuples: RawOaklibTuple[];
	packetKey: string;
	sourceRef: string;
	treeNodeId?: string;
	titleId?: string;
	taggerVersion?: string;
	ontologyVersion?: string;
}): OntologyLinkedTupleV1[] {
	const {
		rawTuples,
		packetKey,
		sourceRef,
		treeNodeId = 'node:oaklib:root',
		titleId = 'title:oaklib:default',
		taggerVersion = 'oaklib-fastapi-v1',
		ontologyVersion = 'v1',
	} = input;

	return rawTuples.map((tuple, index) => {
		const [subject, predicate, object, confidence = 1.0] = tuple;
		const tupleHash = createHash('sha256')
			.update(`${packetKey}:${sourceRef}:${subject}:${predicate}:${object}:${index}`)
			.digest('hex')
			.slice(0, 16);

		const rawRecord = {
			tupleId: `tuple:oaklib:${tupleHash}`,
			schemaVersion: 'ontology-linked-tuple.v1' as const,
			packetKey,
			sourceRef,
			treeNodeId,
			titleId,
			surfaceText: `${subject} ${predicate} ${object}`,
			tokenIndex: index,
			partOfSpeech: null,
			label: predicate,
			labelKind: 'ontology' as const,
			labelSource: 'semantic_tagger' as const,
			ontologyIds: [subject, object],
			conceptIds: [`concept:${subject}`, `concept:${object}`],
			confidence: Math.max(0, Math.min(1, confidence)),
			evidenceState: 'ACTIVE_VERIFIED' as const,
			provenance: {
				sourceTables: ['taxonomy_nodes', 'taxonomy_edges'],
				labelerVersion: 'oaklib-sidecar',
				taggerVersion,
				ontologyVersion,
				nlpVersion: 'python-nlp-fastapi-v1',
			},
		};

		return OntologyLinkedTupleV1Schema.parse(rawRecord);
	});
}

/**
 * Assembles the centroid-addressed cache plan for Valkey / Redis after
 * tuples have been persisted.
 */
export function buildOaklibOntologyCachePlan(input: {
	packetId: string;
	packetRevision: string;
	featureId: string;
	sourceRef: string;
	persistedTuples: OntologyLinkedTupleV1[];
	domainClass: string;
	kmeansCluster?: number | null;
	somCluster?: string | null;
	somRow?: number | null;
	somCol?: number | null;
	workspaceRevision: string;
	ontologyVersion?: string | null;
}): OntologyLinkedTupleCachePlan {
	const domainClass = input.domainClass || 'unknown';

	return buildOntologyLinkedTupleCachePlan({
		packetId: input.packetId,
		packetRevision: input.packetRevision,
		featureId: input.featureId,
		sourceRef: input.sourceRef,
		tuples: input.persistedTuples,
		centroid: {
			domainClass,
			domainCentroidKey: `atlas:centroid:domain:${domainClass}`,
			featureCentroidKey: `atlas:centroid:feature:${input.featureId}`,
			kmeansCentroidKey: input.kmeansCluster != null ? `atlas:centroid:kmeans:${input.kmeansCluster}` : null,
			somCentroidKey: input.somCluster ? `atlas:centroid:som:${input.somCluster}` : null,
			communityCentroidKey: null,
			somCluster: input.somCluster ?? null,
			somRow: input.somRow ?? null,
			somCol: input.somCol ?? null,
			kmeansClusters: input.kmeansCluster != null ? [input.kmeansCluster] : [],
			ontologyTags: [domainClass],
		},
		revisions: {
			workspaceRevision: input.workspaceRevision,
			ontologyVersion: input.ontologyVersion ?? null,
			centroidVersion: null,
		},
		blockedContentHashes: [],
	});
}
