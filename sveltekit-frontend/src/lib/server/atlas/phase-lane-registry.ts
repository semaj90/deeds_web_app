import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  SEMANTIC_REPRESENTATION_ID,
  SEMANTIC_DIMENSION,
} from '../embedding/embedding-contract-768.js';

export const PARENT_ATLAS_PHASE_LANE_IDS = [
  11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25,
] as const;

export type ParentAtlasPhaseLaneId = (typeof PARENT_ATLAS_PHASE_LANE_IDS)[number];

export type ParentAtlasPhaseLaneStatus =
  | 'partial'
  | 'implemented'
  | 'planned'
  | 'eval-only';

export type ParentAtlasPhaseLaneMode = 'mock';

export interface ParentAtlasPhaseLaneReceipt {
  receipt_id: string;
  phase: ParentAtlasPhaseLaneId;
  status: ParentAtlasPhaseLaneStatus;
  execution_mode: ParentAtlasPhaseLaneMode;
  owner: string;
  summary: string;
  source_refs: string[];
  evidence_refs: string[];
  artifacts: string[];
  next_gate: string;
  canonical_representation_id: typeof SEMANTIC_REPRESENTATION_ID;
  canonical_dimension: typeof SEMANTIC_DIMENSION;
  created_at: string;
}

export interface ParentAtlasPhaseLane {
  phase: ParentAtlasPhaseLaneId;
  title: string;
  status: ParentAtlasPhaseLaneStatus;
  execution_mode: ParentAtlasPhaseLaneMode;
  owner: string;
  lane: string;
  canonical_representation_id: typeof SEMANTIC_REPRESENTATION_ID;
  canonical_dimension: typeof SEMANTIC_DIMENSION;
  proof_gate: string;
  source_refs: string[];
  evidence_refs: string[];
  open_gaps: string[];
  mock_artifacts: string[];
  receipt: ParentAtlasPhaseLaneReceipt;
}

export interface ParentAtlasPhaseLaneSummary {
  total: number;
  partial: number;
  implemented: number;
  planned: number;
  evalOnly: number;
  mock: number;
  canonicalRepresentationId: typeof SEMANTIC_REPRESENTATION_ID;
  canonicalDimension: typeof SEMANTIC_DIMENSION;
}

export interface ParentAtlasPhaseLaneSnapshot {
  generated_at: string;
  summary: ParentAtlasPhaseLaneSummary;
  phases: ParentAtlasPhaseLane[];
  open_gaps: string[];
}

