import { describe, expect, it } from 'vitest';
import {
  buildRlmAceRoutingReceipt,
  buildRlmRoutingPrefill,
  deriveAcePrefetchHints,
  deriveRlmNavigation,
  somNeighborhood,
} from './rlm-ace-routing.js';

const seed = {
  requestId: 'req:1',
  canonicalId: 'symbol:canonical:1',
  packetKey: 'packet:1',
  symbolVersionId: 'S331',
  treeNodeId: 'T8421',
  sourceRef: 'src/foo.ts#L10-L20',
  workspaceRevision: 'workspace:r1',
  sourceRevision: 'source:r1',
  graphRevision: 'graph:r1',
  representationRevision: 'semantic_768:r1',
  taskKind: 'error_fix',
  semanticAffinity: 0.91,
  lexicalAffinity: 0.34,
  astAffinity: 0.82,
  graphAuthority: 0.63,
  executionUtility: 0.76,
  domainAffinity: 0.7,
  evidenceRefs: ['src/foo.ts#L10-L20'],
} as const;

describe('RLM + ACE routing', () => {
  it('keeps the 20x20 SOM as bounded routing metadata', () => {
    const cells = somNeighborhood(12, 7);
    expect(cells).toContainEqual({ x: 12, y: 7 });
    expect(cells).toContainEqual({ x: 11, y: 7 });
    expect(cells).toContainEqual({ x: 13, y: 8 });
    expect(cells).toHaveLength(9);
  });

  it('derives repair-oriented heads and bounded fetch policy', () => {
    const prefill = buildRlmRoutingPrefill({
      requestId: 'req:1',
      query: 'fix the parser error at tree_node_id T8421 and inspect callers/tests',
      workspaceRevision: 'workspace:r1',
      taskKind: 'error_fix',
      som: { x: 12, y: 7, revision: 'som:20x20:r1' },
      centroidIds: ['kmeans:17', 'kmeans:22'],
    });
    expect(prefill.activeHeads).toContain('STRUCTURAL');
    expect(prefill.activeHeads).toContain('EXECUTION');
    expect(prefill.fetchPolicy.candidateK).toBe(256);
    expect(prefill.fetchPolicy.promotedK).toBe(24);
  });

  it('lets RLM choose evidence branches while ACE only emits warm/hot hints', () => {
    const navigation = deriveRlmNavigation(seed);
    expect(navigation.branches).toEqual(expect.arrayContaining(['AST', 'CALLERS', 'TESTS', 'RUNTIME', 'GRAPH', 'SOURCE']));
    const hints = deriveAcePrefetchHints(seed, navigation);
    expect(hints.map((hint) => hint.objectKind)).toEqual(expect.arrayContaining([
      'SEMANTIC_768',
      'AST_SUBTREE',
      'CALLER_NEIGHBORHOOD',
      'TEST_PACKET',
      'SOURCE_SPAN',
      'GRAPH_NEIGHBORHOOD',
    ]));
    expect(hints.every((hint) => hint.targetResidency === 'WARM' || hint.targetResidency === 'HOT')).toBe(true);
  });

  it('emits a read-only routing receipt', () => {
    const routingPrefill = buildRlmRoutingPrefill({
      requestId: 'req:1',
      query: 'fix parser error',
      workspaceRevision: 'workspace:r1',
      taskKind: 'error_fix',
      som: { x: 12, y: 7, revision: 'som:20x20:r1' },
    });
    const receipt = buildRlmAceRoutingReceipt({ routingPrefill, seeds: [seed] });
    expect(receipt.canonicalWrites).toBe(false);
    expect(receipt.cacheWrites).toBe(false);
    expect(receipt.navigation).toHaveLength(1);
    expect(receipt.prefetchHints.length).toBeGreaterThan(0);
  });
});
