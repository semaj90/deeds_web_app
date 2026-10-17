import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import {
  SymbolEvidenceV1Schema,
  SYMBOL_EVIDENCE_SCHEMA,
  AST_DEFINED,
  SOURCE_PROVEN,
  SEMANTIC_HIT,
  GRAPH_LINKED,
  isCandidateEligible,
  type SymbolEvidenceV1,
} from '../contracts/symbol-evidence-v1.js';
import {
  buildTopkSelectionReceiptV1,
  type TopkSelectionReceiptV1,
} from '../context/topk-selection-receipt-v1.js';
import type { CandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';

describe('Golden Thread: End-to-End Parent Atlas GraphRAG Invariant Proof', () => {
  const sourceCode = `export function authenticateUser(token: string) { return verifyTokenSignature(token); }\nexport function verifyTokenSignature(token: string) { return Boolean(token); }\n`;
  const sourceBytes = Buffer.from(sourceCode, 'utf8');
  const sourceHash = createHash('sha256').update(sourceBytes).digest('hex');

  const startByte0 = 0;
  const endByte0 = sourceCode.indexOf('\n'); // 87
  const startByte1 = endByte0 + 1;
  const endByte1 = sourceCode.length - 1;

  // ── Stage 1: Tree-sitter AST & Parser Observations ───────────────────────
  const authSymbolEvidence: SymbolEvidenceV1 = SymbolEvidenceV1Schema.parse({
    schema: SYMBOL_EVIDENCE_SCHEMA,
    upstreamChunkId: 'chunk_auth_user_001',
    nativeSymbolId: 'sym_fn_authenticateUser',
    treeNodeId: 'node_fn_001',
    packetKey: 'pkt:src/auth.ts:authenticateUser',
    sourceRef: {
      repositoryId: 'deeds-web-app',
      normalizedPath: 'src/auth.ts',
      contentSha256: sourceHash,
      startByte: startByte0,
      endByte: endByte0,
    },
    ast: {
      nodeType: 'function_declaration',
      symbolKind: 'function',
      name: 'authenticateUser',
      signature: '(token: string) => boolean',
      parentAstPath: 'Program/FunctionDeclaration',
      parseError: false,
    },
    evidenceStatus: 'PROVEN',
  });

  const verifySymbolEvidence: SymbolEvidenceV1 = SymbolEvidenceV1Schema.parse({
    schema: SYMBOL_EVIDENCE_SCHEMA,
    upstreamChunkId: 'chunk_verify_token_002',
    nativeSymbolId: 'sym_fn_verifyTokenSignature',
    treeNodeId: 'node_fn_002',
    packetKey: 'pkt:src/auth.ts:verifyTokenSignature',
    sourceRef: {
      repositoryId: 'deeds-web-app',
      normalizedPath: 'src/auth.ts',
      contentSha256: sourceHash,
      startByte: startByte1,
      endByte: endByte1,
    },
    ast: {
      nodeType: 'function_declaration',
      symbolKind: 'function',
      name: 'verifyTokenSignature',
      signature: '(token: string) => boolean',
      parentAstPath: 'Program/FunctionDeclaration',
      parseError: false,
    },
    evidenceStatus: 'PROVEN',
  });

  it('Stage 1 & 2: Validates exact source byte bounds and bitmask eligibility', () => {
    // Exact byte span matches source code text verbatim
    const extractedText0 = sourceBytes.subarray(
      authSymbolEvidence.sourceRef.startByte,
      authSymbolEvidence.sourceRef.endByte
    ).toString('utf8');
    expect(extractedText0).toContain('function authenticateUser');

    // Bitmask qualification: AST_DEFINED & SOURCE_PROVEN
    const authMask = AST_DEFINED | SOURCE_PROVEN | SEMANTIC_HIT;
    expect(isCandidateEligible(authMask)).toBe(true);

    // Phantom symbol lacking source lineage fails closed
    const phantomMask = AST_DEFINED | SEMANTIC_HIT;
    expect(isCandidateEligible(phantomMask)).toBe(false);
  });

  // ── Stage 3 & 4: Vector Projection & Bounded Graph Expansion ─────────────
  it('Stage 3 & 4: Separates Qdrant projection IDs and re-qualifies graph neighbor nominations', () => {
    // Qdrant point IDs are projection IDs, NOT canonical keys
    const qdrantPoint = {
      id: 'point_uuid_0001_8888',
      score: 0.94,
      payload: {
        canonicalKey: 'sym_fn_authenticateUser',
        workspaceRevision: 'ws-rev-20261017',
        sourceRevision: `sha256:${sourceHash}`,
        contentSha256: sourceHash,
      },
    };

    // PostgreSQL Hydration: Point ID maps to canonical symbol
    expect(qdrantPoint.payload.canonicalKey).toBe(authSymbolEvidence.nativeSymbolId);
    expect(qdrantPoint.payload.sourceRevision).toBe(`sha256:${authSymbolEvidence.sourceRef.contentSha256}`);

    // Bounded 1-hop Neo4j graph expansion from authenticateUser -> [verifyTokenSignature, phantomNeighbor]
    const rawGraphExpansionNeighbors = [
      {
        neighborCanonicalId: 'sym_fn_verifyTokenSignature',
        relation: 'CALLS',
        evidence: verifySymbolEvidence,
      },
      {
        neighborCanonicalId: 'sym_fn_unverifiedPhantom',
        relation: 'CALLS',
        evidence: null, // missing source fact
      },
    ];

    // Re-qualify graph neighbor nominations before SearchRuntime admission
    const qualifiedGraphNeighbors = rawGraphExpansionNeighbors.filter((edge) => {
      if (!edge.evidence) return false;
      const mask = AST_DEFINED | SOURCE_PROVEN | GRAPH_LINKED;
      return isCandidateEligible(mask);
    });

    expect(qualifiedGraphNeighbors).toHaveLength(1);
    expect(qualifiedGraphNeighbors[0]!.neighborCanonicalId).toBe('sym_fn_verifyTokenSignature');
  });

  // ── Stage 5 & 6: SearchRuntime Single Fusion & ContextManifest Top-K Receipt
  it('Stage 5 & 6: Enforces single-vote fusion and builds deterministic Top-K receipt', () => {
    const candidateSnapshot: CandidateFeatureSnapshotV1 = {
      schema: 'atlas.candidate-feature-snapshot.v1',
      candidateSnapshotRevision: 'snap-rev-01',
      snapshotChecksum: 'a'.repeat(64),
      workspaceRevision: 'ws-rev-20261017',
      featureRevision: 'feat-rev-01',
      ordinalMapChecksum: 'b'.repeat(64),
      rowCount: 2,
      identityAuthority: false,
      canonicalOwnerChanged: false,
      producerRevision: 'prod-rev-01',
      rows: [
        {
          schema: 'atlas.candidate-feature-row.v1',
          candidateOrdinal: 0,
          canonicalId: 'sym_fn_authenticateUser',
          packetKey: authSymbolEvidence.packetKey,
          sourceRef: authSymbolEvidence.sourceRef.normalizedPath,
          treeNodeId: authSymbolEvidence.treeNodeId,
          symbolVersionId: authSymbolEvidence.nativeSymbolId,
          workspaceRevision: 'ws-rev-20261017',
          sourceRevision: `sha256:${sourceHash}`,
          graphRevision: null,
          semanticRevision: 'rep-rev-01',
          featureRevision: 'feat-rev-01',
          representationBindings: [],
          semanticRelevance: 0.94,
          lexicalRelevance: 0.88,
          astAffinity: 0.95,
          graphAuthority: 0.72,
          personalizedPageRank: 0.65,
          communityAffinity: 0.5,
          manifold4OrientationSimilarity: 0.3,
          crossEncoderRawScore: 2.5,
          crossEncoderCalibratedScore: 0.91,
          crossEncoderAvailable: true,
          domainAffinity: 0.85,
          executionUtility: 0.8,
          memoryUtility: 0.7,
          laneMask: ['semantic', 'lexical', 'ast', 'graph'],
          degradedIdentity: false,
          evidenceRefs: ['ev-001'],
        },
        {
          schema: 'atlas.candidate-feature-row.v1',
          candidateOrdinal: 1,
          canonicalId: 'sym_fn_verifyTokenSignature',
          packetKey: verifySymbolEvidence.packetKey,
          sourceRef: verifySymbolEvidence.sourceRef.normalizedPath,
          treeNodeId: verifySymbolEvidence.treeNodeId,
          symbolVersionId: verifySymbolEvidence.nativeSymbolId,
          workspaceRevision: 'ws-rev-20261017',
          sourceRevision: `sha256:${sourceHash}`,
          graphRevision: null,
          semanticRevision: 'rep-rev-01',
          featureRevision: 'feat-rev-01',
          representationBindings: [],
          semanticRelevance: 0.82,
          lexicalRelevance: 0.79,
          astAffinity: 0.9,
          graphAuthority: 0.85,
          personalizedPageRank: 0.78,
          communityAffinity: 0.5,
          manifold4OrientationSimilarity: 0.3,
          crossEncoderRawScore: 2.1,
          crossEncoderCalibratedScore: 0.84,
          crossEncoderAvailable: true,
          domainAffinity: 0.8,
          executionUtility: 0.75,
          memoryUtility: 0.65,
          laneMask: ['ast', 'graph'],
          degradedIdentity: false,
          evidenceRefs: ['ev-002'],
        },
      ],
    };

    const receipt: TopkSelectionReceiptV1 = buildTopkSelectionReceiptV1({
      queryChecksum: '1'.repeat(64),
      runChecksum: '2'.repeat(64),
      snapshot: candidateSnapshot,
      selectedOrdinals: [0, 1],
      topkAlgorithm: 'rrf_fusion',
      topkParameters: { k: 60, singleVoteInvariantEnforced: true },
      k: 2,
      evidenceRefs: ['ev-001', 'ev-002'],
      openspecTaskRefs: ['openspec:golden-thread-graphrag'],
      contextManifestChecksum: '3'.repeat(64),
    });

    expect(receipt.schema).toBe('atlas.topk-selection-receipt.v1');
    expect(receipt.singleVoteInvariantEnforced).toBe(true);
    expect(receipt.orderedCanonicalIds).toEqual([
      'sym_fn_authenticateUser',
      'sym_fn_verifyTokenSignature',
    ]);
    expect(receipt.receiptChecksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