const PhaseLaneSchema = z
  .object({
    phase: z.union([
      z.literal(11), z.literal(12), z.literal(13), z.literal(14), z.literal(15),
      z.literal(16), z.literal(17), z.literal(18), z.literal(19), z.literal(20),
      z.literal(21), z.literal(22), z.literal(23), z.literal(24), z.literal(25),
    ]),
    title: z.string().min(1),
    status: z.enum(['partial', 'implemented', 'planned', 'eval-only']),
    execution_mode: z.literal('mock'),
    owner: z.string().min(1),
    lane: z.string().min(1),
    canonical_representation_id: z.literal(SEMANTIC_REPRESENTATION_ID),
    canonical_dimension: z.literal(SEMANTIC_DIMENSION),
    proof_gate: z.string().min(1),
    source_refs: z.array(z.string().min(1)),
    evidence_refs: z.array(z.string().min(1)),
    open_gaps: z.array(z.string().min(1)),
    mock_artifacts: z.array(z.string().min(1)),
    receipt: z
      .object({
        receipt_id: z.string().min(1),
        phase: z.union([
          z.literal(11), z.literal(12), z.literal(13), z.literal(14), z.literal(15),
          z.literal(16), z.literal(17), z.literal(18), z.literal(19), z.literal(20),
          z.literal(21), z.literal(22), z.literal(23), z.literal(24), z.literal(25),
        ]),
        status: z.enum(['partial', 'implemented', 'planned', 'eval-only']),
        execution_mode: z.literal('mock'),
        owner: z.string().min(1),
        summary: z.string().min(1),
        source_refs: z.array(z.string().min(1)),
        evidence_refs: z.array(z.string().min(1)),
        artifacts: z.array(z.string().min(1)),
        next_gate: z.string().min(1),
        canonical_representation_id: z.literal(SEMANTIC_REPRESENTATION_ID),
        canonical_dimension: z.literal(SEMANTIC_DIMENSION),
        created_at: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

export const ParentAtlasPhaseLaneSnapshotSchema = z
  .object({
    generated_at: z.string().datetime(),
    summary: z
      .object({
        total: z.number().int().nonnegative(),
        partial: z.number().int().nonnegative(),
        implemented: z.number().int().nonnegative(),
        planned: z.number().int().nonnegative(),
        evalOnly: z.number().int().nonnegative(),
        mock: z.number().int().nonnegative(),
        canonicalRepresentationId: z.literal(SEMANTIC_REPRESENTATION_ID),
        canonicalDimension: z.literal(SEMANTIC_DIMENSION),
      })
      .strict(),
    phases: z.array(PhaseLaneSchema),
    open_gaps: z.array(z.string().min(1)),
  })
  .strict();

type PhaseSeed = {
  phase: ParentAtlasPhaseLaneId;
  title: string;
  status: ParentAtlasPhaseLaneStatus;
  owner: string;
  lane: string;
  proofGate: string;
  sourceRefs: string[];
  evidenceRefs: string[];
  openGaps: string[];
  mockArtifacts: string[];
  nextGate: string;
};

const PHASE_SEEDS: PhaseSeed[] = [
  {
    phase: 11,
    title: 'Engram / Gemma4 memory wiring',
    status: 'partial',
    owner: 'engram-memory',
    lane: 'memory',
    proofGate: 'ENGRAM_MEMORY_WIRING_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/ai/engram-memory.ts',
      'sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts',
    ],
    evidenceRefs: ['phase-11-memory-stub'],
    openGaps: ['persistent ingestion lane remains deferred', 'transport/importer paths need a live proof receipt'],
    mockArtifacts: ['engram-memory-wire.mock.json'],
    nextGate: 'wire the mock memory receipt into the registry snapshot',
  },
  {
    phase: 12,
    title: 'Parent Atlas codebase index',
    status: 'partial',
    owner: 'atlas-codebase-index',
    lane: 'index',
    proofGate: 'CODEBASE_INDEX_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/atlas-index.ts',
      'sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts',
    ],
    evidenceRefs: ['phase-12-codebase-index-stub'],
    openGaps: ['live workspace scan is still pending'],
    mockArtifacts: ['codebase-index.mock.json'],
    nextGate: 'surface the mock codebase scan in the workstation snapshot',
  },
  {
    phase: 13,
    title: 'Feature-gap registry completion',
    status: 'partial',
    owner: 'feature-classification',
    lane: 'registry',
    proofGate: 'FEATURE_GAP_REGISTRY_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/master-feature-map.ts',
      'sveltekit-frontend/src/lib/server/atlas/runtime-registry.ts',
    ],
    evidenceRefs: ['phase-13-feature-gap-registry-stub'],
    openGaps: ['bootstrap registry scan is still pending'],
    mockArtifacts: ['feature-gap-registry.mock.json'],
    nextGate: 'emit a deterministic registry summary for the mock ladder',
  },
  {
    phase: 14,
    title: 'Redis exact-card cache policy',
    status: 'implemented',
    owner: 'redis-exact-card-cache',
    lane: 'cache',
    proofGate: 'REDIS_EXACT_CARD_CACHE_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/feature-card-semantic-index.ts',
      'sveltekit-frontend/src/lib/server/atlas/board/fabric-lane-manifest.ts',
    ],
    evidenceRefs: ['phase-14-redis-cache-implemented'],
    openGaps: ['policy is implemented but only mocked in this phase ladder'],
    mockArtifacts: ['redis-exact-card-cache.mock.json'],
    nextGate: 'record the mock cache policy receipt in the phase ladder',
  },
  {
    phase: 15,
    title: 'Qdrant semantic lane',
    status: 'implemented',
    owner: 'vector-pipeline',
    lane: 'semantic',
    proofGate: 'QDRANT_SEMANTIC_LANE_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts',
      'sveltekit-frontend/src/lib/server/embedding/semantic-packet-writer.ts',
    ],
    evidenceRefs: ['phase-15-qdrant-semantic-lane-implemented'],
    openGaps: ['lane is implemented in mock form for this end-to-end ladder'],
    mockArtifacts: ['qdrant-semantic-lane.mock.json'],
    nextGate: 'wire the semantic lane receipt through the workstation snapshot',
  },
  {
    phase: 16,
    title: 'Graph / KAG / DAG refresh manifest',
    status: 'partial',
    owner: 'graph-refresh',
    lane: 'graph',
    proofGate: 'GRAPH_REFRESH_MANIFEST_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/board/daily-graphify-board.ts',
      'sveltekit-frontend/src/lib/server/atlas/board/phase89-workflow.ts',
    ],
    evidenceRefs: ['phase-16-graph-refresh-manifest-stub'],
    openGaps: ['refresh manifest is still partial'],
    mockArtifacts: ['graph-refresh-manifest.mock.json'],
    nextGate: 'surface the graph refresh mock output',
  },
  {
    phase: 17,
    title: 'PyTorch feature extraction lane',
    status: 'partial',
    owner: 'feature-extraction',
    lane: 'pytorch',
    proofGate: 'PYTORCH_FEATURE_EXTRACTION_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/contracts/feature-extraction-v1.ts',
      'sveltekit-frontend/src/lib/server/atlas/contracts/gpu-quantization-v1.ts',
    ],
    evidenceRefs: ['phase-17-pytorch-feature-extraction-stub'],
    openGaps: ['feature extraction remains partial in live mode'],
    mockArtifacts: ['pytorch-feature-extraction.mock.json'],
    nextGate: 'attach the feature extraction mock artifact to the snapshot',
  },
  {
    phase: 18,
    title: 'XGBoost / gradient tree boosting reranker',
    status: 'partial',
    owner: 'ranking',
    lane: 'reranker',
    proofGate: 'XGBOOST_RERANKER_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/contracts/retrieval-candidate.ts',
      'sveltekit-frontend/src/lib/server/atlas/contracts/recommendation.ts',
    ],
    evidenceRefs: ['phase-18-xgboost-reranker-stub'],
    openGaps: ['evaluation surface only; no promotion claim'],
    mockArtifacts: ['xgboost-reranker.mock.json'],
    nextGate: 'keep the reranker as a mock-only evaluation surface',
  },
  {
    phase: 19,
    title: 'Deterministic HMM + linear policy baseline',
    status: 'partial',
    owner: 'agentic-repair',
    lane: 'policy',
    proofGate: 'HMM_LINEAR_POLICY_BASELINE_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/atlas-fsm-policy.ts',
      'sveltekit-frontend/src/lib/server/atlas/policy/policy-state.ts',
    ],
    evidenceRefs: ['phase-19-hmm-linear-policy-stub'],
    openGaps: ['baseline remains partial in this mock ladder'],
    mockArtifacts: ['hmm-linear-policy.mock.json'],
    nextGate: 'expose the deterministic policy receipt in the snapshot',
  },
  {
    phase: 20,
    title: 'DSPy program contract',
    status: 'planned',
    owner: 'program-contracts',
    lane: 'program',
    proofGate: 'DSPY_PROGRAM_CONTRACT_PROVEN',
    sourceRefs: ['sveltekit-frontend/src/lib/server/atlas/contracts/recommendation.ts'],
    evidenceRefs: ['phase-20-dspy-program-contract-stub'],
    openGaps: ['planned lane only; mock contract shape needed'],
    mockArtifacts: ['dspy-program-contract.mock.json'],
    nextGate: 'keep as a stubbed contract with a stable shape',
  },
  {
    phase: 21,
    title: 'GEPA reflective program optimization',
    status: 'planned',
    owner: 'program-optimization',
    lane: 'program',
    proofGate: 'GEPA_PROGRAM_OPTIMIZATION_PROVEN',
    sourceRefs: ['sveltekit-frontend/src/lib/server/atlas/contracts/recommendation.ts'],
    evidenceRefs: ['phase-21-gepa-optimization-stub'],
    openGaps: ['planned lane only; no live optimization claim'],
    mockArtifacts: ['gepa-optimization.mock.json'],
    nextGate: 'keep as a mock optimization lane only',
  },
  {
    phase: 22,
    title: 'XGBoost / gradient boosting / reinforcement-learning experiments',
    status: 'planned',
    owner: 'learning-experiments',
    lane: 'learning',
    proofGate: 'LEARNING_EXPERIMENTS_PROVEN',
    sourceRefs: [
      'sveltekit-frontend/src/lib/server/atlas/contracts/retrieval-candidate.ts',
      'sveltekit-frontend/src/lib/server/atlas/contracts/recommendation.ts',
    ],
    evidenceRefs: ['phase-22-learning-experiments-stub'],
    openGaps: ['experimental lane only; no promotion claim'],
    mockArtifacts: ['xgboost-rl-experiments.mock.json'],
    nextGate: 'keep this lane isolated from the evaluation surface',
  },
  {
    phase: 23,
    title: 'QLoRA / SFT',
    status: 'eval-only',
    owner: 'fine-tuning',
    lane: 'training',
    proofGate: 'QLORA_SFT_EVAL_ONLY',
    sourceRefs: ['sveltekit-frontend/src/routes/api/admin/qlora/+server.ts'],
    evidenceRefs: ['phase-23-qlora-sft-stub'],
    openGaps: ['evaluation only; no production claim'],
    mockArtifacts: ['qlora-sft.mock.json'],
    nextGate: 'keep the lane mocked and evaluation-only',
  },
  {
    phase: 24,
    title: 'DPO',
    status: 'eval-only',
    owner: 'alignment',
    lane: 'training',
    proofGate: 'DPO_EVAL_ONLY',
    sourceRefs: ['sveltekit-frontend/src/routes/api/admin/qlora/+server.ts'],
    evidenceRefs: ['phase-24-dpo-stub'],
    openGaps: ['evaluation only; no production claim'],
    mockArtifacts: ['dpo.mock.json'],
    nextGate: 'keep the lane mocked and evaluation-only',
  },
  {
    phase: 25,
    title: 'PPO',
    status: 'eval-only',
    owner: 'alignment',
    lane: 'training',
    proofGate: 'PPO_EVAL_ONLY',
    sourceRefs: ['sveltekit-frontend/src/routes/api/admin/qlora/+server.ts'],
    evidenceRefs: ['phase-25-ppo-stub'],
    openGaps: ['evaluation only; not yet graded'],
    mockArtifacts: ['ppo.mock.json'],
    nextGate: 'keep the lane mocked until it is explicitly graded',
  },
];

