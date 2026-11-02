import { z } from 'zod';

const laneSchema = z.object({
  id: z.enum(['evidence-synthesis', 'taxonomy-timeline', 'low-rank-recommendations', 'recursive-verification']),
  title: z.string().min(1).max(100),
  status: z.enum(['PROPOSED', 'UNVERIFIED', 'CONFLICTED', 'BLOCKED']),
  maturity: z.enum(['PARTIAL', 'EVAL_ONLY', 'NOT_WIRED']),
  summary: z.string().min(1).max(500),
  blockers: z.array(z.string().min(1).max(240)).max(6),
  sourceRefs: z.array(z.string().min(1).max(300)).max(8),
  algorithmRevision: z.string().min(1).max(160),
  workspaceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
  receiptAt: z.string().datetime().nullable(),
}).strict();

export const AgenticWorkflowProposalBoardV1Schema = z.object({
  schema: z.literal('atlas.agentic-workflow-proposal-board.v1'),
  admission: z.literal('PROPOSAL_ONLY'),
  canonicalAuthority: z.literal(false),
  lanes: z.array(laneSchema).length(4),
}).strict().superRefine((board, context) => {
  const ids = board.lanes.map((lane) => lane.id);
  if (new Set(ids).size !== 4) {
    context.addIssue({ code: 'custom', path: ['lanes'], message: 'WORKFLOW_LANE_IDS_MUST_BE_UNIQUE' });
  }
});

export type AgenticWorkflowProposalBoardV1 = z.infer<typeof AgenticWorkflowProposalBoardV1Schema>;

export const agenticWorkflowProposalBoardV1: AgenticWorkflowProposalBoardV1 = AgenticWorkflowProposalBoardV1Schema.parse({
  schema: 'atlas.agentic-workflow-proposal-board.v1',
  admission: 'PROPOSAL_ONLY',
  canonicalAuthority: false,
  lanes: [
    {
      id: 'evidence-synthesis',
      title: 'Evidence synthesis',
      status: 'UNVERIFIED',
      maturity: 'PARTIAL',
      summary: 'Grounded synthesis helpers and the durable upload handoff exist; current LangExtract service availability is not established by this board.',
      blockers: ['No current end-to-end upload receipt proving extraction, summary provenance, and readback together.'],
      sourceRefs: [
        'sveltekit-frontend/src/lib/server/evidence/synthesis/evidence-synthesis-v1.ts',
        'sveltekit-frontend/src/lib/server/queue/queue-worker.ts',
      ],
      algorithmRevision: 'atlas-evidence-synthesis-v1',
      workspaceRevision: null,
      receiptAt: null,
    },
    {
      id: 'taxonomy-timeline',
      title: 'Taxonomy and timeline',
      status: 'BLOCKED',
      maturity: 'PARTIAL',
      summary: 'Proposal-only taxonomy and timeline helpers preserve supporting and contradicting claim references.',
      blockers: ['Canonical feature_registry is absent.', 'The reviewed feature-to-taxonomy crosswalk and live OAK revision binding are incomplete.'],
      sourceRefs: [
        'sveltekit-frontend/src/lib/server/evidence/synthesis/evidence-taxonomy-proposal-v1.ts',
        'sveltekit-frontend/src/lib/server/evidence/synthesis/evidence-timeline-proposal-v1.ts',
      ],
      algorithmRevision: 'atlas.evidence-timeline-proposal.v1',
      workspaceRevision: null,
      receiptAt: null,
    },
    {
      id: 'low-rank-recommendations',
      title: 'Low-rank recommendations',
      status: 'BLOCKED',
      maturity: 'EVAL_ONLY',
      summary: 'A bounded CPU masked-SVD challenger proposes unknown feature pairs from a checksummed sparse snapshot.',
      blockers: ['No canonical feature labels or qualified live input reader.', 'No held-out relevance evaluation; not connected to production ranking.'],
      sourceRefs: [
        'python/atlas_compute/sparse_feature_svd_recommender_v1.py',
        'sveltekit-frontend/src/lib/server/atlas/recommendations/sparse-feature-snapshot-v1.ts',
      ],
      algorithmRevision: 'masked_soft_impute_truncated_svd_cpu_v1',
      workspaceRevision: null,
      receiptAt: null,
    },
    {
      id: 'recursive-verification',
      title: 'Recursive verification',
      status: 'BLOCKED',
      maturity: 'NOT_WIRED',
      summary: 'Bounded agent and RLM building blocks exist, but the four-role proposal-to-independent-verifier workflow is not integrated end to end.',
      blockers: ['No independent test/readback receipt is connected to an admission controller.', 'GEPA optimization remains an offline evaluation lane.'],
      sourceRefs: [
        'sveltekit-frontend/src/lib/server/atlas/agentic/agent-execution-spine-v1.ts',
        'sveltekit-frontend/src/lib/server/atlas/agentic/agent-control-plane-v1.ts',
      ],
      algorithmRevision: 'not-asserted',
      workspaceRevision: null,
      receiptAt: null,
    },
  ],
});
