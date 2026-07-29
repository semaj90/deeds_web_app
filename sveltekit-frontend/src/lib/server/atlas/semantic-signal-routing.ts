import {
  AtlasRecommendationV1Schema,
  ContinuityCheckpointV1Schema,
  LoopObservationV1Schema,
  QueryAnalysisV1Schema,
  RetrievalPlanV1Schema,
  RetrievalLaneSchema,
  SemanticSignalEvidenceRefSchema,
  SemanticSignalProofManifestV1Schema,
  TraversalBudgetV1Schema,
  type AtlasRecommendationV1,
  type ContinuityCheckpointV1,
  type DomainLabelScore,
  type LoopObservationV1,
  type QueryAnalysisV1,
  type RetrievalLane,
  type RetrievalPlanV1,
  type SemanticSignalEvidenceRef,
  type SemanticSignalProofManifestV1,
  type TraversalBudgetV1,
} from './contracts/semantic-signal-v1.js';
import { classifyDomainTaxonomy, type DomainClassification, type DomainTaxonomyInput } from './domain-taxonomy.js';

const SIGNAL_VERSION = 'atlas.semantic_signal.routing.v1';

export interface SemanticRoutingInput extends DomainTaxonomyInput {
  query: string;
  subjectId: string;
  workspaceId: string;
  workspaceRevision: string;
  producer: string;
  producerRevision: string;
  packetKey?: string;
  packetRevision?: string;
  evidenceRefs?: SemanticSignalEvidenceRef[];
  maxEvidenceRefs?: number;
  tokenBudget?: number;
  allowedFilters?: string[];
  acceptedDecisions?: string[];
  rejectedHypotheses?: string[];
  unresolvedQuestions?: string[];
  currentPlanStep?: string;
  requiredEvidenceIds?: string[];
  sourceRevision?: string;
  compactionCount?: number;
}

export interface SemanticRoutingObservationInput {
  state: LoopObservationV1['state'];
  tool: string;
  result: LoopObservationV1['result'];
  retries?: number;
  duplicateCalls?: number;
  retrievalCount?: number;
  rerankerMargin?: number | null;
  evidenceCoverage?: number;
  tokenPressure?: number;
  validationState?: LoopObservationV1['validation_state'];
  errorClass?: string | null;
  semanticDriftScore?: number;
  unsupportedClaimCount?: number;
  compactionEvents?: number;
  evidenceRefs?: SemanticSignalEvidenceRef[];
}

export interface SemanticSignalPacket {
  queryAnalysis: QueryAnalysisV1;
  retrievalPlan: RetrievalPlanV1;
  traversalBudget: TraversalBudgetV1;
  continuityCheckpoint: ContinuityCheckpointV1;
  loopObservation: LoopObservationV1;
  recommendation: AtlasRecommendationV1;
  proofManifest: SemanticSignalProofManifestV1;
  compactSummary: {
    signal_version: string;
    query: string;
    primary_domain: string | null;
    intents: Array<{ intent: string; score: number }>;
    lanes: RetrievalLane[];
    graph_limits: RetrievalPlanV1['graph_limits'];
    token_budget: number;
    evidence_count: number;
  };
}

