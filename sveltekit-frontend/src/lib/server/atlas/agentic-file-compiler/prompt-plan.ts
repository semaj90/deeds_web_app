import { sha256Stable } from './contracts.js';
/**
 * Legacy block-reference planning projection.
 *
 * The canonical `atlas.prompt-plan.v1` contract lives under `atlas/prefill`
 * and carries revisioned segments, token budgets, and evidence checksums.
 * This older projection cannot claim that wire identity because it contains
 * unresolved block references rather than executable prompt content.
 */
export const AGENTIC_FILE_COMPILER_BLOCK_PLAN_SCHEMA = 'atlas.agentic-file-compiler.block-plan.v1' as const;
export type PromptBlockKind = 'SYSTEM' | 'TASK' | 'SCHEMA' | 'EVIDENCE' | 'EXAMPLE' | 'CONSTRAINT';
export interface AgenticFileCompilerBlockPlanV1 {
	schema: typeof AGENTIC_FILE_COMPILER_BLOCK_PLAN_SCHEMA;
	promptPlanId: string;
	contextManifestId: string;
	systemInstructionRevision: string;
	toolSchemaRevision: string;
	blocks: Array<{ kind: PromptBlockKind; ref: string }>;
	estimatedTokens: number;
	checksum: string;
}

export function buildAgenticFileCompilerBlockPlan(
	input: Omit<AgenticFileCompilerBlockPlanV1, 'schema' | 'checksum'>,
): AgenticFileCompilerBlockPlanV1 {
  if (input.blocks.some((b) => !b.ref.trim())) throw new Error('prompt block ref must not be empty');
  const body = {
		schema: AGENTIC_FILE_COMPILER_BLOCK_PLAN_SCHEMA,
		...input,
		estimatedTokens: Math.max(0, input.estimatedTokens),
	};
  return { ...body, checksum: sha256Stable(body) };
}

/** @deprecated Use `buildAgenticFileCompilerBlockPlan`; this is not PromptPlanV1. */
export const buildPromptPlan = buildAgenticFileCompilerBlockPlan;

/** @deprecated Compatibility type alias for callers of the legacy projection. */
export type PromptPlanV1 = AgenticFileCompilerBlockPlanV1;
