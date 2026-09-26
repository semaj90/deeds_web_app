/** Pure, conservative mapping from OpenSpec task records to the ordered Atlas program. */
// Legacy workstream buckets remain for compatibility/report display only. They are not dependency edges.
export const PROGRAM_WAVES = [
  { id: 0, title: 'Authority and lineage', milestone: 'M0', exitGate: 'SOURCE_AUTHORITY_AND_LINEAGE', dependsOnWaveIds: [] },
  { id: 1, title: 'Identity and source qualification', milestone: 'M0', exitGate: 'IDENTITY_AUTHORITY_PROVEN', dependsOnWaveIds: [] },
  { id: 2, title: 'Packet and chunk lineage', milestone: 'M0', exitGate: 'REVISION_QUALIFIED_PACKET_CHUNK_READBACK', dependsOnWaveIds: [] },
  { id: 3, title: 'Canonical ingestion and index fabric', milestone: 'M1', exitGate: 'CANONICAL_ROWS_AND_READBACK', dependsOnWaveIds: [] },
  { id: 4, title: 'Retrieval lane convergence', milestone: 'M1', exitGate: 'RETRIEVAL_LANES_CANONICAL', dependsOnWaveIds: [] },
  { id: 5, title: 'Candidate features and matrices', milestone: 'M2', exitGate: 'FEATURE_MATRIX_REVISION_QUALIFIED', dependsOnWaveIds: [] },
  { id: 6, title: 'Adaptive DAG and ContextManifest', milestone: 'M2', exitGate: 'CONTEXT_MANIFEST_BOUND', dependsOnWaveIds: [] },
  { id: 7, title: 'Acceleration', milestone: 'M6', exitGate: 'PARITY_BEFORE_PERFORMANCE', dependsOnWaveIds: [] },
  { id: 8, title: 'LDR and validation', milestone: 'M3', exitGate: 'LDR_VALIDATION_PROVEN', dependsOnWaveIds: [] },
  { id: 9, title: 'Projections and executors', milestone: 'M4', exitGate: 'EXECUTOR_PARITY_PROVEN', dependsOnWaveIds: [] },
  { id: 10, title: 'Learning and challengers', milestone: 'M5', exitGate: 'FROZEN_EVAL_AND_EXPLICIT_PROMOTION', dependsOnWaveIds: [] },
];

export const PROGRAM_MILESTONES = [
  { id: 'M0', name: 'Authority and lineage', outcome: 'Source/file/symbol/packet identity is revision-qualified; canonical joins never infer latest, unknown, or path-only identity.', exitCondition: 'No inferred/latest/path-only canonical joins.', waves: [0, 1, 2] },
  { id: 'M1', name: 'Canonical retrieval', outcome: 'Lexical and exact semantic retrieval operate on canonical rows.', exitCondition: 'Exact retrieval and readback proven.', waves: [3, 4] },
  { id: 'M2', name: 'Feature and context', outcome: 'Feature matrices, structural evidence, ContextManifest, and ACE inputs are identity-bound.', exitCondition: 'Immutable, revision-qualified context artifacts.', waves: [5, 6] },
  { id: 'M3', name: 'LDR and validation', outcome: 'Local-first research composes evidence envelopes, context manifests, and validation receipts.', exitCondition: 'EvidenceEnvelope to ContextManifest to ResearchReceipt proven.', waves: [8] },
  { id: 'M4', name: 'Projections and executors', outcome: 'Qdrant, cuVS, CAGRA, IVF-PQ, Neo4j, and cuGraph remain rebuildable projections/executors.', exitCondition: 'Parity against canonical oracles.', waves: [9] },
  { id: 'M5', name: 'Learning challengers', outcome: 'Learned ranking and policy remain offline challengers.', exitCondition: 'Evaluation receipt and explicit promotion decision.', waves: [10] },
  { id: 'M6', name: 'Acceleration', outcome: 'TensorRT, TurboVec, simdjson, and QUIC accelerate execution only.', exitCondition: 'Parity before performance.', waves: [7] },
];

// Stable, provisional domain taxonomy. It classifies work only; it never asserts runtime ownership.
export const PROGRAM_DOMAINS = [
  ['CONTROL_PLANE', 'Control plane and ownership', 'M0', 'CONTROL_PLANE', 'CROSS_CORPUS_CONTROL', /workboard|openspec|manual-migration|branch-merge|route-import|deep-audit-code-gates/],
  ['SOURCE_AUTHORITY', 'Source authority and lineage', 'M0', 'LINEAGE', 'CODEBASE_PACKET', /retrieval-lineage|gate2-chunk-lineage|graphify-recovery|unordered-execution/],
  ['PACKET_INGESTION', 'Packet identity and canonical ingestion', 'M0', 'AUTHORITY', 'CODEBASE_PACKET', /code-ingestion|canonical-directory|chunk-index|error-embedding/],
  ['COMPILER_SYMBOLS', 'Compiler, AST, and symbol identity', 'M0', 'AUTHORITY', 'CODEBASE_PACKET', /compiler-semantic-graph|graph-validation|nlp-sidecar/],
  ['CODE_RETRIEVAL', 'Codebase retrieval', 'M1', 'CODE_RETRIEVAL', 'CODEBASE_PACKET', /retrieval-executor-compatibility|retrieval-logic-convergence|rrf-fusion|retrieval-fusion-reachability|search-classifier/],
  ['EXTERNAL_DOCS', 'External-document corpus', 'M1', 'DOC_RETRIEVAL', 'EXTERNAL_DOCUMENT', /deep-research-ingestion|document-governance|versioned-doc-intelligence/],
  ['ONTOLOGY_OKF', 'Ontology and OKF knowledge layers', 'M1', 'CODE_RETRIEVAL', 'CROSS_CORPUS_CONTROL', /okf-knowledge|ontology|grounded-knowledge/],
  ['GRAPH_RETRIEVAL', 'Graph analysis and retrieval', 'M1', 'CODE_RETRIEVAL', 'CODEBASE_PACKET', /graph-analysis|graph-retrieval|graph-runtime|graph-pagerank/],
  ['PROJECTION_EXECUTORS', 'Graph and vector projections', 'M4', 'PROJECTION', 'CODEBASE_PACKET', /qdrant-structural|gpu-graph-vector|topology-representation/],
  ['FEATURE_CONTEXT', 'Candidate features and context evidence', 'M2', 'FEATURE_CONTEXT', 'CODEBASE_PACKET', /candidate-feature|atlas-feature-intelligence|telemetry-lowrank|workstation-domain-classifier|repair-candidate-feature/],
  ['RANKING_RECOMMENDATION', 'Ranking and recommendations', 'M5', 'LEARNING', 'CODEBASE_PACKET', /best-fit-score|compute-rank-cache|xgboost-cuda/],
  ['ADAPTIVE_DAG', 'Adaptive DAG and query routing', 'M2', 'FEATURE_CONTEXT', 'CROSS_CORPUS_CONTROL', /adaptive-dag|query-routing-classifier|policy-routing/],
  ['PREFILL_CONTEXT', 'Prefill and context assembly', 'M2', 'FEATURE_CONTEXT', 'CROSS_CORPUS_CONTROL', /neural-prefill|pass-fabric|prefill-routing|opencode-replay/],
  ['ACE_MEMORY', 'ACE, memory, and cache', 'M2', 'CACHE_RESIDENCY', 'CROSS_CORPUS_CONTROL', /ace-bitfrost|ace-rlm|memory-architecture|kv-cache|agent-branch-review/],
  ['RESIDENCY_RUNTIME', 'Residency and local model runtime', 'M6', 'ACCELERATOR', 'CROSS_CORPUS_CONTROL', /local-llm-offload|tensor-residency|retrieval-lod/],
  ['LDR_VALIDATION', 'Local-first research and validation', 'M3', 'LDR_VALIDATION', 'EXTERNAL_DOCUMENT', /versioned-doc|deep-research|document-governance/],
  ['AGENT_REPAIR', 'Agentic repair', 'M2', 'AGENT_EXECUTION', 'CODEBASE_PACKET', /agentic-repair/],
  ['AGENT_EXECUTION', 'Agentic execution and compiler', 'M2', 'AGENT_EXECUTION', 'CODEBASE_PACKET', /agentic-completion|agentic-file-compiler|agentic-run-receipt/],
  ['ORNITH_ANALYSIS', 'Ornith analysis adapter', 'M2', 'AGENT_EXECUTION', 'CROSS_CORPUS_CONTROL', /analysis-pass-ornith/],
  ['NATIVE_ACCELERATION', 'Native acceleration and ABI', 'M6', 'ACCELERATOR', 'CROSS_CORPUS_CONTROL', /native-acceleration|gpu-runtime-abi|gpu-sidecar-patch/],
  ['GPU_EXECUTORS', 'GPU retrieval executors', 'M4', 'EXECUTOR', 'CODEBASE_PACKET', /gpu-prellm|gpu-runtime|gpu-graph-vector/],
  ['GOVERNED_COMPUTE', 'Governed compute fabric', 'M6', 'ACCELERATOR', 'CROSS_CORPUS_CONTROL', /governed-compute/],
  ['EVALUATION_LEARNING', 'Evaluation and offline learning', 'M5', 'LEARNING', 'CROSS_CORPUS_CONTROL', /compute-rank-cache-eval|workstation-domain-classifier/],
  ['TRANSPORT_EVENTS', 'Transport and observation boundaries', 'M0', 'CONTROL_PLANE', 'CROSS_CORPUS_CONTROL', /observation-routing|transport-memory/],
  ['SEMANTIC_REPRESENTATION', 'Semantic representation contracts', 'M1', 'CODE_RETRIEVAL', 'CODEBASE_PACKET', /semantic-512|semantic-768|onnx-webgpu|pca-svd/],
];

