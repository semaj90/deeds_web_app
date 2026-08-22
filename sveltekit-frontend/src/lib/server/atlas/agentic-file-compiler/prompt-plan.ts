import { sha256Stable } from './contracts.js';
export type PromptBlockKind = 'SYSTEM' | 'TASK' | 'SCHEMA' | 'EVIDENCE' | 'EXAMPLE' | 'CONSTRAINT';
export interface PromptPlanV1 { schema: 'atlas.prompt-plan.v1'; promptPlanId: string; contextManifestId: string; systemInstructionRevision: string; toolSchemaRevision: string; blocks: Array<{ kind: PromptBlockKind; ref: string }>; estimatedTokens: number; checksum: string; }
export function buildPromptPlan(input: Omit<PromptPlanV1, 'schema' | 'checksum'>): PromptPlanV1 {
  if (input.blocks.some((b) => !b.ref.trim())) throw new Error('prompt block ref must not be empty');
  const body = { schema: 'atlas.prompt-plan.v1' as const, ...input, estimatedTokens: Math.max(0, input.estimatedTokens) };
  return { ...body, checksum: sha256Stable(body) };
}
