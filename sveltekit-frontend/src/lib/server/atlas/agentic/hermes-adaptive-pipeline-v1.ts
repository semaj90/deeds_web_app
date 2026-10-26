import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  type AuthoritativeLeaseStateV1,
  type BridgeAdmissionResultV1,
  type WorktreeStreamHeadV1,
  proposeKanbanWorkspaceEventV1,
} from '../workspace/kanban-workspace-event-bridge-v1.js';
import {
  type FmRank4ModelArtifactV1,
  type QueryCandidateTrainingRowV1,
  scoreCandidateFmRank4,
  trainFmRank4Model,
} from '../ranking/fm-ranker-v1.js';
import {
  type RawCandidateFunctionInputV1,
  type RankedFunctionReceiptV1,
  rankFunctionsWithFm4V1,
} from '../ranking/ranked-function-receipt-v1.js';
import {
  type SynthesizedWorkflowDagV1,
  synthesizeWorkflowDagV1,
} from '../workflow/workflow-synthesis-v1.js';
import {
  type TournamentCandidateProposalV1,
  type TournamentWinnerReceiptV1,
  runOpenSpecWorkflowTournamentV1,
} from '../tournament/openspec-workflow-tournament-v1.js';
import {
  type PromotionExecutionReceiptV1,
  authorizeTournamentPromotionV1,
} from '../tournament/openspec-promotion-gate-v1.js';

export const ACE_CONTEXT_PACKET_SCHEMA = 'atlas.ace-context-packet.v1' as const;

/**
 * NES-Style Lookup Table (LUT) mapping for inverse prompt injection detection and neutralizing.
 * Neutralizes directive injection vectors, delimiter tampering, and control tokens.
 */