// Program tags describe architectural function, not runtime proof or promotion readiness.
export const PROGRAM_AUTHORITY_ROLES = Object.freeze({
  CONTROL_PLANE: 'EVIDENCE', SOURCE_AUTHORITY: 'OWNER', PACKET_INGESTION: 'OWNER',
  COMPILER_SYMBOLS: 'EVIDENCE', CODE_RETRIEVAL: 'EXECUTOR', EXTERNAL_DOCS: 'EVIDENCE',
  ONTOLOGY_OKF: 'EVIDENCE', GRAPH_RETRIEVAL: 'PROJECTION', PROJECTION_EXECUTORS: 'PROJECTION',
  FEATURE_CONTEXT: 'EVIDENCE', RANKING_RECOMMENDATION: 'POLICY', ADAPTIVE_DAG: 'POLICY',
  PREFILL_CONTEXT: 'EVIDENCE', ACE_MEMORY: 'CACHE', RESIDENCY_RUNTIME: 'EXECUTOR',
  LDR_VALIDATION: 'EVIDENCE', AGENT_REPAIR: 'EXECUTOR', AGENT_EXECUTION: 'EXECUTOR',
  ORNITH_ANALYSIS: 'EXECUTOR', NATIVE_ACCELERATION: 'EXECUTOR', GPU_EXECUTORS: 'EXECUTOR',
  GOVERNED_COMPUTE: 'POLICY', EVALUATION_LEARNING: 'POLICY', TRANSPORT_EVENTS: 'TRANSPORT',
  SEMANTIC_REPRESENTATION: 'REPRESENTATION',
});
export const OWNERSHIP_ROLE_VALUES = Object.freeze(['OWNER', 'REPRESENTATION', 'EXECUTOR', 'PROJECTION', 'TRANSPORT', 'CACHE', 'POLICY', 'EVIDENCE']);

// Named prerequisite gates are the dependency authority. Milestone order is organizational only.
export const ARCHITECTURE_GATES = [
  { id: 'SOURCE_AUTHORITY_PROVEN', milestone: 'M0', corpus: 'CODEBASE_PACKET', dependsOnGateIds: [] },
  { id: 'PACKET_LINEAGE_PROVEN', milestone: 'M0', corpus: 'CODEBASE_PACKET', dependsOnGateIds: ['SOURCE_AUTHORITY_PROVEN'] },
  { id: 'CANONICAL_CODE_RETRIEVAL', milestone: 'M1', corpus: 'CODEBASE_PACKET', dependsOnGateIds: ['PACKET_LINEAGE_PROVEN'] },
  { id: 'CANDIDATE_FEATURE_MATRIX', milestone: 'M2', corpus: 'CODEBASE_PACKET', dependsOnGateIds: ['CANONICAL_CODE_RETRIEVAL'] },
  { id: 'CONTEXT_MANIFEST', milestone: 'M2', corpus: 'CROSS_CORPUS_CONTROL', dependsOnGateIds: ['CANDIDATE_FEATURE_MATRIX'] },
  { id: 'EXTERNAL_DOC_CANONICAL_ROWS', milestone: 'M1', corpus: 'EXTERNAL_DOCUMENT', dependsOnGateIds: [] },
  { id: 'EXTERNAL_DOC_SEMANTIC_768_FROZEN', milestone: 'M1', corpus: 'EXTERNAL_DOCUMENT', dependsOnGateIds: ['EXTERNAL_DOC_CANONICAL_ROWS'] },
  { id: 'DOC_EXACT_ORACLE', milestone: 'M1', corpus: 'EXTERNAL_DOCUMENT', dependsOnGateIds: ['EXTERNAL_DOC_CANONICAL_ROWS', 'EXTERNAL_DOC_SEMANTIC_768_FROZEN'] },
  { id: 'DOC_HNSW_PARITY', milestone: 'M1', corpus: 'EXTERNAL_DOCUMENT', dependsOnGateIds: ['DOC_EXACT_ORACLE'] },
  { id: 'LDR_LOCAL_FIRST', milestone: 'M3', corpus: 'EXTERNAL_DOCUMENT', dependsOnGateIds: ['DOC_HNSW_PARITY'] },
  { id: 'CANONICAL_EXACT_ORACLE', milestone: 'M1', corpus: 'CROSS_CORPUS_CONTROL', dependsOnGateIds: ['CANONICAL_CODE_RETRIEVAL'] },
  { id: 'QDRANT_PROJECTION', milestone: 'M4', corpus: 'CROSS_CORPUS_CONTROL', dependsOnGateIds: ['CANONICAL_EXACT_ORACLE'] },
  { id: 'CUVS_CAGRA_IVFPQ_PARITY', milestone: 'M4', corpus: 'CROSS_CORPUS_CONTROL', dependsOnGateIds: ['CANONICAL_EXACT_ORACLE'] },
  { id: 'FROZEN_FEATURE_MATRIX', milestone: 'M2', corpus: 'CODEBASE_PACKET', dependsOnGateIds: ['CANDIDATE_FEATURE_MATRIX'] },
  { id: 'LEARNED_RERANKER_CHALLENGER', milestone: 'M5', corpus: 'CODEBASE_PACKET', dependsOnGateIds: ['FROZEN_FEATURE_MATRIX'] },
  { id: 'FROZEN_EXECUTOR_CONTRACT', milestone: 'M4', corpus: 'CROSS_CORPUS_CONTROL', dependsOnGateIds: ['CANONICAL_EXACT_ORACLE'] },
  { id: 'ACCELERATOR_CHALLENGER', milestone: 'M6', corpus: 'CROSS_CORPUS_CONTROL', dependsOnGateIds: ['FROZEN_EXECUTOR_CONTRACT'] },
];

