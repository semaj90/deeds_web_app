import { createHash } from 'node:crypto';
import { appendFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { z } from 'zod';
import type { RevisionTuple, PolicyAction, ModelTarget, BudgetTier, PolicyStateTensor } from './policy-types.js';
import type { HmmState } from './policy-types.js';
import type { RouteTrace } from '$lib/server/router/router-types.js';
import type { PolicyDecision } from './policy-types.js';
import type { CanonicalRerankProvenance } from '$lib/server/retrieval/canonical-rerank-executor.js';

export const POLICY_TRAINING_ROW_REVISION = 'parent-atlas.policy-training-row.v1' as const;
export const POLICY_TRAINING_DATASET_DIR = 'memory/datasets/policy_training' as const;
const ROUTER_STATES = ['START', 'RETRIEVE', 'STRUCTURE', 'LEGAL_ANALYZE', 'OPERATE', 'VALIDATE', 'RECOVER', 'CLARIFY', 'SYNTHESIZE', 'ESCALATE', 'DONE'] as const;

export type RouteTraceLabelSource = 'EXECUTION' | 'REPLAY' | 'AUDIT';

export interface RouteTraceLabelProvenance {
  source: RouteTraceLabelSource;
  sourceRevision: string;
  sourceRefs: readonly string[];
}

export interface SearchRuntimeTrainingInput {
  traceId: string;
  query: string;
  queryHash: string;
  policyState: PolicyStateTensor;
  policyDecision: PolicyDecision;
  rerankProvenance: CanonicalRerankProvenance;
  revisions: RevisionTuple;
  labelProvenance: RouteTraceLabelProvenance;
  candidatePacketKeys: readonly string[];
  sourceRefs: readonly string[];
  executionId?: string;
  labelConfidence?: number;
}

export interface RouteTraceTrainingInput {
  trace: RouteTrace;
  policyState: PolicyStateTensor;
  decision: PolicyDecision;
  revisions: RevisionTuple;
  labelProvenance: RouteTraceLabelProvenance;
  labelConfidence?: number;
}

export interface RouteTraceTrainingRow {
  revision: typeof POLICY_TRAINING_ROW_REVISION;
  trainingDigest: string;
  traceId: string;
  queryHash: string;
  query: string;
  revisions: RevisionTuple;
  selectedState: RouteTrace['selectedState'];
  selectedToolName: string;
  candidateTools: readonly string[];
  proposalId: string;
  executed: boolean;
  executionId: string | null;
  resultClass: RouteTrace['resultClass'] | null;
  resultCount: number | null;
  sourceRefCount: number | null;
  sourceRefs: readonly string[];
  finalState: RouteTrace['finalState'];
  finalOutcome: RouteTrace['finalOutcome'];
  policyAction: PolicyAction;
  policyModel: ModelTarget;
  policyBudget: BudgetTier;
  policyDecisionRevision: PolicyDecision['revision'];
  policyStateRevision: PolicyStateTensor['revision'];
  policyFeatureRevision: PolicyStateTensor['featureRevision'];
  stateHint: PolicyStateTensor['stateHint'];
  featureCount: number;
  features: readonly string[];
  values: number[];
  labelSource: RouteTraceLabelSource;
  labelSourceRevision: string;
  labelSourceRefs: readonly string[];
  labelConfidence: number;
  createdAt: string;
}

export const RouteTraceLabelProvenanceSchema = z.object({
  source: z.enum(['EXECUTION', 'REPLAY', 'AUDIT']),
  sourceRevision: z.string().trim().min(1),
  sourceRefs: z.array(z.string().trim().min(1)).min(1),
}).strict();

export const RouteTraceTrainingRowSchema = z.object({
  revision: z.literal(POLICY_TRAINING_ROW_REVISION),
  trainingDigest: z.string().trim().min(1),
  traceId: z.string().trim().min(1),
  queryHash: z.string().trim().min(1),
  query: z.string(),
  revisions: z.object({
    workspaceRevision: z.string().trim().min(1),
    sourceRevision: z.string().trim().min(1),
    representationRevision: z.string().trim().min(1),
    graphRevision: z.string().trim().optional(),
    featureRevision: z.string().trim().optional(),
  }).strict(),
  selectedState: z.enum(ROUTER_STATES),
  selectedToolName: z.string().trim().min(1),
  candidateTools: z.array(z.string().trim().min(1)),
  proposalId: z.string().trim().min(1),
  executed: z.boolean(),
  executionId: z.string().trim().nullable(),
  resultClass: z.enum(['answer', 'candidates', 'partial', 'empty', 'validation_error', 'transport_error', 'tool_error', 'timeout']).nullable(),
  resultCount: z.number().int().nonnegative().nullable(),
  sourceRefCount: z.number().int().nonnegative().nullable(),
  sourceRefs: z.array(z.string().trim().min(1)),
  finalState: z.enum(ROUTER_STATES),
  finalOutcome: z.enum(['success', 'partial', 'failed', 'escalated']),
  policyAction: z.enum(['LEXICAL_SEARCH', 'SEMANTIC_SEARCH', 'GRAPH_TRACE', 'GRAPH_EXPAND', 'FAST_RERANK', 'DEEP_RERANK', 'INSPECT_SOURCE', 'PATCH', 'COMPILE', 'TEST', 'RECOVER', 'TERMINATE']),
  policyModel: z.enum(['NO_LLM', 'ORNITH', 'GEMMA4']),
  policyBudget: z.enum(['SMALL', 'MEDIUM', 'DEEP']),
  policyDecisionRevision: z.literal('parent-atlas.policy-decision.v1'),
  policyStateRevision: z.literal('parent-atlas.policy-state.v1'),
  policyFeatureRevision: z.literal('parent-atlas.policy-features.v1'),
  stateHint: z.enum(['LOCATE', 'UNDERSTAND', 'TRACE', 'REPAIR', 'VALIDATE', 'RECOVER']),
  featureCount: z.number().int().positive(),
  features: z.array(z.string().trim().min(1)),
  values: z.array(z.number().finite()),
  labelSource: z.enum(['EXECUTION', 'REPLAY', 'AUDIT']),
  labelSourceRevision: z.string().trim().min(1),
  labelSourceRefs: z.array(z.string().trim().min(1)),
  labelConfidence: z.number().min(0).max(1),
  createdAt: z.string().datetime({ offset: true }),
}).strict().superRefine((value, ctx) => {
  if (value.labelSourceRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['labelSourceRefs'], message: 'Labels must be provenance-backed.' });
  }
  if (value.sourceRefs.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['sourceRefs'], message: 'Route trace must include evidence source refs.' });
  }
  if (!value.executed) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executed'], message: 'Route trace must be executed before export.' });
  }
  if (!value.executionId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['executionId'], message: 'Executed route trace must include executionId.' });
  }
  if (value.features.length !== value.featureCount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['featureCount'],
      message: `featureCount ${value.featureCount} must match features length ${value.features.length}.`,
    });
  }
  if (value.values.length !== value.features.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['values'],
      message: `values length ${value.values.length} must match features length ${value.features.length}.`,
    });
  }
});

