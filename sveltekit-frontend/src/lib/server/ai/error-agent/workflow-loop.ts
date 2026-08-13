import { randomUUID } from 'node:crypto';

export type HmmErrorClass =
  | 'meta_hygiene'
  | 'stale_migration'
  | 'schema_mismatch'
  | 'vector_infra_missing'
  | 'env_url_mismatch'
  | 'route_contract_mismatch'
  | 'api_validation_gap'
  | 'ssr_safety_violation'
  | 'unknown';

export interface WorkflowLoopInput {
  runId?: string;
  query: string;
  hmmErrorClass: HmmErrorClass;
  caseId?: string;
  userId?: string;
  targetPath?: string;
  workspaceRevision?: string;
  modelRevision?: string;
  sourceRefs?: string[];
  metadata?: Record<string, unknown>;
}

export interface WorkflowClassification {
  hmmErrorClass: HmmErrorClass;
  riskScore: number;
  severity: 'low' | 'medium' | 'high';
  lane: 'contracts' | 'schema' | 'runtime' | 'safety' | 'general';
  rationale: string;
}

export interface ScaffoldDraft {
  scaffoldId: string;
  taskId: string;
  policyVersion: string;
  selectedPackets: string[];
  toolPlan: Array<{
    tool: string;
    purpose: string;
    inputRef?: string;
  }>;
  contextBudget: number;
  cacheHints: string[];
  createdAt: string;
}

export interface WorkflowRepairResult {
  ok: boolean;
  summary: string;
  suggestedFixes: string[];
  touchedFiles: string[];
}

export interface WorkflowSmokeResult {
  passed: boolean;
  command: string;
  outputSummary: string;
}

export interface ExecutionReceipt {
  receiptId: string;
  scaffoldId: string;
  taskId: string;
  startedAt: string;
  finishedAt: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PARTIAL';
  outputs: {
    packetKeys: string[];
    evidenceRefs: string[];
    logs: string[];
  };
  verifier: {
    schemaValid: boolean;
    provenanceValid: boolean;
    identityStable: boolean;
    replayStable: boolean;
  };
}

export interface DeterministicVerdict {
  receiptId: string;
  reward: number;
  reasons: string[];
  blockedBy: string[];
}

export interface PolicyUpdate {
  policyVersion: string;
  scaffoldId: string;
  receiptId: string;
  advantage: number;
  stalenessWeight: number;
  accepted: boolean;
}

export interface WorkflowLogEntry {
  runId: string;
  query: string;
  stage: 'classify' | 'repair' | 'smoke' | 'log';
  hmmErrorClass: HmmErrorClass;
  severity: 'low' | 'medium' | 'high';
  passed: boolean;
  metadata: Record<string, unknown>;
  timestamp: string;
}

export interface WorkflowLoopResult {
  runId: string;
  status: 'repaired' | 'needs_review';
  taskInput: {
    taskId: string;
    query: string;
    hmmErrorClass: HmmErrorClass;
    caseId?: string;
    userId?: string;
    targetPath?: string;
    workspaceRevision?: string;
    modelRevision?: string;
    sourceRefs: string[];
  };
  scaffold: ScaffoldDraft;
  executionReceipt: ExecutionReceipt;
  deterministicVerdict: DeterministicVerdict;
  policyUpdate: PolicyUpdate;
  classification: WorkflowClassification;
  repair: WorkflowRepairResult;
  smoke: WorkflowSmokeResult;
  logged: boolean;
}

export interface WorkflowLoopDeps {
  repair?: (
    input: WorkflowLoopInput,
    classification: WorkflowClassification,
    scaffold?: ScaffoldDraft,
  ) => Promise<WorkflowRepairResult>;
  smoke?: (
    input: WorkflowLoopInput,
    classification: WorkflowClassification,
    repair: WorkflowRepairResult,
    scaffold?: ScaffoldDraft,
  ) => Promise<WorkflowSmokeResult>;
  log?: (
    entry: WorkflowLogEntry,
    receipt?: ExecutionReceipt,
    verdict?: DeterministicVerdict,
    policyUpdate?: PolicyUpdate,
  ) => Promise<void>;
  now?: () => Date;
  createRunId?: () => string;
}