export const OWNERSHIP_BOUNDARIES = [
  { domain: 'SOURCE_IDENTITY', authorityKind: 'OWNER', authorityRole: 'OWNER', canonicalOwner: 'source authority / registry', representation: null, executor: null, transport: null },
  { domain: 'PACKET_IDENTITY', authorityKind: 'OWNER', authorityRole: 'OWNER', canonicalOwner: 'PostgreSQL packet identity owner', representation: null, executor: null, transport: null },
  { domain: 'SEMANTIC_CODE', authorityKind: 'REPRESENTATION', authorityRole: 'REPRESENTATION', canonicalOwner: 'PostgreSQL canonical rows', representation: 'semantic_768', executor: null, transport: null },
  { domain: 'QDRANT', authorityKind: 'PROJECTION', authorityRole: 'PROJECTION', canonicalOwner: 'PostgreSQL canonical rows', representation: null, executor: 'Qdrant', transport: null },
  { domain: 'CUVS_CAGRA', authorityKind: 'EXECUTOR', authorityRole: 'EXECUTOR', canonicalOwner: 'PostgreSQL canonical rows', representation: null, executor: 'cuVS / CAGRA', transport: null },
  { domain: 'NEO4J_CUGRAPH', authorityKind: 'PROJECTION', authorityRole: 'PROJECTION', canonicalOwner: 'PostgreSQL canonical rows', representation: null, executor: 'Neo4j / cuGraph', transport: null },
  { domain: 'ACE_BITFROST_VALKEY', authorityKind: 'CACHE_RESIDENCY', authorityRole: 'CACHE', canonicalOwner: 'PostgreSQL canonical rows', representation: null, executor: 'ACE / BitFrost / Valkey', transport: null },
  { domain: 'NATS_RABBITMQ_GRPC', authorityKind: 'TRANSPORT', authorityRole: 'TRANSPORT', canonicalOwner: 'PostgreSQL control state', representation: null, executor: null, transport: 'NATS / RabbitMQ / gRPC' },
  { domain: 'ORNITH', authorityKind: 'SYNTHESIS_EXECUTOR', authorityRole: 'EXECUTOR', canonicalOwner: 'evidence envelope / context manifest', representation: null, executor: 'Ornith', transport: null },
];

export const EVENT_OWNERSHIP_RULES = [
  { eventType: 'WorkCommand', rule: 'REQUESTS_MUTATION_BUT_CANNOT_PROVE_MUTATION' },
  { eventType: 'IntegrationEvent', rule: 'ANNOUNCES_COMMITTED_CANONICAL_CHANGE_BUT_CANNOT_CREATE_TRUTH' },
  { eventType: 'FailureObservation', rule: 'RECORDS_EVIDENCE_BUT_CANNOT_RETRY_AUTONOMOUSLY' },
  { eventType: 'RecommendationSignal', rule: 'NEVER_CHANGES_POLICY' },
  { eventType: 'PolicyDecisionReceipt', rule: 'RECORDS_EXPLICIT_DECISION' },
  { eventType: 'CheckpointCommit', rule: 'FREEZES_ALREADY_DEFINED_POPULATION_IDENTITY_AND_CHECKSUM' },
];

export const EVENT_PLANE_OWNERSHIP = [
  { plane: 'CONTROL_STATE', owner: 'PostgreSQL', status: 'CANONICAL_CONTROL_STATE' },
  { plane: 'COMMAND_DISPATCH', owner: 'RabbitMQ', status: 'ONLY_WHERE_ACTUALLY_WIRED' },
  { plane: 'OBSERVABILITY_SHADOW_EVENTS', owner: 'NATS / JetStream', status: 'NON_AUTHORITATIVE' },
  { plane: 'HOT_RESIDENCY_LEASES', owner: 'Valkey / BitFrost / ACE', status: 'DISPOSABLE_DERIVED_STATE' },
  { plane: 'BATCH_REPRESENTATION', owner: 'Arrow / mmap', status: 'DERIVED_ARTIFACT' },
  { plane: 'SIDECAR_TRANSPORT', owner: 'gRPC / Protobuf', status: 'TRANSPORT_ONLY' },
];

export const PROGRAM_GATE_REQUIREMENTS = {
  SOURCE_AUTHORITY: ['SOURCE_AUTHORITY_PROVEN'], PACKET_INGESTION: ['PACKET_LINEAGE_PROVEN'],
  COMPILER_SYMBOLS: ['PACKET_LINEAGE_PROVEN'], CODE_RETRIEVAL: ['CANONICAL_CODE_RETRIEVAL'],
  EXTERNAL_DOCS: ['EXTERNAL_DOC_CANONICAL_ROWS'], LDR_VALIDATION: ['LDR_LOCAL_FIRST'],
  FEATURE_CONTEXT: ['CANDIDATE_FEATURE_MATRIX'], PREFILL_CONTEXT: ['CONTEXT_MANIFEST'],
  PROJECTION_EXECUTORS: ['QDRANT_PROJECTION', 'CUVS_CAGRA_IVFPQ_PARITY'], GPU_EXECUTORS: ['CUVS_CAGRA_IVFPQ_PARITY'],
  RANKING_RECOMMENDATION: ['LEARNED_RERANKER_CHALLENGER'], EVALUATION_LEARNING: ['FROZEN_FEATURE_MATRIX'],
  RESIDENCY_RUNTIME: ['FROZEN_EXECUTOR_CONTRACT'], NATIVE_ACCELERATION: ['FROZEN_EXECUTOR_CONTRACT'],
  GOVERNED_COMPUTE: ['FROZEN_EXECUTOR_CONTRACT'], GRAPH_RETRIEVAL: ['CANONICAL_CODE_RETRIEVAL'],
  SEMANTIC_REPRESENTATION: ['CANONICAL_EXACT_ORACLE'], ACE_MEMORY: ['CONTEXT_MANIFEST'],
  ADAPTIVE_DAG: ['CANDIDATE_FEATURE_MATRIX'], ORNITH_ANALYSIS: ['CONTEXT_MANIFEST'],
  ONTOLOGY_OKF: ['CANONICAL_CODE_RETRIEVAL'], AGENT_REPAIR: ['CONTEXT_MANIFEST'],
  AGENT_EXECUTION: ['CONTEXT_MANIFEST'], CONTROL_PLANE: [], TRANSPORT_EVENTS: [],
};

export function classifyArchitectureProgram(change) {
  const match = PROGRAM_DOMAINS.find(([, , , , , pattern]) => pattern.test(change ?? ''));
  if (!match) return { programId: null, programName: null, milestoneId: null, lane: null, corpus: null, classification: 'UNMAPPED_REVIEW_REQUIRED', matchedRule: null };
  const [programId, programName, milestoneId, lane, corpus, pattern] = match;
  return { programId, programName, milestoneId, lane, corpus, classification: 'CHANGE_DOMAIN_RULE', matchedRule: pattern.source };
}

