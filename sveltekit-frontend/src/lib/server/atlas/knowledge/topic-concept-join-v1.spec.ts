import { describe, it, expect } from 'vitest';
import { buildTopicConceptJoinV1, isDegradedConceptId, type TopicConceptJoinInputV1 } from './topic-concept-join-v1.js';
import type { TopicIdentityReadModelRowV1 } from './topic-identity-read-model-v1.js';

const RECIPE = 'embeddinggemma:title-text-v1';
const GRAPH = 'graph-rev-A';

function topic(id: string, label: string, taxonomy = 'atlas-topic-taxonomy-v1'): TopicIdentityReadModelRowV1 {
	return {
		schema: 'atlas.topic-identity-read-model.v1',
		topicId: id,
		topicKey: `topic:${label.toLowerCase().replace(/\s+/g, '-')}`,
		normalizedLabel: label.toLowerCase(),
		displayLabel: label,
		taxonomyRevision: taxonomy,
		sourceRef: null,
		sourceRevision: null,
		evidenceChecksum: null,
		producerRevision: 'producer-1',
		titleId: `title:${id}`,
		canonicalAuthority: false,
		promotionAuthorized: false,
		writesPerformed: false
	};
}

function base(over: Partial<TopicConceptJoinInputV1> = {}): TopicConceptJoinInputV1 {
	return {
		topics: [topic('11111111-1111-5111-8111-111111111111', 'Authentication')],
		features: [{ featureId: 'auth.sessions', featureLabel: 'Authentication Sessions' }],
		featureLinks: [{ topicId: '11111111-1111-5111-8111-111111111111', featureId: 'auth.sessions' }],
		packets: [
			{
				packetKey: 'ace:packet:auth:001',
				sourceRef: 'src/lib/server/auth.ts',
				sourceRevision: 'sha256:' + 'a'.repeat(64),
				featureId: 'auth.sessions',
				admitted: true,
				embeddingRecipe: RECIPE
			}
		],
		concepts: [
			{ conceptId: 'concept:session', label: 'Session' },
			{ conceptId: 'concept:user', label: 'User' }
		],
		edges: [{ fromConceptId: 'concept:session', toConceptId: 'concept:user', relation: 'BELONGS_TO' }],
		graphRevision: GRAPH,
		currentGraphRevision: GRAPH,
		expectedEmbeddingRecipe: RECIPE,
		...over
	};
}

describe('buildTopicConceptJoinV1: happy path', () => {
	it('resolves an admitted, revision-qualified packet to its feature and topic', () => {
		const r = buildTopicConceptJoinV1(base());
		expect(r.counts.resolvedPackets).toBe(1);
		expect(r.counts.unresolvedPackets).toBe(0);
		expect(r.topics[0].freshness).toBe('FRESH');
		expect(r.topics[0].packets[0].status).toBe('RESOLVED');
		expect(r.diagnostics).toEqual([]);
		expect(r.canonicalAuthority).toBe(false);
		expect(r.writesPerformed).toBe(false);
	});

	it('is deterministic: the same input yields the same checksum regardless of input order', () => {
		const a = buildTopicConceptJoinV1(base());
		const shuffled = base({ concepts: [...base().concepts].reverse(), edges: [...base().edges] });
		expect(buildTopicConceptJoinV1(shuffled).checksum).toBe(a.checksum);
	});
});