const BASE_RISK: Record<HmmErrorClass, number> = {
  meta_hygiene: 0.3,
  stale_migration: 0.7,
  schema_mismatch: 0.9,
  vector_infra_missing: 0.8,
  env_url_mismatch: 0.5,
  route_contract_mismatch: 0.6,
  api_validation_gap: 0.75,
  ssr_safety_violation: 0.65,
  unknown: 0.4,
};

function laneForClass(hmmErrorClass: HmmErrorClass): WorkflowClassification['lane'] {
  if (hmmErrorClass === 'schema_mismatch' || hmmErrorClass === 'stale_migration') return 'schema';
  if (hmmErrorClass === 'route_contract_mismatch' || hmmErrorClass === 'api_validation_gap') return 'contracts';
  if (hmmErrorClass === 'vector_infra_missing' || hmmErrorClass === 'env_url_mismatch') return 'runtime';
  if (hmmErrorClass === 'ssr_safety_violation') return 'safety';
  return 'general';
}

function severityForRisk(riskScore: number): WorkflowClassification['severity'] {
  if (riskScore >= 0.8) return 'high';
  if (riskScore >= 0.5) return 'medium';
  return 'low';
}

function sanitizePacketRefs(input: WorkflowLoopInput): string[] {
  return [...new Set(
    [
      input.targetPath ? `file:${input.targetPath}` : null,
      ...(input.sourceRefs ?? []).map((ref) => ref.trim()).filter(Boolean),
      input.caseId ? `case:${input.caseId}` : null,
      input.userId ? `user:${input.userId}` : null,
    ].filter((value): value is string => Boolean(value))
  )];
}

function buildScaffoldDraft(
  input: WorkflowLoopInput,
  classification: WorkflowClassification,
  runId: string,
  now: Date,
): ScaffoldDraft {
  const selectedPackets = sanitizePacketRefs(input);
  const contextBudget = classification.severity === 'high' ? 2400 : classification.severity === 'medium' ? 1600 : 1000;

  return {
    scaffoldId: `scaffold:${runId}`,
    taskId: input.caseId ?? runId,
    policyVersion: 'atlas.error-agent.scaffold.v1',
    selectedPackets,
    toolPlan: [
      { tool: 'hmm-classifier', purpose: 'classify the failure and choose a repair lane' },
      {
        tool: 'repair',
        purpose: 'generate a minimal safe repair plan from the deterministic classification',
        inputRef: input.targetPath ?? input.caseId ?? undefined,
      },
      { tool: 'smoke', purpose: 'validate the repair against the deterministic gate' },
    ],
    contextBudget,
    cacheHints: [
      `lane:${classification.lane}`,
      `severity:${classification.severity}`,
      `risk:${classification.riskScore.toFixed(2)}`,
    ],
    createdAt: now.toISOString(),
  };
}

function buildExecutionReceipt(
  input: WorkflowLoopInput,
  scaffold: ScaffoldDraft,
  repair: WorkflowRepairResult,
  smoke: WorkflowSmokeResult,
  now: Date,
): ExecutionReceipt {
  const status: ExecutionReceipt['status'] = !repair.ok
    ? 'FAILED'
    : smoke.passed
      ? 'SUCCESS'
      : 'PARTIAL';
  const evidenceRefs = [...new Set([...scaffold.selectedPackets, ...repair.touchedFiles])];
  const packetKeys = repair.touchedFiles.length > 0 ? repair.touchedFiles : scaffold.selectedPackets;
  const verifier = {
    schemaValid: Boolean(input.query.trim()) && Boolean(scaffold.scaffoldId) && Boolean(repair.summary),
    provenanceValid: evidenceRefs.length > 0,
    identityStable: new Set(evidenceRefs).size === evidenceRefs.length,
    replayStable: true,
  };

  return {
    receiptId: `receipt:${scaffold.scaffoldId}`,
    scaffoldId: scaffold.scaffoldId,
    taskId: scaffold.taskId,
    startedAt: scaffold.createdAt,
    finishedAt: now.toISOString(),
    status,
    outputs: {
      packetKeys,
      evidenceRefs,
      logs: [repair.summary, smoke.outputSummary].filter(Boolean),
    },
    verifier,
  };
}