/** Change-level review aid; exposes regex collisions without changing the provisional primary mapping. */
export function buildProgramMappingReview(tasks) {
  const byChange = new Map();
  for (const task of tasks.filter((row) => row.state === 'OPEN')) {
    const rows = byChange.get(task.change) ?? [];
    rows.push(task);
    byChange.set(task.change, rows);
  }
  return [...byChange].sort(([a], [b]) => a.localeCompare(b)).map(([change, rows]) => {
    const candidates = PROGRAM_DOMAINS.filter(([, , , , , pattern]) => pattern.test(change ?? ''))
      .map(([programId, name, milestoneId, lane, corpus, pattern]) => ({
        programId, name, milestoneId, lane, corpus, matchedRule: pattern.source,
      }));
    const provisional = classifyArchitectureProgram(change);
    const focusedTaskDomains = Object.fromEntries([...new Set(rows.map((row) => row.program?.architecture?.programId).filter(Boolean))]
      .sort().map((programId) => [programId, rows.filter((row) => row.program?.architecture?.programId === programId).length]));
    return {
      change,
      openTaskCount: rows.length,
      mappingStatus: 'PROVISIONAL_REQUIRES_REVIEW',
      provisionalPrimaryProgramId: provisional.programId,
      provisionalRule: provisional.matchedRule,
      candidatePrograms: candidates,
      candidateCorpora: [...new Set(candidates.map((candidate) => candidate.corpus))].sort(),
      multipleCandidateCorpora: new Set(candidates.map((candidate) => candidate.corpus)).size > 1,
      focusedTaskDomainCounts: focusedTaskDomains,
      mutationClassCounts: Object.fromEntries([...new Set(rows.map((row) => row.mutationClass ?? 'UNCLASSIFIED'))].sort()
        .map((value) => [value, rows.filter((row) => (row.mutationClass ?? 'UNCLASSIFIED') === value).length])),
      gateStateCounts: Object.fromEntries([...new Set(rows.map((row) => row.gateState ?? 'REVIEW_REQUIRED'))].sort()
        .map((value) => [value, rows.filter((row) => (row.gateState ?? 'REVIEW_REQUIRED') === value).length])),
      declaredDependencyTaskCount: rows.filter((row) => (row.declaredDependencies ?? []).length > 0).length,
      schedulerPermission: 'NOT_SELECTED',
    };
  });
}

export function classifyArchitectureTask(task) {
  const text = `${task.sectionSlug ?? ''} ${task.text ?? ''}`;
  const focused = [
    [/local.?first|evidence.?envelope|research.?receipt|summary.?claim|faithfulness|judge.?input|validation.?spine/i, 'LDR_VALIDATION'],
    [/qdrant|cuvs|cagra|ivf.?pq|neo4j|cugraph|projection/i, 'PROJECTION_EXECUTORS'],
    [/tensor.?rt|turbovec|simdjson|quic|accelerat|benchmark/i, 'RESIDENCY_RUNTIME'],
    [/candidate.?feature|feature.?matrix|ordinal.?map|feature.?evidence/i, 'FEATURE_CONTEXT'],
    [/contextmanifest|promptplan|ace.?admission|context.?assembly/i, 'PREFILL_CONTEXT'],
    [/rrf|fusion|searchruntime|bm25|lexical|fts|trigram/i, 'CODE_RETRIEVAL'],
  ];
  for (const [pattern, id] of focused) {
    if (!pattern.test(text)) continue;
    const domain = PROGRAM_DOMAINS.find(([domainId]) => domainId === id);
    const [, programName, milestoneId, lane, corpus] = domain;
    return { programId: id, programName, milestoneId, lane, corpus, classification: 'TASK_TEXT_OVERRIDE', matchedRule: pattern.source };
  }
  return classifyArchitectureProgram(task.change);
}

export function buildArchitectureOverlay() {
  validateArchitectureOverlay();
  const programs = PROGRAM_DOMAINS.map(([id, name, milestoneId, lane, corpus, pattern]) => ({
    id, name, milestoneId, primaryLane: lane, corpus, classificationRule: pattern.source,
    ownerScope: 'PROGRAM_TAXONOMY_NOT_CANONICAL_RUNTIME_OWNER', canonicalOwner: null,
    authorityRole: PROGRAM_AUTHORITY_ROLES[id], evidenceStatus: 'CURRENT',
    evidenceScope: 'ARCHITECTURAL_CONSTRAINT_NOT_RUNTIME_CLAIM', proofReceipt: null,
    replayRequired: false, promotionState: 'NOT_ELIGIBLE',
    prerequisiteGateIds: PROGRAM_GATE_REQUIREMENTS[id] ?? [], schedulerPermission: 'NOT_SELECTED',
  }));
  const architectureGates = ARCHITECTURE_GATES.map((gate) => ({ ...gate, kind: 'ARCHITECTURE_PREREQUISITE',
    proofReceipt: null, proofLevel: null, schedulerPermission: 'NOT_SELECTED', state: 'UNPROVEN_NOT_SELECTED' }));
  return {
    schema: 'atlas.openspec-program-overlay.v1', authority: 'ARCHITECTURAL_CONSTRAINTS_ONLY_NOT_TASK_OR_RUNTIME_AUTHORITY',
    milestones: PROGRAM_MILESTONES, programs,
    corpora: ['CODEBASE_PACKET', 'EXTERNAL_DOCUMENT', 'CROSS_CORPUS_CONTROL'],
    lanes: ['AUTHORITY', 'LINEAGE', 'CODE_RETRIEVAL', 'DOC_RETRIEVAL', 'FEATURE_CONTEXT', 'LDR_VALIDATION', 'PROJECTION', 'EXECUTOR', 'CACHE_RESIDENCY', 'AGENT_EXECUTION', 'LEARNING', 'ACCELERATOR', 'CONTROL_PLANE', 'EVENT_PLANE'],
    gates: architectureGates, ownershipBoundaries: OWNERSHIP_BOUNDARIES,
    ownershipRoleValues: OWNERSHIP_ROLE_VALUES,
    eventOwnershipRules: EVENT_OWNERSHIP_RULES,
    eventPlaneOwnership: EVENT_PLANE_OWNERSHIP,
    corpusSeparation: {
      codebasePacketProgram: 'PostgreSQL packet/source authority → rg/FTS/AST → semantic_768 → graph → fusion → ACE → Ornith',
      externalDocumentProgram: 'canonical external pages/chunks → PostgreSQL FTS → semantic_768 → exact/HNSW → bounded acquisition → EvidenceEnvelope → ContextManifest → LDR validators → Ornith',
      crossCorpusDependencyInference: false,
      corpusIdentityRule: 'CODEBASE_PACKET != EXTERNAL_DOCUMENT; populations never share denominators by representation alone',
    },
    invariants: [
      'OWNER != REPRESENTATION != EXECUTOR != TRANSPORT != CACHE',
      'Qdrant/Neo4j/GPU IDs are projection/executor addresses, not canonical identity',
      'Milestone and wave membership never creates a dependency edge',
      'READY != SELECTED; completion percentage never grants scheduler permission',
      'A work command may request mutation but cannot prove it committed',
      'A policy/recommendation signal cannot promote itself',
    ],
    assignmentPolicy: 'PROGRAM_CLASSIFICATION_IS_PROVISIONAL_UNTIL_REVIEWED; THIS_OVERLAY_CONTAINS_NO_LEAF_TASK_ASSIGNMENTS',
    counts: { programCount: programs.length, architectureGateCount: architectureGates.length, selectedTasks: 0 },
  };
}

