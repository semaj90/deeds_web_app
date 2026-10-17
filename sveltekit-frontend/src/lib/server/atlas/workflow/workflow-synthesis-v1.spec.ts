import { describe, expect, it } from 'vitest';
import { synthesizeWorkflowDagV1 } from './workflow-synthesis-v1.js';
import type { RankedFunctionReceiptV1 } from '../ranking/ranked-function-receipt-v1.js';

describe('DAG-01: Typed Workflow Synthesis and Capability Checks', () => {
  const dummySha = 'sha256:' + 'a'.repeat(64);
  const workspaceRevision = 'sha256:' + 'b'.repeat(64);

  function createMockReceipt(overrides?: Partial<RankedFunctionReceiptV1>): RankedFunctionReceiptV1 {
    return {
      schema: 'atlas.ranked-function-receipt.v1',
      receiptId: 'rec_fn_1234567890abcdef',
      receiptChecksum: dummySha,
      queryText: 'validate legal deed packet',
      queryDigest: dummySha,
      modelId: 'fm_rank4_prod_v1',
      modelRevision: dummySha,
      workspaceRevision,
      graphRevision: null,
      rankedCandidates: [
        {
          rank: 1,
          candidateOrdinal: 0,
          packetKey: 'pkt_001',
          canonicalId: 'symbol:sym_validate_deed',
          symbolName: 'validateDeed',
          sourceRef: 'src/lib/server/deeds/validator.ts',
          sourceRevision: dummySha,
          features: [0.95, 0.8, 1.0, 0.9, 0.85, 0.7, 0.9, 1.0, 0.8, 1.0, 1.0, 0.95],
          score: 2.85,
          eligibilityMask: 3,
          featureLabels: ['AST_FUNCTION_DEFINED', 'UNIT_TEST_PASS'],
        },
        {
          rank: 2,
          candidateOrdinal: 2,
          packetKey: 'pkt_003',
          canonicalId: 'symbol:sym_parse_deed_xml',
          symbolName: 'parseDeedXml',
          sourceRef: 'src/lib/server/deeds/xml-parser.ts',
          sourceRevision: dummySha,
          features: [0.75, 0.7, 0.0, 0.85, 0.6, 0.5, 0.7, 0.8, 0.6, 1.0, 1.0, 0.7],
          score: 1.95,
          eligibilityMask: 3,
          featureLabels: ['AST_FUNCTION_DEFINED'],
        },
      ],
      totalCandidatesConsidered: 2,
      eligibleCandidatesCount: 2,
      topK: 2,
      featureNames: [
        'semantic_similarity',
        'bm25_lexical',
        'exact_symbol_match',
        'ast_signal',
        'authority_pagerank',
        'community_fit',
        'domain_fit',
        'feature_label_score',
        'dependency_depth',
        'test_coverage_status',
        'typecheck_status',
        'execution_utility',
      ],
      singleVoteInvariantEnforced: true,
      authorityCreated: false,
      writesPerformed: false,
      canonicalAuthority: false,
      ...overrides,
    };
  }

  it('synthesizes an acyclic, topologically ordered action DAG with verification step', () => {
    const receipt = createMockReceipt();
    const result = synthesizeWorkflowDagV1({
      taskGoal: 'Audit and repair deed validation pipeline',
      rankedReceipt: receipt,
      targetWorkspaceRevision: workspaceRevision,
      grantedPermissions: ['READ_ONLY', 'EXECUTE_TESTS'],
      includeVerificationStep: true,
    });

    expect(result.decision).toBe('ACCEPT');
    if (result.decision !== 'ACCEPT') return;

    expect(result.dag.schema).toBe('atlas.synthesized-workflow-dag.v1');
    expect(result.dag.actions.length).toBe(3); // 2 function actions + 1 verification action
    expect(result.dag.topologicalOrder.length).toBe(3);

    // Verification step is strictly last in topological order
    const lastActionId = result.dag.topologicalOrder[2];
    expect(lastActionId).toMatch(/^act_verify_/);

    // Architectural invariants
    expect(result.dag.writesPerformed).toBe(false);
    expect(result.dag.canonicalAuthority).toBe(false);
    expect(result.dag.dagChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('fails closed when caller lacks required execution permissions', () => {
    const receipt = createMockReceipt();
    // Only READ_ONLY granted, but verification step requires EXECUTE_TESTS
    const result = synthesizeWorkflowDagV1({
      taskGoal: 'Audit deed validation pipeline',
      rankedReceipt: receipt,
      targetWorkspaceRevision: workspaceRevision,
      grantedPermissions: ['READ_ONLY'],
      includeVerificationStep: true,
    });

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.rejectionReason).toBe('PERMISSION_DENIED');
      expect(result.message).toContain('EXECUTE_TESTS');
    }
  });

  it('rejects stale workspace revision mismatch', () => {
    const receipt = createMockReceipt();
    const staleRevision = 'sha256:' + '9'.repeat(64);

    const result = synthesizeWorkflowDagV1({
      taskGoal: 'Audit deed validation pipeline',
      rankedReceipt: receipt,
      targetWorkspaceRevision: staleRevision,
      grantedPermissions: ['READ_ONLY', 'EXECUTE_TESTS'],
    });

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.rejectionReason).toBe('STALE_WORKSPACE_REVISION');
    }
  });

  it('rejects receipt with empty candidates', () => {
    const emptyReceipt = createMockReceipt({
      rankedCandidates: [],
      eligibleCandidatesCount: 0,
    });

    const result = synthesizeWorkflowDagV1({
      taskGoal: 'Audit deed validation pipeline',
      rankedReceipt: emptyReceipt,
      targetWorkspaceRevision: workspaceRevision,
      grantedPermissions: ['READ_ONLY', 'EXECUTE_TESTS'],
    });

    expect(result.decision).toBe('REJECT');
    if (result.decision === 'REJECT') {
      expect(result.rejectionReason).toBe('EMPTY_CANDIDATE_LIST');
    }
  });
});
