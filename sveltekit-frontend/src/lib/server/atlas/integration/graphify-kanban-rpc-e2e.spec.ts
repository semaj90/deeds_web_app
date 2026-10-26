import { describe, expect, it } from 'vitest';
import { EvidenceLocatorV1Schema } from '../contracts/evidence-locator-v1.js';
import { buildLexicalInputProof, sha256Utf8 } from '../contracts/lexical-input-proof-v1.js';
import { spanChecksumOf } from '../execution/topk-evidence-fetch-v1.js';
import { CandidateFeatureRowV1Schema } from '../features/candidate-feature-row-v1.js';
import { promoteCandidateFeatureRowV1 } from './candidate-feature-to-feature-row-v1.js';
import {
	projectRecommendationToKanbanV1,
	recordReviewDecisionV1,
} from '../recommendations/human-review-projection-v1.js';
import {
	buildFeatureRowRpcPacketV1,
	decodeFeatureRowRpcPacketV1,
	FeatureRowRpcPacketV1Schema,
} from '../transport/feature-row-rpc-packet-v1.js';

describe('Graphify Kanban to RPC Packet End-to-End Pipeline', () => {
	it('executes full pipeline: Graphify recommendation -> Human review -> FeatureRow -> RPC Packet -> Binary Float Decode', () => {
		// 1. Project a Graphify recommendation to Kanban
		const recommendation = projectRecommendationToKanbanV1({
			recommendationId: 'rec-graphify-001',
			title: 'Optimize auth token verification query',
			summary: 'High fan-out in auth token verification indicates need for indexed lookup.',
			priority: 'high',
			targetFiles: ['src/lib/server/auth/token-verify.ts'],
			evidenceRefs: ['src/lib/server/auth/token-verify.ts#verify'],
			acceptanceCriteria: ['Pass auth test suite', 'Verify latency reduction'],
			validationCommands: ['npm run test:auth'],
			permissionMode: 'proposal_only',
			promotionGate: {
				recommendation_id: 'rec-graphify-001',
				retrieval_confidence: 0.95,
				evidence_completeness: 0.9,
				duplicate_task_probability: 0.05,
				actionable: true,
				affected_paths_known: true,
				acceptance_criteria_present: true,
				permissions_resolved: true,
				permission_mode: 'proposal_only',
				gate_decision: 'PROMOTE',
				failure_reasons: [],
			},
			graphifyRevision: 'graph:snapshot:2026-10-24',
			featureRevision: 'feat:rev:001',
		});

		expect(recommendation.status).toBe('proposed');
		expect(recommendation.humanDecision).toBe('pending');

		// 2. Human reviews and approves the recommendation
		const { updatedRecommendation, reviewEvent } = recordReviewDecisionV1(
			recommendation,
			'approve',
			{
				reviewerId: 'lead-dev-yorha',
				notes: 'Approved for RPC packet assembly and device execution.',
			},
		);

		expect(updatedRecommendation.status).toBe('approved');
		expect(updatedRecommendation.humanDecision).toBe('approve');
		expect(reviewEvent.decision).toBe('approve');

		// 3. Promote CandidateFeatureRows for the approved target
		const candidate = CandidateFeatureRowV1Schema.parse({
			schema: 'atlas.candidate-feature-row.v1',
			candidateOrdinal: 0,
			canonicalId: 'symbol:token.verify',
			packetKey: 'packet:auth:0',
			sourceRef: 'src/lib/server/auth/token-verify.ts#verify',
			treeNodeId: 'tree:node:0',
			symbolVersionId: 'sym-ver:0',
			workspaceRevision: 'ws:snap:1',
			sourceRevision: 'src:rev:1',
			graphRevision: 'graph:snapshot:2026-10-24',
			semanticRevision: 'semantic:gemma:768',
			featureRevision: 'feat:rev:001',
			representationBindings: [
				{
					representationId: 'semantic_768',
					family: 'EMBEDDINGGEMMA_MRL',
					dimensions: 768,
					modelRevision: 'embeddinggemma:test:v1',
					projectionKind: 'NONE',
					sourceRepresentationId: null,
					projectionRevision: null,
					normalized: true,
					available: true,
					availabilityReason: null,
				},
			],
			semanticRelevance: 0.95,
			lexicalRelevance: 0.82,
			astAffinity: 0.91,
			graphAuthority: 0.78,
			personalizedPageRank: 0.65,
			communityAffinity: 0.55,
			manifold4OrientationSimilarity: 0.3,
			crossEncoderRawScore: 2.8,
			crossEncoderCalibratedScore: 0.92,
			crossEncoderAvailable: true,
			domainAffinity: 0.88,
			executionUtility: 0.75,
			memoryUtility: 0.6,
			laneMask: ['semantic', 'lexical', 'ast', 'graph', 'cross_encoder'],
			degradedIdentity: false,
			evidenceRefs: ['src/lib/server/auth/token-verify.ts#verify'],
		});

		const locator = EvidenceLocatorV1Schema.parse({
			schema: 'atlas.evidence-locator.v1',
			canonicalId: 'symbol:token.verify',
			packetKey: 'packet:auth:0',
			sourceRef: 'src/lib/server/auth/token-verify.ts#verify',
			sourceKind: 'code_file',
			filePath: 'src/lib/server/auth/token-verify.ts',
			sourceUrl: null,
			contentHash: `sha256:${sha256Utf8('fixture source auth token')}`,
			workspaceRevision: 'ws:snap:1',
			sourceRevision: 'src:rev:1',
			span: { startByte: 10, endByte: 50 },
			domain: null,
		});

		const featureRow = promoteCandidateFeatureRowV1({
			candidate,
			locator,
			semanticEvidence: {
				packetKey: candidate.packetKey!,
				canonicalId: candidate.canonicalId,
				sourceRef: candidate.sourceRef!,
				workspaceRevision: candidate.workspaceRevision,
				sourceRevision: candidate.sourceRevision,
				queryRecipe: {
					representationId: 'semantic_768',
					representationRevision: candidate.semanticRevision!,
					modelArtifactRevision: 'embeddinggemma:test:v1',
					tokenizerRevision: 'tokenizer:test:v1',
					inputPolicyRevision: 'input-policy:test:v1',
					promptRevision: 'prompt:test:v1',
					mode: 'retrieval_query',
					dimension: 768,
					metric: 'COSINE',
					normalization: 'L2',
					inputChecksum: 'a'.repeat(64),
				},
				documentRecipe: {
					representationId: 'semantic_768',
					representationRevision: candidate.semanticRevision!,
					modelArtifactRevision: 'embeddinggemma:test:v1',
					tokenizerRevision: 'tokenizer:test:v1',
					inputPolicyRevision: 'input-policy:test:v1',
					promptRevision: 'prompt:test:v1',
					mode: 'retrieval_document',
					dimension: 768,
					metric: 'COSINE',
					normalization: 'L2',
					inputChecksum: 'b'.repeat(64),
				},
			},
			lexicalEvidence: buildLexicalInputProof({
				packetKey: candidate.packetKey!,
				sourceRef: candidate.sourceRef!,
				content: 'fixture source auth token',
				declaredContentHash: sha256Utf8('fixture source auth token'),
				sourceRevision: candidate.sourceRevision,
				workspaceRevision: candidate.workspaceRevision,
				sourceRevisionProven: true,
				workspaceRevisionCurrent: true,
				canonicalBindingExact: true,
				tokenizerRevision: 'tokenizer:test:v1',
				lexicalDerivationRevision: 'lexical:test:v1',
				textSearchConfig: 'english',
			}),
			astEvidence: {
				treeNodeId: candidate.treeNodeId!,
				symbolVersionId: candidate.symbolVersionId!,
				canonicalId: candidate.canonicalId,
				packetKey: candidate.packetKey!,
				sourceRef: candidate.sourceRef!,
				sourceRevision: candidate.sourceRevision,
				workspaceRevision: candidate.workspaceRevision,
				sourceContentHash: sha256Utf8('fixture source auth token'),
				startByte: 10,
				endByte: 50,
				sourceEvidence: (() => {
					const byteStart = 0;
					const byteEnd = 50;
					const text = 'x'.repeat(byteEnd - byteStart);
					return {
						schema: 'atlas.qualified-evidence.v1' as const,
						qualification: 'QUALIFIED' as const,
						rank: 1,
						ordinal: candidate.candidateOrdinal,
						canonicalId: candidate.canonicalId,
						sourceRef: candidate.sourceRef!,
						sourceRevision: candidate.sourceRevision,
						spanUnit: 'bytes' as const,
						spanStart: byteStart,
						spanEnd: byteEnd,
						byteStart,
						byteEnd,
						text,
						spanChecksum: spanChecksumOf({ sourceRevision: candidate.sourceRevision, byteStart, byteEnd, text }),
						evidenceRefs: ['src/lib/server/auth/token-verify.ts#verify'],
						canonicalAuthority: false as const,
					};
				})(),
			},
			pagerank: {
				pagerank_l1: 0.78,
				graphRevision: candidate.graphRevision,
				status: 'promoted',
				didConverge: true,
			},
			rrf: 0.85,
			freshness: 0.95,
		});

		expect(featureRow.canonicalId).toBe('symbol:token.verify');
		expect(featureRow.packetKey).toBe('packet:auth:0');
		expect(featureRow.crossEncoder).toBe(0.92);

		// 4. Build binary-packed FeatureRowRpcPacketV1
		const packet = buildFeatureRowRpcPacketV1([featureRow]);

		// Verify schema contract
		const parsedPacket = FeatureRowRpcPacketV1Schema.parse(packet);
		expect(parsedPacket.rows).toBe(1);
		expect(parsedPacket.cols).toBe(10);
		expect(parsedPacket.canonicalAuthority).toBe(false);
		expect(parsedPacket.writesPerformed).toBe(false);
		expect(parsedPacket.numericEncoding).toBe('float32-le');

		// 5. Decode RPC Packet and verify Float32 continuous buffer
		const decoded = decodeFeatureRowRpcPacketV1(parsedPacket);
		expect(decoded.verified).toBe(true);
		expect(decoded.shape).toEqual([1, 10]);
		expect(decoded.candidatePacketKeys).toEqual(['packet:auth:0']);
		expect(decoded.canonicalIds).toEqual(['symbol:token.verify']);
		expect(decoded.sourceRefs).toEqual(['src/lib/server/auth/token-verify.ts#verify']);

		// 6. Verify exact numeric feature array reconstructed from bytes
		const rowFloats = decoded.tensor;
		expect(rowFloats).toHaveLength(10);
		expect(rowFloats[0]).toBeCloseTo(0.95, 2); // dense (semanticRelevance)
		expect(rowFloats[1]).toBeCloseTo(0.82, 2); // sparse (lexicalRelevance)
		expect(rowFloats[2]).toBeCloseTo(0.85, 2); // rrf
		expect(rowFloats[3]).toBeCloseTo(0.91, 2); // ast
		expect(rowFloats[4]).toBeCloseTo(0.78, 2); // pagerankAuthority
		expect(rowFloats[5]).toBeCloseTo(0.65, 2); // pprAffinity
		expect(rowFloats[6]).toBeCloseTo(0.88, 2); // domainAffinity
		expect(rowFloats[7]).toBeCloseTo(0.95, 2); // freshness
		expect(rowFloats[8]).toBeCloseTo(0.92, 2); // crossEncoder calibrated score
		expect(rowFloats[9]).toBeCloseTo(0.75, 2); // executionUtility
	});
});