export function validateArchitectureOverlay() {
  const gateIds = new Set(ARCHITECTURE_GATES.map((gate) => gate.id));
  const milestoneIds = new Set(PROGRAM_MILESTONES.map((milestone) => milestone.id));
  const corpora = new Set(['CODEBASE_PACKET', 'EXTERNAL_DOCUMENT', 'CROSS_CORPUS_CONTROL']);
  if (new Set(PROGRAM_MILESTONES.map((milestone) => milestone.id)).size !== 7) throw new Error('OVERLAY_MILESTONE_SET_INVALID');
  if (new Set(PROGRAM_DOMAINS.map(([id]) => id)).size !== PROGRAM_DOMAINS.length || PROGRAM_DOMAINS.length < 20 || PROGRAM_DOMAINS.length > 30) throw new Error('OVERLAY_PROGRAM_SET_INVALID');
  for (const [id, , milestone, , corpus] of PROGRAM_DOMAINS) {
    if (!milestoneIds.has(milestone)) throw new Error(`OVERLAY_UNKNOWN_PROGRAM_MILESTONE:${id}:${milestone}`);
    if (!corpora.has(corpus)) throw new Error(`OVERLAY_UNKNOWN_PROGRAM_CORPUS:${id}:${corpus}`);
    if (!OWNERSHIP_ROLE_VALUES.includes(PROGRAM_AUTHORITY_ROLES[id])) throw new Error(`OVERLAY_PROGRAM_ROLE_MISSING:${id}`);
  }
  for (const gate of ARCHITECTURE_GATES) {
    if (!milestoneIds.has(gate.milestone)) throw new Error(`OVERLAY_UNKNOWN_GATE_MILESTONE:${gate.id}`);
    if (!corpora.has(gate.corpus)) throw new Error(`OVERLAY_UNKNOWN_GATE_CORPUS:${gate.id}`);
    if (gate.dependsOnGateIds.some((dependency) => !gateIds.has(dependency))) throw new Error(`OVERLAY_UNKNOWN_GATE_DEPENDENCY:${gate.id}`);
  }
  const visiting = new Set(); const visited = new Set();
  const visit = (id) => {
    if (visiting.has(id)) throw new Error(`OVERLAY_GATE_CYCLE:${id}`);
    if (visited.has(id)) return;
    visiting.add(id);
    for (const dependency of ARCHITECTURE_GATES.find((gate) => gate.id === id).dependsOnGateIds) visit(dependency);
    visiting.delete(id); visited.add(id);
  };
  for (const id of gateIds) visit(id);
  validateOwnershipBoundaries();
  const externalCorpusProgram = PROGRAM_DOMAINS.find(([id]) => id === 'EXTERNAL_DOCS');
  if (!externalCorpusProgram || externalCorpusProgram[4] !== 'EXTERNAL_DOCUMENT') throw new Error('OVERLAY_EXTERNAL_CORPUS_BOUNDARY_INVALID');
  return true;
}

export function validateOwnershipBoundaries(boundaries = OWNERSHIP_BOUNDARIES) {
  if (new Set(boundaries.map((boundary) => boundary.domain)).size !== boundaries.length) throw new Error('OVERLAY_DUPLICATE_OWNERSHIP_DOMAIN');
  for (const boundary of boundaries) {
    if (!OWNERSHIP_ROLE_VALUES.includes(boundary.authorityRole)) throw new Error(`OVERLAY_UNKNOWN_AUTHORITY_ROLE:${boundary.domain}`);
    if (!boundary.canonicalOwner?.trim()) throw new Error(`OVERLAY_CANONICAL_OWNER_MISSING:${boundary.domain}`);
    const canonical = boundary.canonicalOwner.trim().toLowerCase();
    if ([boundary.executor, boundary.transport].filter(Boolean).some((value) => value.trim().toLowerCase() === canonical)) {
      throw new Error(`OVERLAY_OWNER_CATEGORY_COLLISION:${boundary.domain}`);
    }
    if (boundary.authorityRole === 'REPRESENTATION' && !boundary.representation) throw new Error(`OVERLAY_REPRESENTATION_MISSING:${boundary.domain}`);
    if (['EXECUTOR', 'PROJECTION', 'CACHE'].includes(boundary.authorityRole) && !boundary.executor) throw new Error(`OVERLAY_EXECUTOR_MISSING:${boundary.domain}`);
    if (boundary.authorityRole === 'TRANSPORT' && !boundary.transport) throw new Error(`OVERLAY_TRANSPORT_MISSING:${boundary.domain}`);
  }
  return true;
}

export function buildProgramGates(waves = PROGRAM_WAVES, workPackages = []) {
  return waves.map((wave) => {
    const id = `GATE-WAVE-${String(wave.id).padStart(2, '0')}`;
    const members = workPackages.filter((workPackage) => workPackage.wave === wave.id
      || (Array.isArray(workPackage.waveIds) && workPackage.waveIds.includes(wave.id)));
    return {
      id,
      waveId: wave.id,
      milestone: wave.milestone,
      exitGate: wave.exitGate,
      dependsOnGateIds: wave.dependsOnWaveIds.map((dependencyId) => `GATE-WAVE-${String(dependencyId).padStart(2, '0')}`),
      workPackageIds: members.map((workPackage) => workPackage.id),
      taskCount: new Set(members.flatMap((workPackage) => workPackage.taskKeys)).size,
      proofReceipt: null,
      proofLevel: null,
      canonicalOwner: null,
      schedulerPermission: 'NOT_SELECTED',
      state: 'UNPROVEN_NOT_SELECTED',
    };
  });
}

/** Group every leaf once into bounded provisional work packages without inventing owners or dependencies. */
export function buildProgramWorkPackages(tasks, chunkSize = 10) {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) throw new Error('WORK_PACKAGE_CHUNK_SIZE_INVALID');
  const buckets = new Map();
  for (const task of [...tasks].sort((a, b) => (a.program?.wave ?? 99) - (b.program?.wave ?? 99)
    || String(a.change ?? '').localeCompare(String(b.change ?? ''))
    || (a.line ?? 0) - (b.line ?? 0))) {
    const architecture = task.program?.architecture;
    if (!architecture?.programId) continue; // Unmapped leaves are review-required, never guessed into a package.
    const key = [task.change ?? 'UNOWNED_CHANGE', architecture.programId,
      task.mutationClass ?? 'MUTATION_UNCLASSIFIED', task.gateState ?? 'READINESS_UNCLASSIFIED'].join(':');
    const group = buckets.get(key) ?? [];
    group.push(task);
    buckets.set(key, group);
  }

  const packages = [];
  for (const [key, members] of buckets) {
    const [change, domainId, mutation, gateState] = key.split(':');
    const waveIds = [...new Set(members.map((task) => task.program?.wave).filter(Number.isInteger))].sort((a, b) => a - b);
    const waveId = waveIds.length === 1 ? waveIds[0] : null;
    const wave = waveId == null ? null : PROGRAM_WAVES.find((item) => item.id === waveId);
    for (let offset = 0; offset < members.length; offset += chunkSize) {
      const part = members.slice(offset, offset + chunkSize);
      const partNumber = String(Math.floor(offset / chunkSize) + 1).padStart(2, '0');
      const id = `${domainId}:${change}:${mutation}:${gateState}:WP${partNumber}`;
      const architecture = part[0].program?.architecture;
      const item = {
        id,
        wave: waveId,
        waveIds,
        milestone: architecture?.milestoneId ?? null,
        milestoneId: architecture?.milestoneId ?? null,
        gateId: wave == null ? null : `GATE-WAVE-${String(waveId).padStart(2, '0')}`,
      changeGateId: `GATE-CHANGE-${change}`,
      programId: architecture?.programId ?? null,
        prerequisiteGateIds: architecture?.programId ? (PROGRAM_GATE_REQUIREMENTS[architecture.programId] ?? []) : [],
        primaryLane: architecture?.lane ?? null,
        secondaryLanes: [],
        corpus: architecture?.corpus ?? null,
        mutationClass: mutation,
        gateState,
        gate: wave?.exitGate ?? 'UNCLASSIFIED_REVIEW_REQUIRED',
        owner: change,
        ownerScope: 'OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER',
        canonicalOwner: null,
        taskKeys: part.map((task) => task.taskKey),
        taskCount: part.length,
        declaredTaskDependencyCount: part.reduce((count, task) => count + (task.declared?.dependsOn?.length ?? 0), 0),
        dependsOnWaveIds: wave?.dependsOnWaveIds ?? [],
        dependsOn: [],
        schedulerPermission: 'NOT_SELECTED',
        state: 'PLANNED_NOT_SELECTED',
      };
      for (const task of part) task.program.workPackageKey = id;
      packages.push(item);
    }
  }
  return packages;
}