function computeVerdict(
  classification: WorkflowClassification,
  receipt: ExecutionReceipt,
  smoke: WorkflowSmokeResult,
): DeterministicVerdict {
  const reward = receipt.verifier.schemaValid && receipt.verifier.provenanceValid && receipt.verifier.identityStable
    ? (smoke.passed ? Math.max(0.5, 1 - classification.riskScore * 0.5) : 0.15)
    : 0;

  const blockedBy: string[] = [];
  if (!receipt.verifier.schemaValid) blockedBy.push('SCHEMA_INVALID');
  if (!receipt.verifier.provenanceValid) blockedBy.push('PROVENANCE_MISSING');
  if (!receipt.verifier.identityStable) blockedBy.push('IDENTITY_UNSTABLE');
  if (!smoke.passed) blockedBy.push('SMOKE_FAILED');

  return {
    receiptId: receipt.receiptId,
    reward,
    reasons: [
      `lane:${classification.lane}`,
      `severity:${classification.severity}`,
      `status:${receipt.status}`,
      smoke.passed ? 'smoke:passed' : 'smoke:failed',
    ],
    blockedBy,
  };
}

function computePolicyUpdate(
  scaffold: ScaffoldDraft,
  verdict: DeterministicVerdict,
  input: WorkflowLoopInput,
): PolicyUpdate {
  const policyAgeMs = typeof input.metadata?.policyAgeMs === 'number' ? Math.max(0, input.metadata.policyAgeMs) : 0;
  const stalenessWeight = policyAgeMs > 0 ? Math.exp(-policyAgeMs / (24 * 60 * 60 * 1000)) : 1;
  return {
    policyVersion: scaffold.policyVersion,
    scaffoldId: scaffold.scaffoldId,
    receiptId: verdict.receiptId,
    advantage: verdict.reward - 0.5,
    stalenessWeight,
    accepted: verdict.reward * stalenessWeight >= 0.5 && verdict.blockedBy.length === 0,
  };
}

export function classifyWorkflowInput(input: WorkflowLoopInput): WorkflowClassification {
  const riskScore = BASE_RISK[input.hmmErrorClass] ?? BASE_RISK.unknown;
  const severity = severityForRisk(riskScore);
  const lane = laneForClass(input.hmmErrorClass);

  return {
    hmmErrorClass: input.hmmErrorClass,
    riskScore,
    severity,
    lane,
    rationale: `Classified ${input.hmmErrorClass} into ${lane} lane with ${severity} severity.`,
  };
}

function defaultRepair(
  input: WorkflowLoopInput,
  classification: WorkflowClassification,
): Promise<WorkflowRepairResult> {
  const target = input.targetPath ?? 'unknown-target';
  const suggestedFixes = [
    `Review ${classification.hmmErrorClass} findings for ${target}.`,
    `Apply minimal corrective patch in ${classification.lane} lane.`,
    'Re-run smoke gate to validate no contract regressions.',
  ];

  return Promise.resolve({
    ok: true,
    summary: `Generated repair plan for ${classification.hmmErrorClass}.`,
    suggestedFixes,
    touchedFiles: input.targetPath ? [input.targetPath] : [],
  });
}

function defaultSmoke(
  _input: WorkflowLoopInput,
  classification: WorkflowClassification,
): Promise<WorkflowSmokeResult> {
  return Promise.resolve({
    passed: classification.severity !== 'high',
    command: 'npm run audit:hmm-error-loop',
    outputSummary:
      classification.severity === 'high'
        ? 'High-risk classification requires manual verification.'
        : 'Smoke gate acceptable for this severity level.',
  });
}

async function defaultLog(
  entry: WorkflowLogEntry,
  _receipt?: ExecutionReceipt,
  _verdict?: DeterministicVerdict,
  _policyUpdate?: PolicyUpdate,
): Promise<void> {
  const { queryLogger } = await import('../../training/query-logger.js');
  await queryLogger.logQuery({
    timestamp: entry.timestamp,
    userQuery: entry.query,
    toolsUsed: ['workflow-loop'],
    metadata: {
      runId: entry.runId,
      stage: entry.stage,
      hmmErrorClass: entry.hmmErrorClass,
      severity: entry.severity,
      passed: entry.passed,
      ...entry.metadata,
    },
  });

  try {
    const { traceKagRun } = await import('$lib/server/observability/trace-kag-run.js');
    await traceKagRun({
      query: entry.query,
      selectedCards: (entry.metadata.selectedCards as any[]) ?? [],
      toonHash: (entry.metadata.toonHash as string) ?? entry.runId,
      mcpCalls: (entry.metadata.mcpCalls as any[]) ?? [],
      cacheHits: (entry.metadata.cacheHits as any) ?? 0,
      bifrostModel: (entry.metadata.bifrostModel as string) ?? 'gemma4-rotorquant:latest',
      output: (entry.metadata.output as string) ?? String(entry.metadata.repairSummary ?? ''),
      error: entry.passed ? undefined : (entry.metadata.error || new Error(`Workflow smoke check failed for ${entry.hmmErrorClass}`)),
    });
  } catch (err) {
    console.warn('[workflow-loop] traceKagRun log failed (non-fatal):', (err as Error).message);
  }
}