function buildReceiptId(seed: PhaseSeed): string {
  return `phase-${seed.phase}-${createHash('sha256')
    .update(JSON.stringify({
      phase: seed.phase,
      title: seed.title,
      status: seed.status,
      owner: seed.owner,
      lane: seed.lane,
      proofGate: seed.proofGate,
      openGaps: seed.openGaps,
      mockArtifacts: seed.mockArtifacts,
    }))
    .digest('hex')
    .slice(0, 16)}`;
}

function buildReceipt(seed: PhaseSeed): ParentAtlasPhaseLaneReceipt {
  return {
    receipt_id: buildReceiptId(seed),
    phase: seed.phase,
    status: seed.status,
    execution_mode: 'mock',
    owner: seed.owner,
    summary: `${seed.title} — ${seed.status} / ${seed.lane}`,
    source_refs: seed.sourceRefs,
    evidence_refs: seed.evidenceRefs,
    artifacts: seed.mockArtifacts,
    next_gate: seed.nextGate,
    canonical_representation_id: SEMANTIC_REPRESENTATION_ID,
    canonical_dimension: SEMANTIC_DIMENSION,
    created_at: new Date(0).toISOString(),
  };
}

function buildPhaseLane(seed: PhaseSeed): ParentAtlasPhaseLane {
  return PhaseLaneSchema.parse({
    phase: seed.phase,
    title: seed.title,
    status: seed.status,
    execution_mode: 'mock',
    owner: seed.owner,
    lane: seed.lane,
    canonical_representation_id: SEMANTIC_REPRESENTATION_ID,
    canonical_dimension: SEMANTIC_DIMENSION,
    proof_gate: seed.proofGate,
    source_refs: seed.sourceRefs,
    evidence_refs: seed.evidenceRefs,
    open_gaps: seed.openGaps,
    mock_artifacts: seed.mockArtifacts,
    receipt: buildReceipt(seed),
  });
}