/** Report whether target package sizing is possible without relaxing ownership/readiness boundaries. */
export function analyzeWorkPackageFeasibility(tasks, {
  currentChunkSize = 10,
  minimumTasksPerPackage = 3,
  maximumTasksPerPackage = 12,
  targetMinimumPackages = 250,
  targetMaximumPackages = 400,
} = {}) {
  for (const [name, value] of Object.entries({ currentChunkSize, minimumTasksPerPackage, maximumTasksPerPackage,
    targetMinimumPackages, targetMaximumPackages })) {
    if (!Number.isInteger(value) || value < 1) throw new Error(`WORK_PACKAGE_FEASIBILITY_OPTION_INVALID:${name}`);
  }
  if (minimumTasksPerPackage > maximumTasksPerPackage || targetMinimumPackages > targetMaximumPackages) {
    throw new Error('WORK_PACKAGE_FEASIBILITY_RANGE_INVALID');
  }

  const groups = new Map();
  const ownerMutationGroups = new Map();
  let reviewRequiredTaskCount = 0;
  for (const task of tasks) {
    const architecture = task.program?.architecture;
    if (!architecture?.programId) {
      reviewRequiredTaskCount += 1;
      continue;
    }
    const key = [task.change ?? 'UNOWNED_CHANGE', architecture.programId,
      task.mutationClass ?? 'MUTATION_UNCLASSIFIED', task.gateState ?? 'READINESS_UNCLASSIFIED'].join(':');
    groups.set(key, (groups.get(key) ?? 0) + 1);
    const ownerMutationKey = [task.change ?? 'UNOWNED_CHANGE', task.mutationClass ?? 'MUTATION_UNCLASSIFIED'].join(':');
    ownerMutationGroups.set(ownerMutationKey, (ownerMutationGroups.get(ownerMutationKey) ?? 0) + 1);
  }

  const sizes = [...groups.values()];
  const ownerMutationSizes = [...ownerMutationGroups.values()];
  const currentPackageCount = sizes.reduce((sum, size) => sum + Math.ceil(size / currentChunkSize), 0);
  const currentUndersizedPackageCount = sizes.reduce((sum, size) => {
    const remainder = size % currentChunkSize;
    return sum + (remainder > 0 && remainder < minimumTasksPerPackage ? 1 : 0);
  }, 0);
  const minimumPackageCountAtMaximumSize = sizes.reduce((sum, size) => sum + Math.ceil(size / maximumTasksPerPackage), 0);
  const minimumPackagesPreservingChangeOwnerAndMutation = ownerMutationSizes.reduce((sum, size) => sum + Math.ceil(size / maximumTasksPerPackage), 0);
  const ownerMutationGroupsBelowMinimum = ownerMutationSizes.filter((size) => size < minimumTasksPerPackage).length;
  const maximumPackageCountAtMinimumSize = sizes.reduce((sum, size) => sum + Math.floor(size / minimumTasksPerPackage), 0);
  const boundaryGroupsBelowMinimum = sizes.filter((size) => size < minimumTasksPerPackage).length;
  const boundaryTasksInGroupsBelowMinimum = sizes.filter((size) => size < minimumTasksPerPackage).reduce((sum, size) => sum + size, 0);
  const packageCountCanReachTarget = minimumPackageCountAtMaximumSize <= targetMaximumPackages
    && maximumPackageCountAtMinimumSize >= targetMinimumPackages;

  return {
    scope: 'CLASSIFIED_OPEN_TASKS_ONLY',
    boundary: ['CHANGE_OWNER', 'PRIMARY_PROGRAM', 'MUTATION_CLASS', 'GATE_STATE'],
    groupCount: groups.size,
    classifiedTaskCount: sizes.reduce((sum, size) => sum + size, 0),
    reviewRequiredTaskCount,
    currentChunkSize,
    minimumTasksPerPackage,
    maximumTasksPerPackage,
    targetPackageRange: { minimum: targetMinimumPackages, maximum: targetMaximumPackages },
    currentPackageCount,
    currentUndersizedPackageCount,
    minimumPackageCountAtMaximumSize,
    minimumPackagesPreservingChangeOwnerAndMutation,
    ownerMutationGroupsBelowMinimum,
    targetAchievablePreservingChangeOwnerAndMutation: minimumPackagesPreservingChangeOwnerAndMutation <= targetMaximumPackages
      && ownerMutationGroupsBelowMinimum === 0,
    maximumPackageCountAtMinimumSize,
    boundaryGroupsBelowMinimum,
    boundaryTasksInGroupsBelowMinimum,
    targetAchievableWithoutBoundaryChanges: packageCountCanReachTarget && boundaryGroupsBelowMinimum === 0,
    boundaryChangesRequired: packageCountCanReachTarget && boundaryGroupsBelowMinimum === 0
      ? [] : ['REVIEW_GROUPING_BOUNDARIES_WITH_OWNER; DO_NOT_MERGE_AUTOMATICALLY'],
    dependenciesInvented: 0,
    tasksSelected: 0,
  };
}

export const MAPPING_STATUSES = ['PROVEN', 'PROVISIONAL', 'REVIEW_REQUIRED'];

/**
 * Taxonomy + ownership hierarchy: Program -> change gate -> work package -> leaf task.
 * Nothing here creates a dependency edge. Change gates carry no prerequisites; leaves inherit only explicit
 * work-package dependencies plus anything their own ledger declares. Wave/milestone membership is metadata.
 * Mutates tasks (task.hierarchy) and workPackages (programId/changeGateId/mappingStatus) like buildProgramWorkPackages.
 * `reviewedMappings` (change -> programId) is the only route to PROVEN; regex name matches stay PROVISIONAL.
 */
