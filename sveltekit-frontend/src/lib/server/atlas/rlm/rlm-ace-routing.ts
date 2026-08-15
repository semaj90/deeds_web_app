import {
  AcePrefetchHintV1Schema,
  RlmAceRoutingReceiptV1Schema,
  RlmNavigationDecisionV1Schema,
  RlmRoutingPrefillV1Schema,
  type AcePrefetchHintV1,
  type RlmAceRoutingReceiptV1,
  type RlmNavigationDecisionV1,
  type RlmRoutingPrefillV1,
} from './rlm-ace-routing-contract.js';

export interface RlmCandidateSeed {
  requestId: string;
  canonicalId: string;
  packetKey: string;
  symbolVersionId?: string | null;
  treeNodeId?: string | null;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  graphRevision: string;
  representationRevision: string;
  taskKind: string;
  semanticAffinity: number;
  lexicalAffinity: number;
  astAffinity: number;
  graphAuthority: number;
  executionUtility: number;
  domainAffinity: number;
  evidenceRefs?: string[];
}

export interface BuildRoutingPrefillInput {
  requestId: string;
  query: string;
  workspaceRevision: string;
  taskState?: string | null;
  som?: { x: number; y: number; revision: string } | null;
  centroidIds?: string[];
  cachedIntentState?: Record<string, unknown> | null;
  taskKind?: string;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
}

export function somNeighborhood(x: number, y: number, radius = 1): Array<{ x: number; y: number }> {
  const cells: Array<{ x: number; y: number }> = [];
  for (let dx = -radius; dx <= radius; dx += 1) {
    for (let dy = -radius; dy <= radius; dy += 1) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx > 19 || ny < 0 || ny > 19) continue;
      cells.push({ x: nx, y: ny });
    }
  }
  return cells;
}

function deriveHeads(query: string, taskKind = ''): RlmRoutingPrefillV1['activeHeads'] {
  const text = `${query} ${taskKind}`.toLowerCase();
  const heads = new Set<RlmRoutingPrefillV1['activeHeads'][number]>(['SEMANTIC', 'DOMAIN']);
  if (/error|fail|diagnostic|runtime|test|repair|fix|exception/.test(text)) heads.add('EXECUTION');
  if (/ast|symbol|type|call|caller|callee|function|class|tree[_ -]?node/.test(text)) heads.add('STRUCTURAL');
  if (/graph|pagerank|ppr|community|dependency|fanout/.test(text)) heads.add('GRAPH');
  if (/exact|name|literal|identifier|grep|lexical/.test(text)) heads.add('LEXICAL');
  if (/cache|warm|reuse|prefetch|memory|ace/.test(text)) heads.add('MEMORY');
  return [...heads];
}

export function buildRlmRoutingPrefill(input: BuildRoutingPrefillInput): RlmRoutingPrefillV1 {
  const activeHeads = deriveHeads(input.query, input.taskKind);
  const repairLike = activeHeads.includes('EXECUTION') && activeHeads.includes('STRUCTURAL');
  return RlmRoutingPrefillV1Schema.parse({
    schema: 'atlas.rlm.routing-prefill.v1',
    requestId: input.requestId,
    query: input.query,
    workspaceRevision: input.workspaceRevision,
    taskState: input.taskState ?? null,
    somCell: input.som ?? null,
    neighboringSomCells: input.som ? somNeighborhood(input.som.x, input.som.y) : [],
    centroidIds: input.centroidIds ?? [],
    cachedIntentState: input.cachedIntentState ?? null,
    activeHeads,
    fetchPolicy: {
      candidateK: repairLike ? 256 : 128,
      promotedK: repairLike ? 24 : 16,
      graphDepth: activeHeads.includes('GRAPH') ? 2 : 1,
      astDepth: activeHeads.includes('STRUCTURAL') ? 4 : 1,
      contextTokenBudget: repairLike ? 24_000 : 12_000,
    },
  });
}

export function deriveRlmNavigation(seed: RlmCandidateSeed): RlmNavigationDecisionV1 {
  const branches = new Set<RlmNavigationDecisionV1['branches'][number]>(['SOURCE']);
  const reasons: string[] = [];

  if (seed.treeNodeId || seed.astAffinity >= 0.55) {
    branches.add('AST');
    branches.add('CALLERS');
    reasons.push('STRUCTURAL_EVIDENCE_HIGH');
  }
  if (seed.executionUtility >= 0.45 || /error|repair|test|fix/i.test(seed.taskKind)) {
    branches.add('TESTS');
    branches.add('RUNTIME');
    reasons.push('EXECUTION_EVIDENCE_REQUIRED');
  }
  if (seed.graphAuthority >= 0.5) {
    branches.add('GRAPH');
    reasons.push('GRAPH_AUTHORITY_MATERIAL');
  }
  if (seed.semanticAffinity >= 0.65 && seed.lexicalAffinity < 0.35) {
    branches.add('DOCUMENTATION');
    reasons.push('SEMANTIC_WITH_LOW_LEXICAL_OVERLAP');
  }
  if (reasons.length === 0) reasons.push('SOURCE_CONFIRMATION_ONLY');

  const uncertainty = 1 - Math.max(
    clamp01(seed.semanticAffinity),
    clamp01(seed.lexicalAffinity),
    clamp01(seed.astAffinity),
    clamp01(seed.executionUtility),
  );

  return RlmNavigationDecisionV1Schema.parse({
    schema: 'atlas.rlm.navigation-decision.v1',
    requestId: seed.requestId,
    canonicalId: seed.canonicalId,
    packetKey: seed.packetKey,
    symbolVersionId: seed.symbolVersionId ?? null,
    treeNodeId: seed.treeNodeId ?? null,
    workspaceRevision: seed.workspaceRevision,
    sourceRevision: seed.sourceRevision,
    graphRevision: seed.graphRevision,
    branches: [...branches],
    recurse: branches.size >= 4 || uncertainty >= 0.45,
    reasonCodes: reasons,
    evidenceRefs: seed.evidenceRefs ?? [seed.sourceRef],
  });
}

