import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
	admitRetrievalForTaskV1,
	attachOntologyProposalsToAdmittedCandidatesV1,
	type AtlasRetrievalHitV1,
	type OntologyProposalEntryV1
} from './atlas-retrieval-admission-v1.js';

const REPO_REV = 'git:4ae8253ab6e7';
const SRC_REV = `sha256:${'a'.repeat(64)}`;

function makeHit(overrides: Partial<AtlasRetrievalHitV1> = {}): AtlasRetrievalHitV1 {
	return {
		taskId: 'CASE-SCENE-LIVE-03-video-clock',
		stableKey: 'src/lib/reconstruction/scene-runtime-three-v1.ts',
		packetKey: 'packet:abc123',
		sourceId: 'src/lib/reconstruction/scene-runtime-three-v1.ts',
		sourceRevision: SRC_REV,
		repositoryRevision: REPO_REV,
		indexRevision: 'idx-v1',
		backend: 'pgvector',
		rawScore: 0.91,
		rank: 1,
		admission: 'ADMITTED',
		receiptIds: ['rcpt-vitest-1'],
		...overrides
	};
}

describe('atlas.retrieval-admission.v1', () => {
	it('deduplicates, fuses ranks via RRF, and promotes PROVEN only when all gates pass', () => {
		const res = admitRetrievalForTaskV1({
			taskId: 'CASE-SCENE-LIVE-03-video-clock',
			expectedRepositoryRevision: REPO_REV,
			expectedSourceRevisionByKey: {
				'src/lib/reconstruction/scene-runtime-three-v1.ts': SRC_REV
			},
			hits: [
				makeHit({ backend: 'pgvector', rank: 1, rawScore: 0.92 }),
				makeHit({ backend: 'turbovec', rank: 2, rawScore: 0.88 }),
				makeHit({ backend: 'neo4j', rank: 1, rawScore: 0.014 })
			],
			backendHealth: {
				pgvector: { available: true },
				turbovec: { available: true },
				neo4j: { available: true, stale: false }
			},
			validationReceipts: [{ receiptId: 'rcpt-vitest-1', passed: true }]
		});

		expect(res.promotionStatus).toBe('PROVEN');
		expect(res.blockReasons).toEqual([]);
		expect(res.fusedCandidates.length).toBe(1);
		expect(res.fusedCandidates[0]?.backends).toEqual(['neo4j', 'pgvector', 'turbovec']);
		expect(res.top100Contribution).toBeGreaterThan(0);
	});

	it('never silently promotes PROVEN on stale graph, missing packet, revision mismatch, unavailable vector, or failed receipt', () => {
		const cases = [
			{
				name: 'stale graph',
				hits: [makeHit({ backend: 'neo4j' })],
				health: { neo4j: { available: true, stale: true } },
				receipts: [{ receiptId: 'rcpt-vitest-1', passed: true }],
				expectedReason: 'STALE_GRAPH_PROJECTION'
			},
			{
				name: 'missing packet',
				hits: [makeHit({ packetKey: null })],
				health: { pgvector: { available: true } },
				receipts: [{ receiptId: 'rcpt-vitest-1', passed: true }],
				expectedReason: 'MISSING_PACKET'
			},
			{
				name: 'inconsistent revision',
				hits: [makeHit({ sourceRevision: `sha256:${'b'.repeat(64)}` })],
				health: { pgvector: { available: true } },
				receipts: [{ receiptId: 'rcpt-vitest-1', passed: true }],
				expectedReason: 'REVISION_MISMATCH'
			},
			{
				name: 'unavailable vector service',
				hits: [makeHit({ backend: 'qdrant' })],
				health: { qdrant: { available: false } },
				receipts: [{ receiptId: 'rcpt-vitest-1', passed: true }],
				expectedReason: 'BACKEND_UNAVAILABLE'
			},
			{
				name: 'failed receipt',
				hits: [makeHit()],
				health: { pgvector: { available: true } },
				receipts: [{ receiptId: 'rcpt-vitest-1', passed: false }],
				expectedReason: 'FAILED_VALIDATION_RECEIPT'
			}
		] as const;

		for (const c of cases) {
			const res = admitRetrievalForTaskV1({
				taskId: 'CASE-SCENE-LIVE-03-video-clock',
				expectedRepositoryRevision: REPO_REV,
				expectedSourceRevisionByKey: {
					'src/lib/reconstruction/scene-runtime-three-v1.ts': SRC_REV
				},
				hits: c.hits,
				backendHealth: c.health,
				validationReceipts: c.receipts
			});
			expect(res.promotionStatus, c.name).not.toBe('PROVEN');
			expect(res.blockReasons, c.name).toContain(c.expectedReason);
			expect(res.top100Contribution, c.name).toBe(0);
		}
	});

	it('attaches NetworkX PageRank + K-Means ontology proposals as non-canonical RETRIEVAL_PROPOSAL metadata', () => {
		const reportPath = resolve(
			process.cwd(),
			'../docs/reports/scene-ontology-kmeans-pagerank-v1.json'
		);
		const report = JSON.parse(readFileSync(reportPath, 'utf8')) as {
			topRecommendations: OntologyProposalEntryV1[];
		};
		const ontologyMap = Object.fromEntries(
			report.topRecommendations.map((r) => [r.conceptId, r])
		);

		const res = admitRetrievalForTaskV1({
			taskId: 'CASE-SCENE-LIVE-03-video-clock',
			expectedRepositoryRevision: REPO_REV,
			expectedSourceRevisionByKey: {
				'src/lib/reconstruction/scene-runtime-three-v1.ts': SRC_REV
			},
			hits: [makeHit({ backend: 'pgvector', rank: 1 })],
			backendHealth: { pgvector: { available: true } },
			validationReceipts: [{ receiptId: 'rcpt-vitest-1', passed: true }]
		});

		const firstConceptId = report.topRecommendations[0]!.conceptId;
		const enriched = attachOntologyProposalsToAdmittedCandidatesV1(
			res.fusedCandidates,
			ontologyMap,
			{ 'src/lib/reconstruction/scene-runtime-three-v1.ts': [firstConceptId] }
		);

		expect(enriched[0]?.ontologyAuthorityLabel).toBe('RETRIEVAL_PROPOSAL');
		expect(enriched[0]?.ontologyProposals[0]?.conceptId).toBe(firstConceptId);
		expect(enriched[0]?.rrfScore).toBe(res.fusedCandidates[0]?.rrfScore);
	});
});