describe('negative cases', () => {
	it('keeps both topics when labels collide and never merges them', () => {
		const t1 = topic('aaaaaaaa-1111-5111-8111-111111111111', 'Authentication');
		const t2 = topic('bbbbbbbb-2222-5222-8222-222222222222', 'Authentication');
		const r = buildTopicConceptJoinV1(
			base({ topics: [t1, t2], featureLinks: [{ topicId: t1.topicId, featureId: 'auth.sessions' }] })
		);
		expect(r.topics).toHaveLength(2);
		expect(r.counts.duplicateLabels).toBe(1);
		expect(r.diagnostics.map((d) => d.code)).toContain('DUPLICATE_TOPIC_LABEL');
	});

	it('does not join on a shared label across different taxonomy revisions', () => {
		const t1 = topic('aaaaaaaa-1111-5111-8111-111111111111', 'Authentication', 'rev-1');
		const t2 = topic('bbbbbbbb-2222-5222-8222-222222222222', 'Authentication', 'rev-2');
		const r = buildTopicConceptJoinV1(base({ topics: [t1, t2] }));
		expect(r.counts.duplicateLabels).toBe(0);
	});

	it('marks a packet with no admission as UNADMITTED and keeps it visible', () => {
		const p = base().packets.map((x) => ({ ...x, admitted: false }));
		const r = buildTopicConceptJoinV1(base({ packets: p }));
		expect(r.topics[0].packets[0].status).toBe('UNADMITTED');
		expect(r.topics[0].freshness).toBe('UNRESOLVED');
		expect(r.diagnostics.map((d) => d.code)).toContain('UNADMITTED_PACKET');
	});

	it('flags a packet with no key as UNRESOLVED_PACKET rather than dropping it', () => {
		const p = base().packets.map((x) => ({ ...x, packetKey: '' }));
		const r = buildTopicConceptJoinV1(base({ packets: p }));
		expect(r.topics[0].packets[0].status).toBe('UNRESOLVED_PACKET');
		expect(r.counts.unresolvedPackets).toBe(1);
	});

	it('flags a packet with no source revision as UNQUALIFIED_SOURCE', () => {
		const p = base().packets.map((x) => ({ ...x, sourceRevision: null }));
		const r = buildTopicConceptJoinV1(base({ packets: p }));
		expect(r.topics[0].packets[0].status).toBe('UNQUALIFIED_SOURCE');
	});

	it('flags an embedding recipe that does not match the expected recipe', () => {
		const p = base().packets.map((x) => ({ ...x, embeddingRecipe: 'raw-text-v0' }));
		const r = buildTopicConceptJoinV1(base({ packets: p }));
		expect(r.topics[0].packets[0].status).toBe('RECIPE_MISMATCH');
		expect(r.diagnostics.map((d) => d.code)).toContain('RECIPE_MISMATCH');
	});

	it('marks everything STALE_GRAPH when the graph revision is behind', () => {
		const r = buildTopicConceptJoinV1(base({ currentGraphRevision: 'graph-rev-B' }));
		expect(r.graphFresh).toBe(false);
		expect(r.topics[0].freshness).toBe('STALE_GRAPH');
		expect(r.diagnostics.map((d) => d.code)).toContain('STALE_GRAPH_REVISION');
	});

	it('rejects a Neo4j element ID as a durable concept identity but keeps the node', () => {
		const r = buildTopicConceptJoinV1(
			base({ concepts: [{ conceptId: '4:0f1e2d3c-aaaa-bbbb-cccc-000000000001:42', label: 'Ghost' }] , edges: [] })
		);
		expect(r.concepts[0].durable).toBe(false);
		expect(r.counts.degradedConcepts).toBe(1);
		expect(r.diagnostics.map((d) => d.code)).toContain('DEGRADED_CONCEPT_ID');
	});

	it('records a feature link to a missing feature as orphaned, not silently dropped', () => {
		const r = buildTopicConceptJoinV1(
			base({ featureLinks: [{ topicId: '11111111-1111-5111-8111-111111111111', featureId: 'gone.feature' }] })
		);
		expect(r.counts.orphanedFeatureLinks).toBe(1);
		expect(r.topics[0].features).toEqual([]);
		expect(r.diagnostics.map((d) => d.code)).toContain('ORPHANED_FEATURE_LINK');
	});

	it('does not attach a packet by feature label, only by feature id', () => {
		const p = base().packets.map((x) => ({ ...x, featureId: 'Authentication Sessions' }));
		const r = buildTopicConceptJoinV1(base({ packets: p }));
		expect(r.topics[0].packets).toEqual([]);
	});

	it('reports a dangling edge whose endpoint is missing', () => {
		const r = buildTopicConceptJoinV1(
			base({ edges: [{ fromConceptId: 'concept:session', toConceptId: 'concept:missing', relation: 'X' }] })
		);
		expect(r.edges).toEqual([]);
		expect(r.diagnostics.map((d) => d.code)).toContain('DANGLING_CONCEPT_EDGE');
	});
});

describe('isDegradedConceptId', () => {
	it('recognizes element-ID shapes and accepts durable IDs', () => {
		expect(isDegradedConceptId('4:0f1e2d3c-aaaa-bbbb-cccc-000000000001:42')).toBe(true);
		expect(isDegradedConceptId('concept:session')).toBe(false);
	});
});