export function buildProgramHierarchy(tasks, workPackages, reviewedMappings = {}) {
  validateArchitectureOverlay();
  const byChange = new Map();
  for (const task of tasks) {
    if (!byChange.has(task.change)) byChange.set(task.change, []);
    byChange.get(task.change).push(task);
  }
  const knownPrograms = new Set(PROGRAM_DOMAINS.map(([id]) => id));
  const changeInfo = new Map();
  for (const [change, rows] of [...byChange].sort(([a], [b]) => a.localeCompare(b))) {
    const reviewed = reviewedMappings[change];
    if (reviewed !== undefined && !knownPrograms.has(reviewed)) throw new Error(`HIERARCHY_REVIEWED_MAPPING_UNKNOWN_PROGRAM:${change}:${reviewed}`);
    const inferred = classifyArchitectureProgram(change).programId;
    const programId = reviewed ?? inferred ?? null;
    const mappingStatus = reviewed !== undefined ? 'PROVEN' : inferred ? 'PROVISIONAL' : 'REVIEW_REQUIRED';
    const openRows = rows.filter((task) => task.state === 'OPEN');
    const secondary = new Set();
    if (programId) {
      for (const task of openRows) {
        const focused = classifyArchitectureTask(task).programId;
        if (focused && focused !== programId) secondary.add(focused);
      }
    }
    changeInfo.set(change, { programId, mappingStatus, rows, openRows, secondaryProgramIds: [...secondary].sort() });
  }

  const packagesByChange = new Map();
  for (const workPackage of workPackages) {
    workPackage.changeGateId = `GATE-CHANGE-${workPackage.owner}`;
    const info = changeInfo.get(workPackage.owner);
    workPackage.programId = info?.programId ?? null;
    workPackage.mappingStatus = info?.mappingStatus ?? 'REVIEW_REQUIRED';
    if (!packagesByChange.has(workPackage.owner)) packagesByChange.set(workPackage.owner, []);
    packagesByChange.get(workPackage.owner).push(workPackage);
  }
  const packageById = new Map(workPackages.map((workPackage) => [workPackage.id, workPackage]));

  const changeGates = [...changeInfo].map(([change, info]) => ({
    id: `GATE-CHANGE-${change}`, kind: 'OPENSPEC_CHANGE', change,
    primaryProgramId: info.programId, secondaryProgramIds: info.secondaryProgramIds, mappingStatus: info.mappingStatus,
    active: info.openRows.length > 0,
    openTaskCount: info.openRows.length, completedTaskCount: info.rows.length - info.openRows.length, totalTaskCount: info.rows.length,
    workPackageIds: (packagesByChange.get(change) ?? []).map((workPackage) => workPackage.id),
    taskKeys: info.openRows.map((task) => task.taskKey),
    dependsOnGateIds: [], // Change gates are completion boundaries, never inferred prerequisites.
    owner: change, ownerScope: 'OPENSPEC_CHANGE_ONLY_NOT_CANONICAL_RUNTIME_OWNER', canonicalOwner: null,
    proofReceipt: null, proofLevel: null, schedulerPermission: 'NOT_SELECTED',
    state: info.openRows.length === 0 ? 'COMPLETE' : 'OPEN_UNPROVEN_NOT_SELECTED',
  }));

  for (const [change, info] of changeInfo) {
    for (const task of info.rows) {
      const workPackage = packageById.get(task.program?.workPackageKey);
      const declared = task.declared?.dependsOn ?? [];
      const inherited = workPackage?.dependsOn ?? [];
      const focused = info.programId ? classifyArchitectureTask(task).programId : null;
      task.hierarchy = {
        primaryProgramId: info.programId, mappingStatus: info.mappingStatus,
        secondaryProgramIds: focused && focused !== info.programId ? [focused] : [],
        changeGateId: `GATE-CHANGE-${change}`,
        declaredDependencies: [...declared], inheritedDependencies: task.state === 'OPEN' ? inherited : [],
        effectiveDependencies: [...new Set([...declared, ...(task.state === 'OPEN' ? inherited : [])])],
      };
    }
  }

  const programs = PROGRAM_DOMAINS.map(([id, name, milestoneId, lane, corpus]) => {
    const gates = changeGates.filter((gate) => gate.primaryProgramId === id);
    return { id, name, milestoneId, primaryLane: lane, corpus,
      changeGateIds: gates.map((gate) => gate.id), changeCount: gates.length, activeChangeCount: gates.filter((gate) => gate.active).length,
      openTaskCount: gates.reduce((sum, gate) => sum + gate.openTaskCount, 0),
      completedTaskCount: gates.reduce((sum, gate) => sum + gate.completedTaskCount, 0),
      totalTaskCount: gates.reduce((sum, gate) => sum + gate.totalTaskCount, 0),
      ownerScope: 'PROVISIONAL_PROGRAM_GROUP_NOT_CANONICAL_RUNTIME_OWNER', canonicalOwner: null, schedulerPermission: 'NOT_SELECTED' };
  });
  const reviewGates = changeGates.filter((gate) => gate.primaryProgramId === null);
  const countStatus = (status) => changeGates.filter((gate) => gate.mappingStatus === status).length;
  return {
    programs, changeGates,
    hierarchyReview: {
      reviewChangeGateIds: reviewGates.map((gate) => gate.id),
      reviewChangeCount: reviewGates.length, reviewOpenTaskCount: reviewGates.reduce((sum, gate) => sum + gate.openTaskCount, 0),
      provisionalChangeCount: countStatus('PROVISIONAL'), provenChangeCount: countStatus('PROVEN'),
    },
    hierarchyPolicy: 'TAXONOMY_ONLY_NO_INFERRED_DEPENDENCIES; ONE_PRIMARY_PROGRAM_PER_CHANGE; LEAVES_INHERIT_FROM_PACKAGE_AND_CHANGE_GATE',
  };
}

/**
 * The operator-directed critical spine, expressed as an overlay only. It selects nothing and executes nothing;
 * its edges exist solely because the operator directive declares them.
 */
export function buildSelectedChainOverlay(changeGates = []) {
  const gateIds = new Set(changeGates.map((gate) => gate.id));
  const lineage = 'parent-atlas-retrieval-lineage-dag-convergence';
  const stages = [
    ['SOURCE_LINEAGE', lineage], ['PACKET_REVISION_QUALIFICATION', lineage], ['CURRENT_WORKSPACE_LINEAGE', lineage],
    ['PACKET_KEY_OWNER', lineage], ['PACKET_ADMISSION', lineage], ['GATE_2', 'parent-atlas-gate2-chunk-lineage-convergence'],
  ];
  const nodes = stages.map(([id, change], index) => ({ id, order: index + 1, change,
    changeGateId: gateIds.has(`GATE-CHANGE-${change}`) ? `GATE-CHANGE-${change}` : null, status: 'NOT_MEASURED_BY_GENERATOR' }));
  return {
    schema: 'atlas.openspec-selected-chain-overlay.v1', edgeAuthority: 'OPERATOR_DIRECTIVE_OVERLAY_ONLY_NOT_TAXONOMY',
    schedulerPermission: 'NOT_SELECTED', autoSelects: false, nodes,
    edges: nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id })),
  };
}

/**
 * Snapshot-diff completion tracking. A task ledger only records `[x]`, not when; so completion is observed by
 * comparing the previous artifact with the current build, and appended to a carried-forward ledger.
 * Observation time is the build time of the snapshot that first saw the transition, never a claimed completion time.
 */
export function computeCompletionTracking({ previous, tasks, generatedAt }) {
  const keyOf = (task) => task.selectionKey ?? task.logicalTaskKey ?? task.stableKey ?? task.taskKey;
  const current = new Map(tasks.map((task) => [keyOf(task), task]));
  const previousTasks = new Map((previous?.taskInventory ?? []).map((task) => [keyOf(task), task]));
  const carried = Array.isArray(previous?.completionTracking?.ledger) ? previous.completionTracking.ledger : [];
  const entry = (event, task) => ({ event, selectionKey: keyOf(task), taskKey: task.taskKey, change: task.change,
    text: String(task.text ?? '').slice(0, 160), observedAt: generatedAt, previousSnapshotAt: previous?.generatedAt ?? null });
  const fresh = [];
  let vanished = 0;
  let addedAlreadyDone = 0;
  if (previous) {
    for (const [key, before] of previousTasks) {
      const now = current.get(key);
      if (!now) { vanished += 1; continue; }
      if (before.state === 'OPEN' && now.state === 'DONE') fresh.push(entry('COMPLETED_OBSERVED', now));
      else if (before.state === 'DONE' && now.state === 'OPEN') fresh.push(entry('REOPENED_OBSERVED', now));
    }
    for (const [key, now] of current) if (!previousTasks.has(key) && now.state === 'DONE') addedAlreadyDone += 1;
  }
  const completedNow = tasks.filter((task) => task.state === 'DONE');
  const ledger = [...carried, ...fresh];
  const observedComplete = new Set(); // Net observed state per key: last event wins.
  for (const item of ledger) {
    if (item.event === 'COMPLETED_OBSERVED') observedComplete.add(item.selectionKey);
    else observedComplete.delete(item.selectionKey);
  }
  const bucket = (task) => task.hierarchy?.primaryProgramId ?? 'UNCLASSIFIED_REVIEW';
  const byProgram = {};
  for (const task of tasks) {
    const row = (byProgram[bucket(task)] ??= { completed: 0, open: 0, total: 0 });
    row.total += 1;
    if (task.state === 'DONE') row.completed += 1; else row.open += 1;
  }
  return {
    schema: 'atlas.openspec-completion-tracking.v1',
    method: 'SNAPSHOT_DIFF_OBSERVED_NOT_A_COMPLETION_TIMESTAMP',
    previousGeneratedAt: previous?.generatedAt ?? null,
    hasPreviousSnapshot: Boolean(previous),
    completedTotal: completedNow.length,
    newlyCompleted: fresh.filter((item) => item.event === 'COMPLETED_OBSERVED').length,
    reopened: fresh.filter((item) => item.event === 'REOPENED_OBSERVED').length,
    baselineCompletedNotIndividuallyObserved: completedNow.filter((task) => !observedComplete.has(keyOf(task))).length,
    vanishedSinceLastSnapshot: vanished, addedAlreadyDoneSinceLastSnapshot: addedAlreadyDone,
    byProgram, ledger,
  };
}