export function listParentAtlasPhaseLanes(): ParentAtlasPhaseLane[] {
  return PHASE_SEEDS.map((seed) => buildPhaseLane(seed));
}

export function getParentAtlasPhaseLane(phase: ParentAtlasPhaseLaneId): ParentAtlasPhaseLane | null {
  const seed = PHASE_SEEDS.find((entry) => entry.phase === phase);
  return seed ? buildPhaseLane(seed) : null;
}

export function getParentAtlasPhaseLaneSnapshot(): ParentAtlasPhaseLaneSnapshot {
  const phases = listParentAtlasPhaseLanes();
  const summary: ParentAtlasPhaseLaneSummary = {
    total: phases.length,
    partial: phases.filter((phase) => phase.status === 'partial').length,
    implemented: phases.filter((phase) => phase.status === 'implemented').length,
    planned: phases.filter((phase) => phase.status === 'planned').length,
    evalOnly: phases.filter((phase) => phase.status === 'eval-only').length,
    mock: phases.length,
    canonicalRepresentationId: SEMANTIC_REPRESENTATION_ID,
    canonicalDimension: SEMANTIC_DIMENSION,
  };

  return ParentAtlasPhaseLaneSnapshotSchema.parse({
    generated_at: new Date(0).toISOString(),
    summary,
    phases,
    open_gaps: phases.flatMap((phase) => phase.open_gaps),
  });
}

export function buildParentAtlasPhaseLaneReport(): string {
  const snapshot = getParentAtlasPhaseLaneSnapshot();
  const lines = [
    `Parent Atlas phase lanes: ${snapshot.summary.total}`,
    `partial=${snapshot.summary.partial}`,
    `implemented=${snapshot.summary.implemented}`,
    `planned=${snapshot.summary.planned}`,
    `evalOnly=${snapshot.summary.evalOnly}`,
    `canonical=${snapshot.summary.canonicalRepresentationId}/${snapshot.summary.canonicalDimension}`,
  ];

  for (const phase of snapshot.phases) {
    lines.push(
      `${phase.phase}. ${phase.title} — ${phase.status} — ${phase.proof_gate} — ${phase.receipt.receipt_id}`,
    );
  }

  return lines.join('\n');
}