function canonicalDigest(input: Omit<RouteTraceTrainingRow, 'trainingDigest' | 'createdAt'>): string {
  return createHash('sha256')
    .update(JSON.stringify(input))
    .digest('hex');
}

function mapHmmToRouterState(state: HmmState): RouteTrace['selectedState'] {
  switch (state) {
    case 'LOCATE':
      return 'RETRIEVE';
    case 'UNDERSTAND':
      return 'STRUCTURE';
    case 'TRACE':
      return 'STRUCTURE';
    case 'REPAIR':
      return 'OPERATE';
    case 'VALIDATE':
      return 'VALIDATE';
    case 'RECOVER':
      return 'RECOVER';
    default:
      return 'RETRIEVE';
  }
}

export function buildRouteTraceTrainingRow(input: RouteTraceTrainingInput): RouteTraceTrainingRow {
  const provenance = RouteTraceLabelProvenanceSchema.parse(input.labelProvenance);

  if (!input.trace.executed || !input.trace.executionId) {
    throw new Error('RouteTrace labels are not provenance-backed until execution is recorded.');
  }
  if (!input.trace.sourceRefs?.length || !input.trace.sourceRefCount || input.trace.sourceRefCount === 0) {
    throw new Error('RouteTrace labels are not provenance-backed until source refs are present.');
  }

  const row: Omit<RouteTraceTrainingRow, 'trainingDigest' | 'createdAt'> = {
    revision: POLICY_TRAINING_ROW_REVISION,
    traceId: input.trace.traceId,
    queryHash: input.trace.queryHash,
    query: input.trace.query,
    revisions: input.revisions,
    selectedState: input.trace.selectedState,
    selectedToolName: input.trace.selectedToolName,
    candidateTools: [...input.trace.candidateTools],
    proposalId: input.trace.proposalId,
    executed: input.trace.executed,
    executionId: input.trace.executionId ?? null,
    resultClass: input.trace.resultClass ?? null,
    resultCount: input.trace.resultCount ?? null,
    sourceRefCount: input.trace.sourceRefCount ?? null,
    sourceRefs: [...(input.trace.sourceRefs ?? [])],
    finalState: input.trace.finalState,
    finalOutcome: input.trace.finalOutcome,
    policyAction: input.decision.action,
    policyModel: input.decision.model,
    policyBudget: input.decision.budget,
    policyDecisionRevision: input.decision.revision,
    policyStateRevision: input.policyState.revision,
    policyFeatureRevision: input.policyState.featureRevision,
    stateHint: input.policyState.stateHint,
    featureCount: input.policyState.featureCount,
    features: [...input.policyState.features],
    values: Array.from(input.policyState.values),
    labelSource: provenance.source,
    labelSourceRevision: provenance.sourceRevision,
    labelSourceRefs: [...provenance.sourceRefs],
    labelConfidence: input.labelConfidence ?? 1,
  };

  const trainingDigest = canonicalDigest(row);
  return {
    ...row,
    trainingDigest,
    createdAt: new Date().toISOString(),
  };
}