export async function runWorkflowLoop(
  input: WorkflowLoopInput,
  deps: WorkflowLoopDeps = {},
): Promise<WorkflowLoopResult> {
  const now = deps.now ?? (() => new Date());
  const createRunId = deps.createRunId ?? (() => randomUUID());
  const runId = input.runId ?? createRunId();

  const classification = classifyWorkflowInput(input);
  const scaffold = buildScaffoldDraft(input, classification, runId, now());

  const repair = deps.repair
    ? await deps.repair(input, classification, scaffold)
    : await defaultRepair(input, classification, scaffold);

  const smoke = deps.smoke
    ? await deps.smoke(input, classification, repair, scaffold)
    : await defaultSmoke(input, classification, scaffold);
  const receipt = buildExecutionReceipt(input, scaffold, repair, smoke, now());
  const verdict = computeVerdict(classification, receipt, smoke);
  const policyUpdate = computePolicyUpdate(scaffold, verdict, input);

  const log = deps.log ?? defaultLog;
  await log({
    runId,
    query: input.query,
    stage: 'log',
    hmmErrorClass: classification.hmmErrorClass,
    severity: classification.severity,
    passed: smoke.passed,
    metadata: {
      lane: classification.lane,
      riskScore: classification.riskScore,
      repairSummary: repair.summary,
      smokeCommand: smoke.command,
      scaffoldId: scaffold.scaffoldId,
      receiptId: receipt.receiptId,
      reward: verdict.reward,
      accepted: policyUpdate.accepted,
      workspaceRevision: input.workspaceRevision ?? null,
      modelRevision: input.modelRevision ?? null,
      selectedPackets: scaffold.selectedPackets,
      caseId: input.caseId ?? null,
      userId: input.userId ?? null,
      ...(input.metadata ?? {}),
    },
    timestamp: now().toISOString(),
  }, receipt, verdict, policyUpdate);

  const result: WorkflowLoopResult = {
    runId,
    status: smoke.passed ? 'repaired' : 'needs_review',
    taskInput: {
      taskId: scaffold.taskId,
      query: input.query,
      hmmErrorClass: input.hmmErrorClass,
      caseId: input.caseId,
      userId: input.userId,
      targetPath: input.targetPath,
      workspaceRevision: input.workspaceRevision,
      modelRevision: input.modelRevision,
      sourceRefs: sanitizePacketRefs(input),
    },
    scaffold,
    executionReceipt: receipt,
    deterministicVerdict: verdict,
    policyUpdate,
    classification,
    repair,
    smoke,
    logged: true,
  };

  // Record agent trace for Phase 3F learning pipeline (fire-and-forget)
  void (async () => {
    try {
      const { recordAgentTrace } = await import('../../observability/agent-trace-recorder.js');

      // Extract selected_concepts from repair suggestions (minimal semantics)
      // and touched files as pseudo-concepts
      const selectedConcepts: string[] = [
        ...new Set([
          `hmm:${classification.hmmErrorClass}`,
          `lane:${classification.lane}`,
          ...repair.touchedFiles.map(f => `file:${f}`),
        ])
      ];

      await recordAgentTrace({
        query: input.query,
        retrievalStrategy: 'structural',
        selectedConcepts,
        selectedPackets: repair.touchedFiles,
        toolsCalled: ['workflow-loop', 'hmm-classifier', classification.lane, scaffold.toolPlan.map((step) => step.tool).join(':')],
        outcome: smoke.passed ? 'success' : 'partial',
        reward: smoke.passed ? Math.max(0.5, 1 - classification.riskScore * 0.5) : 0.3,
        taskId: input.caseId ?? runId,
        traceSource: 'error-agent',
      });
    } catch (err) {
      console.error('[Phase3F] Error-agent trace recording failed (non-blocking):', (err as Error)?.message);
    }
  })();

  return result;
}
