import { describe, expect, it } from 'vitest';
import {
	buildCodePageFeatureProfileV1,
	buildPaginatedEngineeringRecommendationsV1,
	resolveTokenAnchorRecoveryV1,
	CodePageFeatureProfileV1Schema,
} from './contextual-engineering-helpers-v1.js';
import {
	buildFeatureRowRpcPacketV1,
	decodeFeatureRowRpcPacketV1,
} from '../transport/feature-row-rpc-packet-v1.js';
import { buildFeatureRowV1, type FeatureRowV1 } from '../ranking/feature-row-v1.js';

describe('ContextualEngineeringHelpersV1', () => {
	const makeRow = (id: string, dense: number, ast: number): FeatureRowV1 =>
		buildFeatureRowV1({
			locator: {
				schema: 'atlas.evidence-locator.v1',
				canonicalId: `symbol:${id}`,
				packetKey: `packet:${id}`,
				sourceRef: `src/${id}.ts#entry`,
				sourceKind: 'code_file',
				filePath: `src/${id}.ts`,
				sourceUrl: null,
				contentHash: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
				workspaceRevision: 'ws:snap:1',
				sourceRevision: 'src:rev:1',
				span: { startByte: 100, endByte: 250 },
				domain: null,
			},
			featureRevision: 'feat:rev:1',
			graphRevision: 'graph:rev:1',
			semanticRevision: 'sem:rev:1',
			dense,
			sparse: 0.7,
			rrf: 0.8,
			ast,
			pagerank: { pagerank_l1: 0.75 },
			pprAffinity: 0.6,
			domainAffinity: 0.9,
			freshness: 0.88,
			crossEncoder: 0.92,
			executionUtility: 0.8,
			evidenceRefs: [`ev:${id}`],
		});

	it('builds and validates a full CodePageFeatureProfileV1 covering CST, AST, LSP, and NES LUT', () => {
		const profile = buildCodePageFeatureProfileV1({
			canonicalId: 'symbol:token_verifier',
			sourceRef: 'src/token_verifier.ts#verifyToken',
			filePath: 'src/token_verifier.ts',
			language: 'typescript',
			cst: {
				nodeType: 'function_declaration',
				startByte: 100,
				endByte: 250,
				parentFieldPath: 'source_file.statement[2]',
				spanChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
			},
			ast: {
				treeNodeId: 'node:fn:token_verifier',
				symbolVersionId: 'sym:v1:token_verifier',
				symbolKind: 'function',
				parameters: ['rawToken: string', 'options: VerifyOptions'],
				returnType: 'Promise<TokenClaims>',
				cyclomaticComplexity: 3,
			},
			lsp: {
				definitionRef: 'src/token_verifier.ts#L12',
				referenceCount: 14,
				isExported: true,
				diagnosticsCount: 0,
			},
			nesLut: {
				tableSource: 'atlas_nes_lut_v1',
				domainClass: 'AUTHENTICATION_AND_IDENTITY',
				clusterBucketId: 42,
				taxonomyConfidence: 0.94,
			},
			featureRow: {
				dense: 0.92,
				sparse: 0.78,
				rrf: 0.85,
				ast: 0.89,
				pagerankAuthority: 0.75,
				pprAffinity: 0.6,
				domainAffinity: 0.94,
				freshness: 0.9,
				crossEncoder: 0.91,
				executionUtility: 0.85,
			},
			workspaceRevision: 'ws:snap:1',
		});

		expect(profile.schema).toBe('atlas.code-page-feature-profile.v1');
		expect(profile.tokenAnchor).toBe('symbol:token_verifier::src/token_verifier.ts#verifyToken#[100-250]');
		expect(profile.canonicalAuthority).toBe(false);

		// Schema parse round-trip
		expect(CodePageFeatureProfileV1Schema.parse(profile)).toBeDefined();
	});

	it('builds paginated engineering recommendations from ingested RPC packet with grounding breadcrumbs', () => {
		const rowHigh = makeRow('auth_crypto', 0.95, 0.9);
		const rowMed = makeRow('session_store', 0.65, 0.7);
		const packet = buildFeatureRowRpcPacketV1([rowHigh, rowMed]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);

		const profileHigh = buildCodePageFeatureProfileV1({
			canonicalId: 'symbol:auth_crypto',
			sourceRef: 'src/auth_crypto.ts#entry',
			filePath: 'src/auth_crypto.ts',
			language: 'typescript',
			cst: {
				nodeType: 'class_declaration',
				startByte: 100,
				endByte: 250,
				parentFieldPath: 'source_file.statement[0]',
				spanChecksum: 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
			},
			ast: {
				treeNodeId: 'node:cls:auth_crypto',
				symbolVersionId: 'sym:v1:auth_crypto',
				symbolKind: 'class',
				parameters: [],
				returnType: 'AuthCrypto',
				cyclomaticComplexity: 5,
			},
			lsp: {
				definitionRef: 'src/auth_crypto.ts#L1',
				referenceCount: 22,
				isExported: true,
				diagnosticsCount: 0,
			},
			nesLut: {
				tableSource: 'atlas_nes_lut_v1',
				domainClass: 'CRYPTOGRAPHIC_PRIMITIVES',
				clusterBucketId: 10,
				taxonomyConfidence: 0.98,
			},
			featureRow: {
				dense: 0.95,
				sparse: 0.7,
				rrf: 0.8,
				ast: 0.9,
				pagerankAuthority: 0.75,
				pprAffinity: 0.6,
				domainAffinity: 0.98,
				freshness: 0.88,
				crossEncoder: 0.92,
				executionUtility: 0.8,
			},
			workspaceRevision: 'ws:snap:1',
		});

		const result = buildPaginatedEngineeringRecommendationsV1({
			decodedPacket: decoded,
			profiles: [profileHigh],
			domainQuery: 'Find cryptographic verification helper',
			page: 1,
			pageSize: 1,
			authorization: {
				actorId: 'authorized-agent',
				workspaceGrantAdmitted: true,
			},
		});

		expect(result.schema).toBe('atlas.paginated-engineering-recommendation.v1');
		expect(result.totalCandidates).toBe(2);
		expect(result.totalPages).toBe(2);
		expect(result.items).toHaveLength(1);

		const topItem = result.items[0];
		expect(topItem.rank).toBe(1);
		expect(topItem.canonicalId).toBe('symbol:auth_crypto');
		expect(topItem.tokenAnchor).toBe('symbol:auth_crypto::src/auth_crypto.ts#entry#[100-250]');
		expect(topItem.moduleName).toBe('auth_crypto');
	});

	it('fails closed when workspace authorization grant is missing', () => {
		const row = makeRow('unauth', 0.8, 0.8);
		const packet = buildFeatureRowRpcPacketV1([row]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);

		expect(() =>
			buildPaginatedEngineeringRecommendationsV1({
				decodedPacket: decoded,
				profiles: [],
				domainQuery: 'Check unauthorized access',
				authorization: {
					actorId: 'unauth-user',
					workspaceGrantAdmitted: false,
				},
			}),
		).toThrow(/WORKSPACE_NOT_ADMITTED/);
	});

	it('recovers generative drift by mapping a drifting token back to the verified tokenAnchor', () => {
		const row = makeRow('audit_logger', 0.9, 0.85);
		const packet = buildFeatureRowRpcPacketV1([row]);
		const decoded = decodeFeatureRowRpcPacketV1(packet);

		const recs = buildPaginatedEngineeringRecommendationsV1({
			decodedPacket: decoded,
			profiles: [],
			domainQuery: 'Logging',
			authorization: {
				actorId: 'authorized-agent',
				workspaceGrantAdmitted: true,
			},
		});

		const recovery = resolveTokenAnchorRecoveryV1('audit_logger', recs);
		expect(recovery.recovered).toBe(true);
		expect(recovery.targetItem?.canonicalId).toBe('symbol:audit_logger');
		expect(recovery.suggestedAnchor).toContain('symbol:audit_logger');
	});
});