export const INJECTION_DIRECTIVE_PATTERNS = [
  /ignore\s+(?:all\s+)?previous\s+(?:instructions|prompts|rules)/gi,
  /you\s+are\s+now\s+(?:in\s+)?developer\s+mode/gi,
  /<\|(?:im_start|im_end|system|user|assistant)\|>/gi,
  /\[SYSTEM_INSTRUCTION\]/gi,
  /```(?:system|admin|root)/gi,
  /reveal\s+(?:your\s+)?(?:system\s+prompt|hidden\s+instructions)/gi,
] as const;

export interface SanitizedContentResult {
  sanitized: string;
  injectionDetected: boolean;
  neutralizedDirectivesCount: number;
}

/**
 * Scans content through an inverse prompt-injection LUT, neutralizing directive vectors
 * so the LLM processes text strictly as passive data rather than actionable instructions.
 */
export function sanitizeContentViaNesLut(rawContent: string): SanitizedContentResult {
  let sanitized = rawContent;
  let neutralizedDirectivesCount = 0;

  for (const pattern of INJECTION_DIRECTIVE_PATTERNS) {
    const matches = sanitized.match(pattern);
    if (matches) {
      neutralizedDirectivesCount += matches.length;
      sanitized = sanitized.replace(pattern, (match) => `[NEUTRALIZED_DIRECTIVE: ${match.replace(/</g, '&lt;')}]`);
    }
  }

  // Escape raw markdown directive delimiters
  sanitized = sanitized.replace(/<\|/g, '&lt;|').replace(/\|>/g, '|&gt;');

  return {
    sanitized: `<!-- DATA_RECORD_START -->\n${sanitized}\n<!-- DATA_RECORD_END -->`,
    injectionDetected: neutralizedDirectivesCount > 0,
    neutralizedDirectivesCount,
  };
}

export const AceContextPacketV1Schema = z
  .object({
    schema: z.literal(ACE_CONTEXT_PACKET_SCHEMA),
    runId: z.string().min(1),
    sourceRef: z.string().min(1),
    conceptId: z.string().min(1),
    confidenceScore: z.number().min(0).max(1),
    contextBlob: z.string().min(1),
    redisKey: z.string().regex(/^ace:packet:[a-zA-Z0-9_\-]+$/),
    injectionSanitized: z.boolean(),
    packetChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    // Invariants
    hiddenThoughtsPersisted: z.literal(false),
    kvCachePersisted: z.literal(false),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type AceContextPacketV1 = z.infer<typeof AceContextPacketV1Schema>;

/**
 * Pure packet synthesis: builds an ACE context packet descriptor and its proposed Redis key
 * (`ace:packet:{runId}`) from qualified inputs.
 *
 * - Performs no I/O: it opens no Redis connection, writes nothing, and asserts no storage success.
 * - `redisKey` is a cache locator, not the packet's identity. Identity stays with the packet fabric
 *   (`sourceRef`, `packetChecksum`); a Redis write must never change canonicality (`canonicalAuthority` is false).
 * - Persistence and injection belong to a separate adapter, which must emit its own write/read-back receipt.
 */
export function buildAceContextPacketV1(input: {
  runId: string;
  sourceRef: string;
  conceptId: string;
  confidenceScore: number;
  rawEvidence: string;
}): AceContextPacketV1 {
  const { sanitized, injectionDetected } = sanitizeContentViaNesLut(input.rawEvidence);

  const payload = {
    runId: input.runId,
    sourceRef: input.sourceRef,
    conceptId: input.conceptId,
    confidenceScore: Number(input.confidenceScore.toFixed(4)),
    contextBlob: sanitized,
  };

  const hash = createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');

  return AceContextPacketV1Schema.parse({
    schema: ACE_CONTEXT_PACKET_SCHEMA,
    runId: input.runId,
    sourceRef: input.sourceRef,
    conceptId: input.conceptId,
    confidenceScore: payload.confidenceScore,
    contextBlob: sanitized,
    redisKey: `ace:packet:${input.runId}`,
    injectionSanitized: true,
    packetChecksum: `sha256:${hash}`,
    hiddenThoughtsPersisted: false,
    kvCachePersisted: false,
    canonicalAuthority: false,
  });
}

export const HermesStageToolEventV1Schema = z
  .object({
    toolEventId: z.string().min(1),
    stage: z.enum(['typecheck', 'unitTests', 'graphEvidence']),
    toolName: z.string().min(1),
    toolVersion: z.string().min(1),
    exitCode: z.number().int(),
    stdoutHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    durationMs: z.number().nonnegative(),
    diagnosticsCount: z.number().int().nonnegative().optional(),
    passedTests: z.number().int().nonnegative().optional(),
    failedTests: z.number().int().nonnegative().optional(),
    suiteReceiptRef: z.string().optional(),
    unresolvedNodesCount: z.number().int().nonnegative().optional(),
    peakMemoryMb: z.number().nonnegative().optional(),
  })
  .strict();
export type HermesStageToolEventV1 = z.infer<typeof HermesStageToolEventV1Schema>;

export interface HermesAgentStepInputV1 {
  taskId: string;
  taskGoal: string;
  runId: string;
  lease: AuthoritativeLeaseStateV1;
  streamHead: WorktreeStreamHeadV1;
  rawCandidates: readonly RawCandidateFunctionInputV1[];
  model: FmRank4ModelArtifactV1;
  workspaceRevision: string;
  stageToolEvents?: readonly HermesStageToolEventV1[];
  approvalDecision?: {
    approved: boolean;
    approvedBy: string;
  };
  now?: string;
}

export interface HermesAgentStepResultV1 {
  rankedReceipt: RankedFunctionReceiptV1;
  synthesizedDag: SynthesizedWorkflowDagV1;
  tournamentReceipt: TournamentWinnerReceiptV1;
  promotionReceipt: PromotionExecutionReceiptV1 | null;
  workspaceEventAdmission: BridgeAdmissionResultV1;
  aceContextPacket: AceContextPacketV1;
}

/**
 * End-to-End Hermes / Paperclip Agent Execution Loop:
 * 1. Fenced Lease & Workspace verification
 * 2. FM Rank-4 (61-parameter) function ranking
 * 3. Typed Workflow Synthesis with capability gates
 * 4. OpenSpec Tournament evaluation
 * 5. Promotion Gate authorization
 * 6. Fenced Workspace Event & Targeted Invalidation generation
 * 7. NES LUT inverse prompt injection sanitization & ACE context packet emission
 */
export function executeHermesAgentStepV1(input: HermesAgentStepInputV1): HermesAgentStepResultV1 {
  // 1. Function Ranking (FM-09)
  const rankedReceipt = rankFunctionsWithFm4V1({
    queryText: input.taskGoal,
    workspaceRevision: input.workspaceRevision,
    model: input.model,
    candidates: input.rawCandidates,
    topK: 5,
  });

  // 2. Typed Workflow Synthesis (DAG-01)
  const dagResult = synthesizeWorkflowDagV1({
    taskGoal: input.taskGoal,
    rankedReceipt,
    targetWorkspaceRevision: input.workspaceRevision,
    grantedPermissions: ['READ_ONLY', 'EXECUTE_TESTS'],
    includeVerificationStep: true,
  });

  if (dagResult.decision !== 'ACCEPT') {
    throw new Error(`WORKFLOW_SYNTHESIS_REJECTED: ${dagResult.rejectionReason} - ${dagResult.message}`);
  }
  const synthesizedDag = dagResult.dag;

  // 3. OpenSpec Tournament Evaluation (OPSX-01)
  const winningCandidate = rankedReceipt.rankedCandidates[0];
  const patchSha = `sha256:${createHash('sha256').update(winningCandidate.symbolName).digest('hex')}`;

  const toolEvents = input.stageToolEvents ?? [];
  const tcEvent = toolEvents.find((e) => e.stage === 'typecheck');
  const utEvent = toolEvents.find((e) => e.stage === 'unitTests');
  const geEvent = toolEvents.find((e) => e.stage === 'graphEvidence');

  const toolVersions: Record<string, string> = {};
  for (const event of toolEvents) {
    toolVersions[event.toolName] = event.toolVersion;
  }

  const typecheckPass = !!tcEvent && tcEvent.exitCode === 0 && (tcEvent.diagnosticsCount ?? 0) === 0;
  const unitTestsPass = !!utEvent && utEvent.exitCode === 0 && (utEvent.failedTests ?? 0) === 0;
  const graphEvidencePass = !!geEvent && geEvent.exitCode === 0 && (geEvent.unresolvedNodesCount ?? 0) === 0;

  const totalDuration = toolEvents.reduce((acc, e) => acc + e.durationMs, 0);
  const peakMem = toolEvents.reduce((acc, e) => Math.max(acc, e.peakMemoryMb ?? 0), 0);

  const tournamentProposal: TournamentCandidateProposalV1 = {
    candidateId: winningCandidate.canonicalId,
    agentId: input.lease.ownerAgent,
    dag: synthesizedDag,
    patchDigest: patchSha,
    toolVersions: Object.keys(toolVersions).length > 0 ? toolVersions : { unverified: '0.0.0' },
    stages: {
      typecheck: {
        pass: typecheckPass,
        diagnosticsCount: tcEvent?.diagnosticsCount ?? (typecheckPass ? 0 : 1),
      },
      unitTests: {
        pass: unitTestsPass,
        passedTests: utEvent?.passedTests ?? 0,
        failedTests: utEvent?.failedTests ?? (unitTestsPass ? 0 : 1),
        suiteReceiptRef: utEvent?.suiteReceiptRef,
      },
      graphEvidence: {
        pass: graphEvidencePass,
        unresolvedNodesCount: geEvent?.unresolvedNodesCount ?? (graphEvidencePass ? 0 : 1),
      },
      resourceUsage: {
        durationMs: totalDuration,
        peakMemoryMb: peakMem > 0 ? peakMem : undefined,
      },
    },
  };

  const tournamentReceipt = runOpenSpecWorkflowTournamentV1({
    tournamentId: `tourn_${input.runId}`,
    taskGoal: input.taskGoal,
    workspaceRevision: input.workspaceRevision,
    rollbackSnapshotRevision: input.lease.baseCommit,
    candidates: [tournamentProposal],
    approvalDecision: input.approvalDecision,
  });

  // 4. Promotion Gate (PROMOTE-01)
  let promotionReceipt: PromotionExecutionReceiptV1 | null = null;
  if (tournamentReceipt.canPromote) {
    const promotionResult = authorizeTournamentPromotionV1({
      tournamentReceipt,
      appliedWorkspaceRevision: input.workspaceRevision,
    });
    if (promotionResult.decision === 'ACCEPT') {
      promotionReceipt = promotionResult.receipt;
    }
  }

  const now = input.now ?? new Date().toISOString();

  // 5. Kanban Workspace Event Adapter (WORKSPACE-EVENT-BRIDGE-01)
  const workspaceEventAdmission = proposeKanbanWorkspaceEventV1({
    lease: input.lease,
    head: input.streamHead,
    now,
    candidate: {
      workspaceId: input.streamHead.workspaceId,
      worktreeId: input.lease.worktreeId,
      branch: input.lease.branch,
      taskId: input.taskId,
      executionRunId: input.runId,
      leaseId: input.lease.leaseId,
      presentedFenceToken: input.lease.leaseFenceToken,
      presentedBaseCommit: input.lease.baseCommit,
      actor: input.lease.ownerAgent,
      idempotencyKey: `idem_hermes_${input.runId}`,
      eventType: 'SOURCE_UPDATED',
      affectedSourceRefs: [winningCandidate.sourceRef],
      invalidatedAstSymbols: [winningCandidate.symbolName],
      invalidatedPacketKeys: [winningCandidate.packetKey],
      invalidatedContextManifestIds: [input.runId],
      occurredAt: now,
      tool: 'hermes-agent-v1',
    },
  });

  // 6. NES LUT Sanitization & ACE Context Packet Synthesis
  const aceContextPacket = buildAceContextPacketV1({
    runId: input.runId,
    sourceRef: winningCandidate.sourceRef,
    conceptId: `concept:${winningCandidate.symbolName}`,
    confidenceScore: winningCandidate.score > 1 ? 1.0 : Math.max(0, winningCandidate.score),
    rawEvidence: `Function ${winningCandidate.symbolName} from ${winningCandidate.sourceRef}`,
  });

  return {
    rankedReceipt,
    synthesizedDag,
    tournamentReceipt,
    promotionReceipt,
    workspaceEventAdmission,
    aceContextPacket,
  };
}

export interface TournamentOutcomeTrainingInputV1 {
  queryId: string;
  candidateId: string;
  features: readonly number[];
  outcomeSuccess: boolean;
  /**
   * Provenance gate: Must provide verified tool event evidence or tournament receipt checksum.
   * If unverified or fabricated, the row is rejected from backpropagation to avoid training on fabricated outcomes.
   */
  verifiedEvidenceRef?: string;
  stageEventHashes?: readonly string[];
}

/**
 * Adaptive Backpropagation: Updates the 61-parameter FM Rank-4 model from reviewed tournament outcomes.
 * Offline optimization ensures model updates occur without mutating live state mid-request.
 * Strictly requires verified tool evidence refs; rejects fabricated or ungrounded tournament outcomes.
 */
export function adaptRankerFromOutcomesV1(
  currentModel: FmRank4ModelArtifactV1,
  outcomes: ReadonlyArray<TournamentOutcomeTrainingInputV1>
): FmRank4ModelArtifactV1 {
  const verifiedRows = outcomes.filter(
    (o) => o.verifiedEvidenceRef && o.stageEventHashes && o.stageEventHashes.length > 0
  );

  if (verifiedRows.length === 0) {
    // Zero verified outcomes; do not mutate weights with ungrounded data
    return currentModel;
  }

  const trainingRows: QueryCandidateTrainingRowV1[] = verifiedRows.map((o) => ({
    queryId: o.queryId,
    candidateId: o.candidateId,
    features: o.features,
    label: o.outcomeSuccess ? 3 : 0, // Successful verified tournament outcomes receive high relevance grade
  }));

  return trainFmRank4Model(trainingRows, {
    learningRate: 0.02,
    epochs: 60,
  });
}
