import { existsSync, promises as fs, statSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { TaskPromotionGateSchema } from '../contracts/recommendation.js';

const RawPrioritySchema = z.string().min(1).optional();

const RawTaskSchema = z
  .object({
    id: z.string().min(1).optional(),
    taskId: z.string().min(1).optional(),
    priority: RawPrioritySchema,
    label: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    name: z.string().min(1).optional(),
    count: z.number().int().nonnegative().optional(),
    script: z.string().min(1).optional(),
    gate: z.string().min(1).optional(),
    blockedBy: z.array(z.string().min(1)).default([]),
    status: z.string().min(1).optional(),
    origin: z.string().min(1).optional(),
    recommendation_id: z.string().min(1).optional(),
    source_ref: z.string().nullable().optional(),
    sourceRef: z.string().nullable().optional(),
    tree_node_id: z.string().nullable().optional(),
    treeNodeId: z.string().nullable().optional(),
    evidence_refs: z.array(z.string().min(1)).default([]),
    reason_codes: z.array(z.string().min(1)).default([]),
  })
  .passthrough();

const RawBoardSchema = z
  .object({
    generated: z.string().datetime().optional(),
    generatedAt: z.string().datetime().optional(),
    collection: z.string().min(1).optional(),
    repoName: z.string().min(1).optional(),
    recommendation_promotion: z
      .object({
        proposal_count: z.number().int().nonnegative(),
        promoted_count: z.number().int().nonnegative(),
        review_required_count: z.number().int().nonnegative(),
      })
      .partial()
      .optional(),
    tasks: z.array(RawTaskSchema).optional(),
    columns: z
      .record(
        z.string(),
        z
          .object({
            label: z.string().min(1).optional(),
            tasks: z.array(RawTaskSchema).default([]),
          })
          .passthrough(),
      )
      .optional(),
  })
  .passthrough();

const RecommendationProposalSchema = z
  .object({
    recommendation_id: z.string().min(1),
    source_ref: z.string().nullable().optional(),
    tree_node_id: z.string().nullable().optional(),
    title: z.string().min(1).optional(),
    evidence_refs: z.array(z.string().min(1)).default([]),
    reason_codes: z.array(z.string().min(1)).default([]),
    task_promotion: TaskPromotionGateSchema,
    created_at: z.string().datetime(),
  })
  .strict();

const ProposalLedgerSchema = z
  .object({
    contract: z.string().min(1),
    recommendations: z.array(RecommendationProposalSchema),
  })
  .strict();

const AgenticWorkflowRecommendationSchema = z
  .object({
    task_id: z.string().min(1).optional(),
    trace_id: z.string().min(1).optional(),
    intent: z.string().min(1).optional(),
    query: z.string().min(1).optional(),
    feature_id: z.string().min(1).optional(),
    feature_label: z.string().min(1).optional(),
    title_id: z.string().min(1).optional(),
    source_ref: z.string().min(1).optional(),
    packet_key: z.string().min(1).optional(),
    recommended_commands: z.array(z.string().min(1)).default([]),
    verification_commands: z.array(z.string().min(1)).default([]),
    confidence: z.number().min(0).max(1).optional(),
    status: z.string().min(1).optional(),
    updated_at: z.string().datetime().optional(),
  })
  .passthrough();

const AgenticWorkflowReportSchema = z
  .object({
    generated_at: z.string().datetime(),
    top: z.array(AgenticWorkflowRecommendationSchema).default([]),
    limit: z.number().int().positive().optional(),
    offset: z.number().int().nonnegative().optional(),
    total: z.number().int().nonnegative().optional(),
  })
  .passthrough();

const ProofReportSchema = z
  .object({
    generatedAt: z.string().datetime().optional(),
    gate: z.string().min(1).optional(),
    results: z
      .array(
        z
          .object({
            gate: z.string().min(1),
            status: z.string().min(1),
            notes: z.array(z.string().min(1)).default([]),
          })
          .passthrough(),
      )
      .default([]),
  })
  .passthrough();

export interface DailyGraphifyTaskColumn {
  id: string;
  label: string;
  tasks: DailyGraphifyTask[];
}

export interface DailyGraphifyTask {
  id: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  label: string;
  count?: number;
  script?: string;
  gate?: string;
  blockedBy?: string[];
  status?: string;
  origin?: string;
  recommendation_id?: string;
  source_ref?: string | null;
  title_id?: string | null;
  tree_node_id?: string | null;
  packet_key?: string | null;
  evidence_refs?: string[];
  reason_codes?: string[];
  confidence?: number | null;
}

export interface DailyGraphifyTemporalRecommendation {
  rank: number;
  taskId: string;
  title: string;
  intent: string | null;
  sourceRef: string | null;
  featureId: string | null;
  treeNodeId: string | null;
  packetKey: string | null;
  confidence: number | null;
  updatedAt: string;
  recommendedCommands: string[];
  verificationCommands: string[];
  status: string | null;
}

export interface DailyGraphifyWorkflowDagNode {
  stage: string;
  state: string;
  status: string;
  dependsOn: string[];
  evidenceRefs: string[];
  outputRef: string | null;
  updated_at: string;
  notes: string | null;
}

export interface DailyGraphifyBoardData {
  generated: string;
  collection: string;
  boardSource: string;
  recommendationSource: string;
  workflowState: string | null;
  recommendationPromotion: {
    proposalCount: number;
    promotedCount: number;
    reviewRequiredCount: number;
  };
  columns: DailyGraphifyTaskColumn[];
  promotedRecommendations: z.infer<typeof RecommendationProposalSchema>[];
  reviewRequiredRecommendations: z.infer<typeof RecommendationProposalSchema>[];
  temporalRecommendations: DailyGraphifyTemporalRecommendation[];
  workflowDag: DailyGraphifyWorkflowDagNode[];
  warnings: string[];
}

function repoRoots(): string[] {
  return [...new Set([process.cwd(), path.resolve(process.cwd(), '..')])];
}

function resolveCandidates(relativePaths: string[]): string[] {
  return repoRoots().flatMap((root) => relativePaths.map((relPath) => path.join(root, relPath)));
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function readFirstJson(relativePaths: string[]): Promise<{ source: string | null; value: unknown | null }> {
  for (const candidate of resolveCandidates(relativePaths)) {
    if (!existsSync(candidate)) continue;
    const value = await readJsonIfExists(candidate);
    if (value) return { source: candidate, value };
  }
  return { source: null, value: null };
}

function hasBoardTasks(value: unknown): boolean {
  const parsed = parseBoardPayload(value);
  if (!parsed) return false;
  const tasks = flattenBoardTasks(parsed, parsed.generated ?? parsed.generatedAt ?? 'graphify-board');
  return tasks.length > 0;
}

async function readNewestPopulatedBoard(relativePaths: string[]): Promise<{ source: string | null; value: unknown | null }> {
  const candidates = resolveCandidates(relativePaths)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .map((candidate, index) => {
      if (!existsSync(candidate)) return null;
      try {
        return { candidate, index, mtimeMs: statSync(candidate).mtimeMs };
      } catch {
        return null;
      }
    })
    .filter((entry): entry is { candidate: string; index: number; mtimeMs: number } => entry !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs || a.index - b.index);

  for (const { candidate } of candidates) {
    const value = await readJsonIfExists(candidate);
    if (value && hasBoardTasks(value)) return { source: candidate, value };
  }
  return { source: null, value: null };
}

function normalizePriority(priority: unknown): 'P0' | 'P1' | 'P2' | 'P3' {
  const raw = String(priority ?? '').trim().toUpperCase();
  if (raw === 'P0' || raw === 'P1' || raw === 'P2' || raw === 'P3') return raw;
  if (raw === 'CRITICAL' || raw === 'HIGH') return 'P0';
  if (raw === 'MEDIUM') return 'P1';
  if (raw === 'LOW') return 'P2';
  return 'P3';
}

function taskLabel(task: z.infer<typeof RawTaskSchema>): string {
  return (
    task.label ??
    task.title ??
    task.name ??
    task.id ??
    task.taskId ??
    'untitled task'
  );
}

function normalizeTask(task: z.infer<typeof RawTaskSchema>, fallbackId: string, origin: string): DailyGraphifyTask {
  return {
    id: String(task.id ?? task.taskId ?? fallbackId),
    priority: normalizePriority(task.priority),
    label: taskLabel(task),
    count: task.count,
    script: task.script,
    gate: task.gate,
    blockedBy: task.blockedBy ?? [],
    status: task.status,
    origin: task.origin ?? origin,
    recommendation_id: task.recommendation_id,
    source_ref: typeof task.source_ref === 'string' ? task.source_ref : typeof task.sourceRef === 'string' ? task.sourceRef : null,
    title_id: typeof task.title_id === 'string' ? task.title_id : typeof task.titleId === 'string' ? task.titleId : null,
    tree_node_id: typeof task.tree_node_id === 'string' ? task.tree_node_id : typeof task.treeNodeId === 'string' ? task.treeNodeId : null,
    packet_key: typeof task.packet_key === 'string' ? task.packet_key : typeof task.packetKey === 'string' ? task.packetKey : null,
    evidence_refs: task.evidence_refs ?? [],
    reason_codes: task.reason_codes ?? [],
    confidence: typeof task.confidence === 'number' ? task.confidence : null,
  };
}

export function flattenBoardTasks(board: z.infer<typeof RawBoardSchema>, origin: string): DailyGraphifyTask[] {
  if (Array.isArray(board.tasks) && board.tasks.length > 0) {
    return board.tasks.map((task, index) => normalizeTask(task, `task-${index + 1}`, origin));
  }

  const columns = board.columns ?? {};
  const tasks: DailyGraphifyTask[] = [];
  for (const [columnId, column] of Object.entries(columns)) {
    const normalizedColumn = column as { tasks?: z.infer<typeof RawTaskSchema>[] } | undefined;
    for (const [index, task] of (normalizedColumn?.tasks ?? []).entries()) {
      tasks.push(normalizeTask(task, `${columnId}-${index + 1}`, origin));
    }
  }
  return tasks;
}

function toColumn(id: string, label: string, tasks: DailyGraphifyTask[]): DailyGraphifyTaskColumn {
  return { id, label, tasks };
}

function normalizeRecommendationTimeline(
  workflowReport: z.infer<typeof AgenticWorkflowReportSchema> | null,
): DailyGraphifyTemporalRecommendation[] {
  const top = workflowReport?.top ?? [];
  return top.map((item, index) => ({
    rank: index + 1,
    taskId: item.task_id ?? item.feature_id ?? item.trace_id ?? `workflow-${index + 1}`,
    title: item.feature_label ?? item.title_id ?? item.query ?? item.task_id ?? `workflow-${index + 1}`,
    intent: item.intent ?? null,
    sourceRef: item.source_ref ?? null,
    featureId: item.feature_id ?? null,
    treeNodeId: item.title_id ?? null,
    packetKey: item.packet_key ?? null,
    confidence: item.confidence ?? null,
    updatedAt: item.updated_at ?? workflowReport?.generated_at ?? new Date().toISOString(),
    recommendedCommands: item.recommended_commands ?? [],
    verificationCommands: item.verification_commands ?? [],
    status: item.status ?? null,
  }));
}

function parseBoardPayload(value: unknown): z.infer<typeof RawBoardSchema> | null {
  const parsed = RawBoardSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseProposalLedger(value: unknown): z.infer<typeof ProposalLedgerSchema> | null {
  const parsed = ProposalLedgerSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseWorkflowReport(value: unknown): z.infer<typeof AgenticWorkflowReportSchema> | null {
  const parsed = AgenticWorkflowReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function parseProofReport(value: unknown): z.infer<typeof ProofReportSchema> | null {
  const parsed = ProofReportSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function summarizeDailyGraphifyBoard(
  board: unknown,
  proposalLedger: unknown,
  workflowReport: unknown = null,
  proofReport: unknown = null,
  sources: {
    boardSource?: string | null;
    recommendationSource?: string | null;
    temporalSource?: string | null;
    proofReportSource?: string | null;
  } = {},
): DailyGraphifyBoardData {
  const warnings: string[] = [];

  const parsedBoard = parseBoardPayload(board);
  if (!parsedBoard) warnings.push('BOARD_LEDGER_UNAVAILABLE');

  const parsedLedger = parseProposalLedger(proposalLedger);
  if (!parsedLedger) warnings.push('PROPOSAL_LEDGER_UNAVAILABLE');

  const parsedWorkflow = parseWorkflowReport(workflowReport);
  if (!parsedWorkflow) warnings.push('TEMPORAL_WORKFLOW_UNAVAILABLE');
  const parsedProof = parseProofReport(proofReport);
  if (parsedProof?.results?.length) {
    const nonPassing = parsedProof.results
      .filter((result) => !['PASS', 'PROVEN'].includes(result.status))
      .map((result) => `${result.gate}=${result.status}`);
    if (nonPassing.length > 0) {
      warnings.push(`GRAPHIFY_RECOVERY:${nonPassing.join(',')}`);
    }
  }

  const boardTasks = parsedBoard ? flattenBoardTasks(parsedBoard, parsedBoard.generated ?? parsedBoard.generatedAt ?? 'graphify-board') : [];
  const columns = ['P0', 'P1', 'P2', 'P3'].map((priority) =>
    toColumn(
      priority,
      `Priority ${priority.slice(1)}`,
      boardTasks.filter((task) => task.priority === priority),
    ),
  );

  const recommendations = parsedLedger?.recommendations ?? [];
  const promotedRecommendations = recommendations.filter((proposal) => proposal.task_promotion.gate_decision === 'PROMOTE');
  const reviewRequiredRecommendations = recommendations.filter((proposal) => proposal.task_promotion.gate_decision === 'REVIEW_REQUIRED');
  const temporalRecommendations = normalizeRecommendationTimeline(parsedWorkflow);
  const workflowDag = Array.isArray((parsedWorkflow as Record<string, unknown> | null)?.dag)
    ? ((parsedWorkflow as Record<string, unknown>).dag as Array<Record<string, unknown>>).map((node) => ({
        stage: String(node.stage ?? node.name ?? 'unknown'),
        state: String(node.state ?? parsedWorkflow?.generated_at ?? 'UNKNOWN'),
        status: String(node.status ?? 'unknown'),
        dependsOn: Array.isArray(node.dependsOn) ? node.dependsOn.map((dep) => String(dep)) : [],
        evidenceRefs: Array.isArray(node.evidenceRefs) ? node.evidenceRefs.map((ref) => String(ref)).filter(Boolean) : [],
        outputRef: node.outputRef ? String(node.outputRef) : null,
        updated_at: String(node.updated_at ?? parsedWorkflow?.generated_at ?? new Date().toISOString()),
        notes: node.notes ? String(node.notes) : null,
      }))
    : [];

  return {
    generated: parsedBoard?.generated ?? parsedBoard?.generatedAt ?? parsedWorkflow?.generated_at ?? new Date().toISOString(),
    collection: parsedBoard?.collection ?? parsedBoard?.repoName ?? 'unknown',
    boardSource: parsedBoard ? (sources.boardSource ?? 'docs/graph/kanban-board.json-or-reports/atlas') : 'missing',
    recommendationSource: parsedLedger
      ? (sources.recommendationSource ?? 'atlas-recommendation-proposals')
      : parsedWorkflow
        ? (sources.temporalSource ?? 'agentic-recommendation-workflow')
        : 'missing',
    workflowState: parsedWorkflow ? String((parsedWorkflow as Record<string, unknown>).workflow_state ?? 'COMPLETE') : null,
    recommendationPromotion: parsedBoard?.recommendation_promotion
      ? {
          proposalCount: parsedBoard.recommendation_promotion.proposal_count ?? recommendations.length,
          promotedCount: parsedBoard.recommendation_promotion.promoted_count ?? promotedRecommendations.length,
          reviewRequiredCount: parsedBoard.recommendation_promotion.review_required_count ?? reviewRequiredRecommendations.length,
        }
      : {
          proposalCount: recommendations.length || temporalRecommendations.length,
          promotedCount: promotedRecommendations.length,
          reviewRequiredCount: reviewRequiredRecommendations.length,
        },
    columns,
    promotedRecommendations,
    reviewRequiredRecommendations,
    temporalRecommendations,
    workflowDag,
    warnings,
  };
}

export async function loadDailyGraphifyBoard(): Promise<DailyGraphifyBoardData> {
  const boardResult = await readNewestPopulatedBoard([
    path.join('docs', 'reports', 'atlas', 'atlas-kanban-tasks.json'),
    path.join('docs', 'reports', 'atlas-kanban-tasks.json'),
    path.join('docs', 'graph', 'kanban-board.json'),
  ]);

  const proposalResult = await readFirstJson([
    path.join('docs', 'reports', 'atlas', 'atlas-recommendation-proposals.json'),
    path.join('docs', 'reports', 'atlas-recommendation-proposals.json'),
  ]);

  const workflowResult = await readFirstJson([
    path.join('docs', 'reports', 'semantic-search-workflow.json'),
    path.join('docs', 'reports', 'atlas', 'semantic-search-workflow.json'),
    path.join('docs', 'reports', 'agentic-recommendation-workflow.json'),
    path.join('docs', 'reports', 'atlas', 'agentic-recommendation-workflow.json'),
  ]);

  const proofResult = await readFirstJson([
    path.join('.tmp', 'reports', 'parent-atlas-integration-proof.json'),
    path.join('docs', 'reports', 'parent-atlas-integration-proof.json'),
  ]);

  return summarizeDailyGraphifyBoard(boardResult.value, proposalResult.value, workflowResult.value, proofResult.value, {
    boardSource: boardResult.source,
    recommendationSource: proposalResult.source,
    temporalSource: workflowResult.source,
    proofReportSource: proofResult.source,
  });
}