const taskRules = [
  [2, /source.?authority|packet.?admission|packet.?revision|workspace.?revision.*tournament|source.?membership|packet.?chunk.*lineage|gate.?2|gate2/i],
  [1, /identity|symbol.?version|graph.?identity|stable.?file|repository.?identity/i],
  [8, /agentic|repair|file-compiler|workflow.*execution/i],
  [7, /ace|bitfrost|cache-correctness|residen|lod-|local-llm-offload/i],
  [6, /adaptive-dag|contextmanifest|promptplan|query-routing|prefill/i],
  [5, /candidate-feature|feature-matrix|best-fit-score|feature-label|pagerank|community|kanban.*rank/i],
  [4, /retrieval|rrf|qdrant|bm25|fts|search-runtime|search-classifier|deep-research/i],
  [3, /ingestion|index|external-doc|document|okf|graphify|neo4j|chunk-index|projection/i],
  [10, /xgboost|rank-cache|dspy|gepa|training|label|promotion|evaluation/i],
  [9, /gpu|cuvs|cagra|turbovec|onnx|tensorrt|libtorch|cuda|webgpu|acceleration|benchmark|challenger/i],
  [0, /workboard|openspec|migration-reconciliation|ownership|governance|runtime-ownership/i],
];
const changeFallbackRules = [
  [2, /retrieval-lineage-dag-convergence|gate2-chunk-lineage-convergence/],
  [1, /code-ingestion-pipeline|canonical-directory-ingestion|compiler-semantic-graph-resolution/],
  [5, /atlas-feature-intelligence/],
  [8, /agentic/], [7, /ace-|cache-correctness|residency|local-llm-offload/],
  [6, /adaptive-dag|query-routing/], [5, /candidate-feature|feature-matrix|best-fit-score/],
  [4, /retrieval|rrf|qdrant|search-classifier|deep-research/],
  [3, /ingestion|index|external-doc|document|okf|graphify|graph-retrieval/],
  [10, /xgboost|rank-cache|dspy|gepa|training/],
  [9, /gpu|cuvs|cagra|turbovec|onnx|tensorrt|libtorch|cuda|webgpu/],
  [0, /workboard|openspec|migration-reconciliation|ownership|governance|runtime-ownership/],
];

export function classifyProgramTask(task) {
  const detail = `${task.sectionSlug ?? ''} ${task.text ?? ''}`;
  for (const [wave, pattern] of taskRules) {
    if (pattern.test(detail)) return { wave, classification: 'TASK_TEXT_RULE', matchedRule: pattern.source };
  }
  for (const [wave, pattern] of changeFallbackRules) {
    if (pattern.test(task.change ?? '')) return { wave, classification: 'CHANGE_FALLBACK_REVIEW', matchedRule: pattern.source };
  }
  return { wave: null, classification: 'UNCLASSIFIED_REVIEW_REQUIRED', matchedRule: null };
}

export function schedulerPermission(task, selection = null) {
  if (task.state === 'DONE' || task.gateState === 'COMPLETE' || task.gateState === 'SUPERSEDED') return 'NOT_SELECTED';
  if (task.gateState !== 'READY') return 'NOT_SELECTED';
  if (!selection || selection.permission !== 'SELECTED') return 'NOT_SELECTED';
  const keys = new Set(selection.taskKeys ?? []);
  return keys.has(task.selectionKey ?? task.logicalTaskKey ?? task.stableKey ?? task.taskKey) ? 'SELECTED' : 'NOT_SELECTED';
}

export function isValidSchedulerSelection(selection) {
  return Boolean(selection && selection.schema === 'atlas.openspec-scheduler-selection.v1'
    && selection.permission === 'SELECTED' && Array.isArray(selection.taskKeys)
    && selection.taskKeys.length > 0
    && selection.taskKeys.every((key) => typeof key === 'string' && key.trim().length > 0)
    && new Set(selection.taskKeys).size === selection.taskKeys.length);
}

export function classifyGateState(task) {
  if (task.state === 'DONE' || task.executionState === 'DONE') return 'COMPLETE';
  if (task.controllerState === 'PROVEN') return 'PROOF_ONLY';
  if (task.controllerState === 'DEFERRED') return 'DEFERRED';
  if (task.controllerState === 'STALE_CONTROLLER_RECEIPT') return 'REVIEW_REQUIRED';
  if (task.controllerState === 'ACTIONABLE') return 'READY';
  if (task.executionState === 'SUPERSEDED_OR_HISTORICAL') return 'SUPERSEDED';
  if (task.controllerState === 'WAITING_ON_AUTHORITY' || task.executionState === 'WAITING_ON_AUTHORITY'
    || task.controllerState === 'WAITING_ON_DEPENDENCY' || task.executionState === 'WAITING_ON_DEPENDENCY') {
    const text = `${task.change ?? ''} ${task.text ?? ''}`.toLowerCase();
    if (task.controllerBlockerKey === 'CANONICAL_AUTHORIZATION' || /authorization|required approval|operator approval|--apply/.test(text)) return 'AUTHORIZATION_REQUIRED';
    if (/owner decision|operator decision|choose .* owner/.test(text)) return 'OWNER_DECISION_REQUIRED';
    if (task.controllerBlockerKey === 'CURRENT_SOURCE_AUTHORITY' || /source.?authority|source.?revision|packet.?chunk|lineage|candidateordinal/.test(text)) return 'BLOCKED_BY_LINEAGE';
    if (/runtime|service.*unavailable|container|endpoint/.test(text)) return 'BLOCKED_BY_RUNTIME';
    if (/real inputs|live input|waiting for.*input|missing.*manifest/.test(text)) return 'WAITING_FOR_REAL_INPUTS';
    return 'WAITING_FOR_DEPENDENCY';
  }
  return 'REVIEW_REQUIRED';
}

export function mutationClass(task) {
  const text = `${task.text ?? ''} ${task.change ?? ''}`.toLowerCase();
  if (/graphify/.test(text)) return 'GRAPHIFY_RUN';
  if (/\bddl\b|migration|schema/.test(text)) return 'DDL';
  if (/qdrant|neo4j|projection|vector upsert/.test(text)) return 'PROJECTION_WRITE';
  if (/postgres|database|\bdb\b|persist|backfill|admit|write/.test(text)) return 'DB_WRITE';
  if (/valkey|redis|cache/.test(text)) return 'CACHE_WRITE';
  if (/receipt|report|fixture|snapshot|artifact/.test(text)) return 'LOCAL_ARTIFACT';
  if (/test|audit|prove|verify|census|inspect|read.?only/.test(text)) return 'READ_ONLY';
  return 'CODE_ONLY';
}
