import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { TaskPromotionGateSchema } from '$lib/server/atlas/contracts/recommendation.js';

const PrioritySchema = z.enum(['P0', 'P1', 'P2', 'P3']);

const BoardTaskSchema = z
  .object({
    id: z.string().min(1),
    priority: PrioritySchema,
    label: z.string().min(1),
    count: z.number().int().nonnegative().optional(),
    script: z.string().min(1).optional(),
    gate: z.string().min(1).optional(),
    blockedBy: z.array(z.string().min(1)).default([]),
    status: z.string().min(1).optional(),
    origin: z.string().min(1).optional(),
    recommendation_id: z.string().min(1).optional(),
    source_ref: z.string().nullable().optional(),
    tree_node_id: z.string().nullable().optional(),
    evidence_refs: z.array(z.string().min(1)).default([]),
    reason_codes: z.array(z.string().min(1)).default([]),
  })
  .strict();

const BoardSnapshotSchema = z
  .object({
    generated: z.string().datetime(),
    collection: z.string().min(1),
    recommendation_promotion: z
      .object({
        proposal_count: z.number().int().nonnegative(),
        promoted_count: z.number().int().nonnegative(),
        review_required_count: z.number().int().nonnegative(),
      })
      .strict(),
    tasks: z.array(BoardTaskSchema),
  })
  .strict();

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

export interface DailyGraphifyTaskColumn {
  id: string;
  label: string;
  tasks: z.infer<typeof BoardTaskSchema>[];
}

export interface DailyGraphifyBoardData {
  generated: string;
  collection: string;
  recommendationPromotion: {
    proposalCount: number;
    promotedCount: number;
    reviewRequiredCount: number;
  };
  columns: DailyGraphifyTaskColumn[];
  promotedRecommendations: z.infer<typeof RecommendationProposalSchema>[];
  reviewRequiredRecommendations: z.infer<typeof RecommendationProposalSchema>[];
  warnings: string[];
}

function resolveReportsDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'docs', 'reports'),
    path.resolve(process.cwd(), '..', 'docs', 'reports'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return candidates.at(-1) ?? path.resolve(process.cwd(), 'docs', 'reports');
}

async function readJsonIfExists(filePath: string): Promise<unknown | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function toColumn(id: string, label: string, tasks: z.infer<typeof BoardTaskSchema>[]): DailyGraphifyTaskColumn {
  return { id, label, tasks };
}

export function summarizeDailyGraphifyBoard(
  board: z.input<typeof BoardSnapshotSchema> | null,
  proposalLedger: z.input<typeof ProposalLedgerSchema> | null,
): DailyGraphifyBoardData {
  const warnings: string[] = [];

  const parsedBoard = board ? BoardSnapshotSchema.safeParse(board) : { success: false as const, error: null };
  if (!parsedBoard.success) warnings.push('BOARD_LEDGER_UNAVAILABLE');

  const parsedLedger = proposalLedger ? ProposalLedgerSchema.safeParse(proposalLedger) : { success: false as const, error: null };
  if (!parsedLedger.success) warnings.push('PROPOSAL_LEDGER_UNAVAILABLE');

  const boardData = parsedBoard.success ? parsedBoard.data : null;
  const proposalData = parsedLedger.success ? parsedLedger.data : null;

  const recommendations = proposalData?.recommendations ?? [];
  const promotedRecommendations = recommendations.filter((proposal) => proposal.task_promotion.gate_decision === 'PROMOTE');
  const reviewRequiredRecommendations = recommendations.filter((proposal) => proposal.task_promotion.gate_decision === 'REVIEW_REQUIRED');

  const tasks = boardData?.tasks ?? [];
  const columns = ['P0', 'P1', 'P2', 'P3'].map((priority) =>
    toColumn(
      priority,
      `Priority ${priority.slice(1)}`,
      tasks.filter((task) => task.priority === priority),
    ),
  );

  return {
    generated: boardData?.generated ?? new Date().toISOString(),
    collection: boardData?.collection ?? 'unknown',
    recommendationPromotion: boardData
      ? {
          proposalCount: boardData.recommendation_promotion.proposal_count,
          promotedCount: boardData.recommendation_promotion.promoted_count,
          reviewRequiredCount: boardData.recommendation_promotion.review_required_count,
        }
      : {
          proposalCount: recommendations.length,
          promotedCount: promotedRecommendations.length,
          reviewRequiredCount: reviewRequiredRecommendations.length,
        },
    columns,
    promotedRecommendations,
    reviewRequiredRecommendations,
    warnings,
  };
}

export async function loadDailyGraphifyBoard(): Promise<DailyGraphifyBoardData> {
  const reportsDir = resolveReportsDir();
  const [board, proposalLedger] = await Promise.all([
    readJsonIfExists(path.join(reportsDir, 'atlas-kanban-tasks.json')),
    readJsonIfExists(path.join(reportsDir, 'atlas-recommendation-proposals.json')),
  ]);

  return summarizeDailyGraphifyBoard(board as z.input<typeof BoardSnapshotSchema> | null, proposalLedger as z.input<typeof ProposalLedgerSchema> | null);
}