export function buildSearchRuntimeTrainingRow(input: SearchRuntimeTrainingInput): RouteTraceTrainingRow {
  const trace: RouteTrace = {
    traceId: input.traceId,
    queryHash: input.queryHash,
    query: input.query,
    decisionId: `decision:${input.traceId}`,
    selectedState: mapHmmToRouterState(input.policyState.stateHint),
    selectedToolName: input.policyDecision.action,
    candidateTools: [
      input.policyDecision.action,
      input.policyDecision.model,
      input.policyDecision.budget,
    ],
    proposalId: `proposal:${input.traceId}`,
    proposedArguments: {},
    schemaValid: true,
    approvalRequired: input.policyDecision.action !== 'TERMINATE',
    executed: true,
    executionId: input.executionId ?? input.rerankProvenance.cacheKey ?? input.traceId,
    resultClass: input.candidatePacketKeys.length > 0 ? 'answer' : 'empty',
    resultCount: input.candidatePacketKeys.length,
    sourceRefCount: input.sourceRefs.length,
    sourceRefs: [...input.sourceRefs],
    durationMs: Math.max(1, Math.round(input.rerankProvenance.latencyMs ?? 1)),
    recoveryAttempted: Boolean(input.rerankProvenance.fallbackUsed),
    finalState: mapHmmToRouterState(input.policyState.stateHint),
    finalOutcome: input.candidatePacketKeys.length > 0 ? 'success' : 'partial',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return buildRouteTraceTrainingRow({
    trace,
    policyState: input.policyState,
    decision: input.policyDecision,
    revisions: input.revisions,
    labelProvenance: input.labelProvenance,
    labelConfidence: input.labelConfidence ?? (input.candidatePacketKeys.length > 0 ? 1 : 0.5),
  });
}

export interface WriteRouteTraceTrainingRowOptions {
  datasetDir?: string;
  filePath?: string;
  now?: Date;
}

export interface LoadRouteTraceTrainingRowsOptions {
  datasetDir?: string;
  filePath?: string;
}

function rootDirFromCwd(): string {
  return process.cwd().endsWith('sveltekit-frontend')
    ? resolve(process.cwd(), '..')
    : process.cwd();
}

export function resolveRouteTraceTrainingFilePath(now = new Date(), datasetDir?: string): string {
  const rootDir = rootDirFromCwd();
  const dir = datasetDir ?? join(rootDir, POLICY_TRAINING_DATASET_DIR);
  return join(dir, `${now.toISOString().slice(0, 10)}.jsonl`);
}

export async function appendRouteTraceTrainingRow(
  input: RouteTraceTrainingInput,
  options: WriteRouteTraceTrainingRowOptions = {},
): Promise<RouteTraceTrainingRow> {
  const row = buildRouteTraceTrainingRow(input);
  const filePath = options.filePath ?? resolveRouteTraceTrainingFilePath(options.now ?? new Date(), options.datasetDir);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function appendSearchRuntimeTrainingRow(
  input: SearchRuntimeTrainingInput,
  options: WriteRouteTraceTrainingRowOptions = {},
): Promise<RouteTraceTrainingRow> {
  const row = buildSearchRuntimeTrainingRow(input);
  const filePath = options.filePath ?? resolveRouteTraceTrainingFilePath(options.now ?? new Date(), options.datasetDir);
  await mkdir(dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

export async function loadRouteTraceTrainingRows(
  options: LoadRouteTraceTrainingRowsOptions = {},
): Promise<RouteTraceTrainingRow[]> {
  const datasetDir = options.datasetDir ?? join(rootDirFromCwd(), POLICY_TRAINING_DATASET_DIR);
  const files = options.filePath
    ? [options.filePath]
    : (await readdir(datasetDir).catch(() => []))
        .filter((name) => name.endsWith('.jsonl'))
        .map((name) => join(datasetDir, name))
        .sort((a, b) => a.localeCompare(b));

  const rows: RouteTraceTrainingRow[] = [];
  for (const filePath of files) {
    const raw = await readFile(filePath, 'utf8').catch(() => '');
    if (!raw.trim()) continue;
    for (const line of raw.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = RouteTraceTrainingRowSchema.parse(JSON.parse(line));
        rows.push({
          ...parsed,
          executionId: parsed.executionId ?? null,
          resultClass: parsed.resultClass ?? null,
          resultCount: parsed.resultCount ?? null,
          sourceRefCount: parsed.sourceRefCount ?? null,
          sourceRefs: parsed.sourceRefs ?? [],
        });
      } catch {
        // Skip malformed rows; replay loaders must be resilient to partial writes.
      }
    }
  }

  return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.traceId.localeCompare(b.traceId));
}