function pushHint(hints: AcePrefetchHintV1[], seed: RlmCandidateSeed, input: Omit<AcePrefetchHintV1, 'schema' | 'requestId' | 'canonicalId' | 'packetKey' | 'symbolVersionId' | 'treeNodeId' | 'workspaceRevision' | 'sourceRevision' | 'representationRevision' | 'evidenceRefs'>): void {
  hints.push(AcePrefetchHintV1Schema.parse({
    schema: 'atlas.ace.prefetch-hint.v1',
    requestId: seed.requestId,
    canonicalId: seed.canonicalId,
    packetKey: seed.packetKey,
    symbolVersionId: seed.symbolVersionId ?? null,
    treeNodeId: seed.treeNodeId ?? null,
    workspaceRevision: seed.workspaceRevision,
    sourceRevision: seed.sourceRevision,
    representationRevision: seed.representationRevision,
    evidenceRefs: seed.evidenceRefs ?? [seed.sourceRef],
    ...input,
  }));
}

export function deriveAcePrefetchHints(seed: RlmCandidateSeed, navigation: RlmNavigationDecisionV1): AcePrefetchHintV1[] {
  const hints: AcePrefetchHintV1[] = [];
  const reuseUtility = clamp01(
    seed.semanticAffinity * 0.25 +
    seed.astAffinity * 0.25 +
    seed.graphAuthority * 0.15 +
    seed.domainAffinity * 0.1 +
    seed.executionUtility * 0.25,
  );

  pushHint(hints, seed, {
    objectKind: 'SEMANTIC_768',
    targetResidency: reuseUtility >= 0.7 ? 'HOT' : 'WARM',
    targetRepresentation: reuseUtility >= 0.7 ? 'FP16' : 'TURBO_4BIT',
    utility: reuseUtility,
    reason: 'RLM_SEMANTIC_SEED',
  });

  if (navigation.branches.includes('AST')) {
    pushHint(hints, seed, {
      objectKind: 'AST_SUBTREE',
      targetResidency: 'HOT',
      targetRepresentation: 'REFERENCE',
      utility: clamp01(Math.max(seed.astAffinity, 0.65)),
      reason: 'RLM_AST_EXPANSION_EXPECTED',
    });
  }
  if (navigation.branches.includes('CALLERS')) {
    pushHint(hints, seed, {
      objectKind: 'CALLER_NEIGHBORHOOD',
      targetResidency: 'WARM',
      targetRepresentation: 'REFERENCE',
      utility: clamp01((seed.astAffinity + seed.graphAuthority) / 2),
      reason: 'RLM_CALLER_EXPANSION_EXPECTED',
    });
  }
  if (navigation.branches.includes('TESTS')) {
    pushHint(hints, seed, {
      objectKind: 'TEST_PACKET',
      targetResidency: 'WARM',
      targetRepresentation: 'REFERENCE',
      utility: clamp01(Math.max(seed.executionUtility, 0.6)),
      reason: 'RLM_TEST_EVIDENCE_EXPECTED',
    });
  }
  pushHint(hints, seed, {
    objectKind: 'SOURCE_SPAN',
    targetResidency: 'WARM',
    targetRepresentation: 'REFERENCE',
    utility: clamp01(Math.max(seed.semanticAffinity, seed.astAffinity, 0.5)),
    reason: 'EXACT_PROMOTION_SOURCE_SPAN',
  });
  if (navigation.branches.includes('GRAPH')) {
    pushHint(hints, seed, {
      objectKind: 'GRAPH_NEIGHBORHOOD',
      targetResidency: 'WARM',
      targetRepresentation: 'REFERENCE',
      utility: clamp01(seed.graphAuthority),
      reason: 'RLM_GRAPH_EXPANSION_EXPECTED',
    });
  }

  return hints;
}

export function buildRlmAceRoutingReceipt(input: {
  routingPrefill: RlmRoutingPrefillV1;
  seeds: RlmCandidateSeed[];
  generatedAt?: string;
}): RlmAceRoutingReceiptV1 {
  const navigation = input.seeds.map(deriveRlmNavigation);
  const prefetchHints = input.seeds.flatMap((seed, index) => deriveAcePrefetchHints(seed, navigation[index]));
  return RlmAceRoutingReceiptV1Schema.parse({
    schema: 'atlas.rlm-ace.routing-receipt.v1',
    requestId: input.routingPrefill.requestId,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    routingPrefill: input.routingPrefill,
    navigation,
    prefetchHints,
    canonicalWrites: false,
    cacheWrites: false,
    notes: [
      'RLM decides what evidence to inspect next; ACE only predicts residency/prefetch.',
      'SOM cells and KMeans centroid IDs are routing hints, never ANN truth or fusion votes.',
      'This planner emits read-only hints; Valkey/BitFrost application and durable LOD receipts remain separate gates.',
    ],
  });
}
