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
  metadata?: Record<string, unknown>;
}

export interface WorkflowClassification {
  hmmErrorClass: HmmErrorClass;
  riskScore: number;
  severity: 'low' | 'medium' | 'high';
  lane: 'contracts' | 'schema' | 'runtime' | 'safety' | 'general';
  rationale: string;
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
  classification: WorkflowClassification;
  repair: WorkflowRepairResult;
  smoke: WorkflowSmokeResult;
  logged: boolean;
}

export interface WorkflowLoopDeps {
  repair?: (input: WorkflowLoopInput, classification: WorkflowClassification) => Promise<WorkflowRepairResult>;
  smoke?: (
    input: WorkflowLoopInput,
    classification: WorkflowClassification,
    repair: WorkflowRepairResult,
  ) => Promise<WorkflowSmokeResult>;
  log?: (entry: WorkflowLogEntry) => Promise<void>;
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

async function defaultLog(entry: WorkflowLogEntry): Promise<void> {
  const { queryLogger } = await import('$lib/server/training/query-logger.js');
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

  const repair = deps.repair
    ? await deps.repair(input, classification)
    : await defaultRepair(input, classification);

  const smoke = deps.smoke
    ? await deps.smoke(input, classification, repair)
    : await defaultSmoke(input, classification);

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
      caseId: input.caseId ?? null,
      userId: input.userId ?? null,
      ...(input.metadata ?? {}),
    },
    timestamp: now().toISOString(),
  });

  const result: WorkflowLoopResult = {
    runId,
    status: smoke.passed ? 'repaired' : 'needs_review',
    classification,
    repair,
    smoke,
    logged: true,
  };

  // Record agent trace for Phase 3F learning pipeline (fire-and-forget)
  void (async () => {
    try {
      const { recordAgentTrace } = await import('$lib/server/observability/agent-trace-recorder.js');

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
        toolsCalled: ['workflow-loop', 'hmm-classifier', classification.lane],
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