function clampScore(value: number): number {
  if (Number.isNaN(value) || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function nowIso(): string {
  return new Date().toISOString();
}

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function buildFallbackEvidenceRef(input: SemanticRoutingInput): SemanticSignalEvidenceRef {
  return {
    source_ref: input.subjectId,
    content_hash: null,
    packet_key: input.packetKey ?? input.subjectId,
    tree_node_id: null,
    evidence_kind: 'routing_hint',
    note: `synthetic routing placeholder for ${input.producer}`,
  };
}

function ensureEvidenceRefs(input: SemanticRoutingInput): SemanticSignalEvidenceRef[] {
  return (input.evidenceRefs && input.evidenceRefs.length > 0 ? input.evidenceRefs : [buildFallbackEvidenceRef(input)]).map((ref) =>
    SemanticSignalEvidenceRefSchema.parse(ref),
  );
}

function tokenize(query: string): string[] {
  return query
    .split(/[^A-Za-z0-9_./:-]+/g)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractEntities(query: string): string[] {
  const tokens = tokenize(query);
  const quoted = Array.from(query.matchAll(/["'`]{1}([^"'`]{2,120})["'`]{1}/g)).map((match) => match[1]);
  const pathLike = tokens.filter((token) => /[\\/]/.test(token) || token.includes('.') || token.includes('::'));
  const symbolLike = tokens.filter((token) => /[A-Z_]{3,}/.test(token) || /[a-z][A-Z]/.test(token));
  return uniqueNonEmpty([...quoted, ...pathLike, ...symbolLike]).slice(0, 16);
}

function scoreIntents(query: string, classification: DomainClassification): Array<{ intent: string; score: number }> {
  const text = query.toLowerCase();
  const intents: Record<string, number> = {
    retrieval: 0,
    schema: 0,
    graph: 0,
    agent_orchestration: 0,
    cache: 0,
    debug: 0,
    ui: 0,
    ml: 0,
    provenance: 0,
  };

  const keywords: Record<keyof typeof intents, string[]> = {
    retrieval: ['search', 'retrieve', 'qdrant', 'vector', 'embedding', 'rerank', 'candidate', 'hybrid'],
    schema: ['schema', 'table', 'column', 'migration', 'drizzle', 'postgres', 'sql', 'ddl'],
    graph: ['graph', 'neo4j', 'community', 'pagerank', 'topology', 'edge', 'neighbor', 'traversal'],
    agent_orchestration: ['agent', 'workflow', 'mastra', 'mcp', 'acp', 'a2a', 'loop', 'state'],
    cache: ['redis', 'valkey', 'cache', 'bitfrost', 'ace', 'ttl'],
    debug: ['error', 'failed', 'timeout', 'crash', 'exception', 'trace'],
    ui: ['svelte', 'component', 'route', 'button', 'ui', 'frontend'],
    ml: ['model', 'embedding', 'classifier', 'pytorch', 'onnx', 'tensor', 'fine-tune', 'training'],
    provenance: ['hash', 'revision', 'evidence', 'provenance', 'lineage', 'packet', 'content_hash'],
  };

  for (const [intent, words] of Object.entries(keywords) as Array<[keyof typeof intents, string[]]>) {
    let score = 0;
    for (const word of words) {
      if (text.includes(word)) score += 1;
    }
    intents[intent] = score;
  }

  for (const domain of classification.labels) {
    if (domain.label in intents) {
      intents[domain.label as keyof typeof intents] = Math.max(intents[domain.label as keyof typeof intents], domain.score * 3);
    }
  }

  const ranked = Object.entries(intents)
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([intent, score]) => ({ intent, score: Number(clampScore(score / 5).toFixed(3)) }));

  if (ranked.length > 0) return ranked;
  return [{ intent: 'retrieval', score: 0.5 }];
}

function chooseRetrievalScope(query: string, entities: string[], classification: DomainClassification): QueryAnalysisV1['retrieval_scope'] {
  const text = query.toLowerCase();
  if (entities.some((entity) => entity.includes('/') || entity.includes('.'))) return 'file';
  if (/\bfunction\b|\bclass\b|\binterface\b|\btype\b|\bconst\b|\bexport\b/.test(text) || entities.length > 0) return 'single_symbol';
  if (classification.primary_domain === 'graph') return 'module';
  if (text.includes('workspace') || text.includes('corpus')) return 'workspace';
  return 'module';
}

function chooseLanes(analysis: QueryAnalysisV1): RetrievalLane[] {
  const lanes = new Set<RetrievalLane>(['dense']);
  const text = analysis.extracted_entities.join(' ').toLowerCase();
  const intentNames = analysis.intent_probabilities.map((item) => item.intent);

  if (intentNames.some((intent) => ['retrieval', 'schema', 'provenance'].includes(intent))) {
    lanes.add('sparse');
  }
  if (analysis.retrieval_scope === 'single_symbol' || text.length > 0) {
    lanes.add('symbol');
  }
  if (intentNames.some((intent) => ['schema', 'graph', 'agent_orchestration'].includes(intent))) {
    lanes.add('schema');
  }
  if (intentNames.some((intent) => ['graph', 'provenance'].includes(intent))) {
    lanes.add('graph');
  }
  if (analysis.retrieval_scope === 'workspace' || analysis.retrieval_scope === 'corpus') {
    lanes.add('temporal');
  }
  if (intentNames.some((intent) => ['provenance', 'debug'].includes(intent))) {
    lanes.add('provenance');
  }

  return [...lanes].slice(0, 8);
}

function buildCandidateLimits(lanes: RetrievalLane[], topK: number): RetrievalPlanV1['candidate_limits'] {
  const defaultLimit = Math.max(4, Math.min(24, Math.ceil(topK * 1.5)));
  const laneSet = new Set(lanes);
  const limitFor = (lane: RetrievalLane, fallback = 1) => (laneSet.has(lane) ? defaultLimit : fallback);

  return {
    dense: limitFor('dense', 8),
    sparse: limitFor('sparse', 8),
    symbol: limitFor('symbol', 6),
    schema: limitFor('schema', 6),
    graph: limitFor('graph', 6),
    temporal: limitFor('temporal', 4),
    web: limitFor('web', 1),
    provenance: limitFor('provenance', 6),
  };
}

function buildGraphLimits(analysis: QueryAnalysisV1): RetrievalPlanV1['graph_limits'] {
  const depth = analysis.requested_traversal_depth;
  return {
    max_seeds: Math.min(12, Math.max(1, analysis.recommended_lanes.includes('graph') ? 6 : 2)),
    max_hops: Math.min(3, Math.max(0, depth)),
    max_nodes: depth >= 2 ? 40 : 20,
    max_edges: depth >= 2 ? 80 : 30,
    max_returned_facts: depth >= 2 ? 20 : 8,
  };
}

function buildAllowedFilters(analysis: QueryAnalysisV1, extras: string[] = []): string[] {
  const filters = new Set<string>([
    'workspace_revision',
    'subject_id',
    'source_ref',
    'content_hash',
    'domain',
    'language',
    'kind',
    'artifact_kind',
    ...analysis.schema_hints,
    ...analysis.symbol_hints,
    ...extras,
  ]);
  return [...filters];
}

export function analyzeSemanticQuery(input: SemanticRoutingInput): QueryAnalysisV1 {
  const query = input.query.trim();
  const classification = classifyDomainTaxonomy({
    sourceRef: input.sourceRef ?? input.subjectId,
    featureId: input.featureId ?? input.subjectId,
    summary: query,
    title: input.title ?? query.slice(0, 120),
    symbol: input.symbol ?? null,
    imports: input.imports ?? [],
    routes: input.routes ?? [],
    schema: input.schema ?? [],
    dependencies: input.dependencies ?? [],
    neighbors: input.neighbors ?? [],
    metadata: input.metadata ?? [],
  });

  const entities = extractEntities(query);
  const intents = scoreIntents(query, classification);
  const schemaHints = uniqueNonEmpty([
    ...(input.schema ?? []),
    ...(query.toLowerCase().includes('schema') ? ['schema'] : []),
    ...(query.toLowerCase().includes('table') ? ['table'] : []),
    ...(query.toLowerCase().includes('column') ? ['column'] : []),
  ]);
  const symbolHints = uniqueNonEmpty([
    ...(input.symbol ? [input.symbol] : []),
    ...entities.filter((entity) => /[A-Z_]{3,}|[\\/]|::|[a-z][A-Z]/.test(entity)),
  ]);
  const errorHints = uniqueNonEmpty([
    ...(query.toLowerCase().includes('error') ? ['error'] : []),
    ...(query.toLowerCase().includes('failed') ? ['failed'] : []),
    ...(query.toLowerCase().includes('timeout') ? ['timeout'] : []),
  ]);

  const analysis = QueryAnalysisV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    signal_type: 'query_analysis',
    subject_id: input.subjectId,
    workspace_revision: input.workspaceRevision,
    producer: input.producer,
    producer_revision: input.producerRevision,
    evidence_refs: (input.evidenceRefs ?? []).map((ref) => SemanticSignalEvidenceRefSchema.parse(ref)),
    intent_probabilities: intents,
    domain_probabilities: classification.labels.map((label) => ({
      label: label.label,
      score: clampScore(label.score),
      source: label.source,
      evidence_kinds: label.evidence_kinds,
    })) satisfies DomainLabelScore[],
    extracted_entities: entities,
    requested_traversal_depth: Math.min(3, query.includes('?') ? 2 : 1 + Math.min(2, entities.length > 0 ? 1 : 0)),
    uncertainty: clampScore(1 - Math.max(intents[0]?.score ?? 0, classification.confidence ?? 0)),
    schema_hints: schemaHints,
    symbol_hints: symbolHints,
    error_hints: errorHints,
    retrieval_scope: chooseRetrievalScope(query, entities, classification),
    recommended_lanes: ['dense'] as RetrievalLane[],
    created_at: nowIso(),
  });

  return {
    ...analysis,
    recommended_lanes: chooseLanes(analysis),
  };
}

export function buildRetrievalPlanFromAnalysis(
  analysis: QueryAnalysisV1,
  options?: {
    tokenBudget?: number;
    allowedFilters?: string[];
    finalEvidenceLimit?: number;
  },
): RetrievalPlanV1 {
  const lanes = analysis.recommended_lanes;
  const candidate_limits = buildCandidateLimits(lanes, Math.max(4, Math.min(24, lanes.length * 4)));
  const graph_limits = buildGraphLimits(analysis);
  const rerank_limit = Math.min(50, Math.max(10, lanes.length * 8));

  return RetrievalPlanV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    signal_type: 'retrieval_plan',
    subject_id: analysis.subject_id,
    workspace_revision: analysis.workspace_revision,
    producer: analysis.producer,
    producer_revision: analysis.producer_revision,
    evidence_refs: analysis.evidence_refs,
    lanes,
    candidate_limits,
    graph_limits,
    rerank_limit,
    final_evidence_limit: options?.finalEvidenceLimit ?? Math.min(20, Math.max(8, lanes.length * 2)),
    token_budget: options?.tokenBudget ?? 8192,
    allowed_filters: buildAllowedFilters(analysis, options?.allowedFilters ?? []),
    provenance_required: true,
    created_at: nowIso(),
  });
}

export function buildTraversalBudgetFromAnalysis(
  analysis: QueryAnalysisV1,
  plan?: RetrievalPlanV1,
  tokenBudget = 8192,
): TraversalBudgetV1 {
  const effectivePlan = plan ?? buildRetrievalPlanFromAnalysis(analysis, { tokenBudget });
  return TraversalBudgetV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    signal_type: 'traversal_budget',
    subject_id: analysis.subject_id,
    workspace_revision: analysis.workspace_revision,
    producer: analysis.producer,
    producer_revision: analysis.producer_revision,
    evidence_refs: analysis.evidence_refs,
    max_seeds: effectivePlan.graph_limits.max_seeds,
    max_hops: effectivePlan.graph_limits.max_hops,
    max_nodes: effectivePlan.graph_limits.max_nodes,
    max_edges: effectivePlan.graph_limits.max_edges,
    max_returned_facts: effectivePlan.graph_limits.max_returned_facts,
    max_queries_per_round: analysis.recommended_lanes.includes('graph') ? 3 : 2,
    max_retrieval_rounds: analysis.retrieval_scope === 'corpus' ? 2 : 1,
    third_hop_requires_reason: true,
    token_budget: tokenBudget,
    created_at: nowIso(),
  });
}

export function buildLoopObservation(input: SemanticRoutingObservationInput & {
  subjectId: string;
  workspaceRevision: string;
  producer: string;
  producerRevision: string;
  evidenceRefs?: SemanticSignalEvidenceRef[];
}): LoopObservationV1 {
  return LoopObservationV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    signal_type: 'loop_observation',
    subject_id: input.subjectId,
    workspace_revision: input.workspaceRevision,
    producer: input.producer,
    producer_revision: input.producerRevision,
    evidence_refs: (input.evidenceRefs ?? []).map((ref) => SemanticSignalEvidenceRefSchema.parse(ref)),
    state: input.state,
    tool: input.tool,
    result: input.result,
    retries: input.retries ?? 0,
    duplicate_calls: input.duplicateCalls ?? 0,
    retrieval_count: input.retrievalCount ?? 0,
    reranker_margin: input.rerankerMargin ?? null,
    evidence_coverage: clampScore(input.evidenceCoverage ?? 0),
    token_pressure: clampScore(input.tokenPressure ?? 0),
    validation_state: input.validationState ?? 'WARN',
    error_class: input.errorClass ?? null,
    semantic_drift_score: clampScore(input.semanticDriftScore ?? 0),
    unsupported_claim_count: input.unsupportedClaimCount ?? 0,
    compaction_events: input.compactionEvents ?? 0,
    created_at: nowIso(),
  });
}

export function buildContinuityCheckpoint(input: SemanticRoutingInput & {
  activeGoal: string;
  currentPlanStep: string;
}): ContinuityCheckpointV1 {
  return ContinuityCheckpointV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    signal_type: 'continuity_checkpoint',
    subject_id: input.subjectId,
    workspace_revision: input.workspaceRevision,
    producer: input.producer,
    producer_revision: input.producerRevision,
    evidence_refs: (input.evidenceRefs ?? []).map((ref) => SemanticSignalEvidenceRefSchema.parse(ref)),
    active_goal: input.activeGoal,
    accepted_decisions: uniqueNonEmpty(input.acceptedDecisions ?? []),
    rejected_hypotheses: uniqueNonEmpty(input.rejectedHypotheses ?? []),
    unresolved_questions: uniqueNonEmpty(input.unresolvedQuestions ?? []),
    current_plan_step: input.currentPlanStep,
    authority_constraints: uniqueNonEmpty([
      'Postgres is canonical',
      'Qdrant and Neo4j are projections',
      'loop state is advisory',
    ]),
    required_evidence_ids: uniqueNonEmpty(input.requiredEvidenceIds ?? []),
    packet_revision: input.packetRevision ?? input.workspaceRevision,
    source_revision: input.sourceRevision ?? input.workspaceRevision,
    compaction_count: input.compactionCount ?? 0,
    created_at: nowIso(),
  });
}

export function buildRecommendationFromAnalysis(input: SemanticRoutingInput & {
  problem: string;
  proposedAction: string;
  validationCriteria: string[];
  rollbackPlan: string[];
  lifecycleState?: AtlasRecommendationV1['lifecycle_state'];
}): AtlasRecommendationV1 {
  return AtlasRecommendationV1Schema.parse({
    schema_version: 'atlas.recommendation.v1',
    signal_type: 'recommendation',
    recommendation_id: input.packetKey ?? `${input.subjectId}:${Date.now()}`,
    subject_id: input.subjectId,
    workspace_revision: input.workspaceRevision,
    producer: input.producer,
    producer_revision: input.producerRevision,
    problem: input.problem,
    proposed_action: input.proposedAction,
    evidence_refs: ensureEvidenceRefs(input),
    inference_confidence: 0.75,
    validation_plan: {
      criteria: uniqueNonEmpty(input.validationCriteria),
      rollback: uniqueNonEmpty(input.rollbackPlan),
    },
    lifecycle_state: input.lifecycleState ?? 'PROPOSED',
    created_at: nowIso(),
  });
}

export function buildSemanticSignalProofManifest(input: {
  runId: string;
  workspaceRevision: string;
  producer: string;
  producerRevision: string;
  status: SemanticSignalProofManifestV1['status'];
  subjectCount: number;
  acceptedSignals: number;
  rejectedSignals: number;
  evidenceRefs?: string[];
  proofNotes?: string[];
}): SemanticSignalProofManifestV1 {
  return SemanticSignalProofManifestV1Schema.parse({
    schema_version: 'atlas.semantic_signal.v1',
    run_id: input.runId,
    workspace_revision: input.workspaceRevision,
    producer: input.producer,
    producer_revision: input.producerRevision,
    status: input.status,
    subject_count: input.subjectCount,
    accepted_signals: input.acceptedSignals,
    rejected_signals: input.rejectedSignals,
    evidence_refs: input.evidenceRefs ?? [],
    proof_notes: input.proofNotes ?? [],
    created_at: nowIso(),
  });
}

export function buildSemanticSignalPacket(input: SemanticRoutingInput & {
  activeGoal: string;
  currentPlanStep: string;
  problem?: string;
  proposedAction?: string;
  validationCriteria?: string[];
  rollbackPlan?: string[];
  status?: SemanticSignalProofManifestV1['status'];
  loopState?: LoopObservationV1['state'];
  loopTool?: string;
  loopResult?: LoopObservationV1['result'];
  loopEvidenceCoverage?: number;
  loopTokenPressure?: number;
}): SemanticSignalPacket {
  const queryAnalysis = analyzeSemanticQuery(input);
  const retrievalPlan = buildRetrievalPlanFromAnalysis(queryAnalysis, {
    tokenBudget: input.tokenBudget,
    allowedFilters: input.allowedFilters,
  });
  const traversalBudget = buildTraversalBudgetFromAnalysis(queryAnalysis, retrievalPlan, input.tokenBudget ?? 8192);
  const continuityCheckpoint = buildContinuityCheckpoint({
    ...input,
    packetRevision: input.packetRevision ?? input.workspaceRevision,
  });
  const signalEvidenceRefs = ensureEvidenceRefs(input);
  const loopObservation = buildLoopObservation({
    state: input.loopState ?? 'PLAN',
    tool: input.loopTool ?? 'atlas.inspect_runtime',
    result: input.loopResult ?? 'PASS',
    evidenceCoverage: input.loopEvidenceCoverage ?? 0,
    tokenPressure: input.loopTokenPressure ?? 0,
    subjectId: input.subjectId,
    workspaceRevision: input.workspaceRevision,
    producer: input.producer,
    producerRevision: input.producerRevision,
    evidenceRefs: signalEvidenceRefs,
  });
  const recommendation = buildRecommendationFromAnalysis({
    ...input,
    evidenceRefs: signalEvidenceRefs,
    problem: input.problem ?? 'No problem specified',
    proposedAction: input.proposedAction ?? 'Maintain the current canonical flow',
    validationCriteria: input.validationCriteria ?? ['evidence-backed', 'bounded', 'reversible'],
    rollbackPlan: input.rollbackPlan ?? ['revert routing plan', 'keep canonical Postgres authority'],
  });
  const proofManifest = buildSemanticSignalProofManifest({
    runId: input.packetKey ?? input.subjectId,
    workspaceRevision: input.workspaceRevision,
    producer: input.producer,
    producerRevision: input.producerRevision,
    status: input.status ?? 'RUNTIME_PROOF_PENDING',
    subjectCount: 1,
    acceptedSignals: 1,
    rejectedSignals: 0,
    evidenceRefs: signalEvidenceRefs.map((ref) => ref.source_ref),
    proofNotes: ['compact signal packet produced'],
  });

  return {
    queryAnalysis,
    retrievalPlan,
    traversalBudget,
    continuityCheckpoint,
    loopObservation,
    recommendation,
    proofManifest,
    compactSummary: {
      signal_version: SIGNAL_VERSION,
      query: input.query,
      primary_domain: queryAnalysis.domain_probabilities[0]?.label ?? null,
      intents: queryAnalysis.intent_probabilities,
      lanes: retrievalPlan.lanes,
      graph_limits: retrievalPlan.graph_limits,
      token_budget: retrievalPlan.token_budget,
      evidence_count: queryAnalysis.evidence_refs.length,
    },
  };
}
