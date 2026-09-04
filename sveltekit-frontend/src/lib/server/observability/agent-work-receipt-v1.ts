import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1).nullable();
const checksum = z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable();

export const AgentWorkReceiptV1Schema = z.object({
  schema: z.literal('atlas.agent-work-receipt.v1'),
  receiptId: z.string().min(1),
  runId: z.string().min(1),
  taskId: z.string().min(1).nullable(),
  openspecChange: z.string().min(1).nullable(),
  openspecTaskIds: z.array(z.string().min(1)),
  agentId: z.string().min(1).nullable(),
  modelId: z.string().min(1).nullable(),
  modelRevision: revision,
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  elapsedMs: z.number().int().nonnegative().nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  cachedTokens: z.number().int().nonnegative().nullable(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  workspaceRevision: revision,
  sourceRevision: revision,
  graphRevision: revision,
  representationRevision: revision,
  toolRefs: z.array(z.string().min(1)),
  registryRevision: revision,
  inputChecksum: checksum,
  outputChecksum: checksum,
  filesObserved: z.array(z.string().min(1)),
  filesEdited: z.array(z.string().min(1)),
  commandsExecuted: z.array(z.string().min(1)),
  validationReceipts: z.array(z.string().min(1)),
  status: z.enum(['RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED']),
  writesPerformed: z.boolean(),
  completionChecksum: checksum,
}).strict();

export type AgentWorkReceiptV1 = z.infer<typeof AgentWorkReceiptV1Schema>;

export function agentWorkReceiptChecksumV1(receipt: AgentWorkReceiptV1): string {
  const parsed = AgentWorkReceiptV1Schema.parse(receipt);
  // Runtime timing/accounting are observations, not receipt identity. This
  // keeps an identical replay idempotent while retaining work evidence.
  const {
    completionChecksum: _completionChecksum,
    startedAt: _startedAt,
    completedAt: _completedAt,
    elapsedMs: _elapsedMs,
    inputTokens: _inputTokens,
    outputTokens: _outputTokens,
    cachedTokens: _cachedTokens,
    estimatedCostUsd: _estimatedCostUsd,
    ...content
  } = parsed;
  return `sha256:${createHash('sha256').update(JSON.stringify(content), 'utf8').digest('hex')}`;
}

/**
 * Validates a receipt and verifies its optional completion checksum. This is
 * deliberately pure: it does not append, sync, or acknowledge the receipt.
 */
export function validateAgentWorkReceiptV1(receipt: AgentWorkReceiptV1): AgentWorkReceiptV1 {
  const parsed = AgentWorkReceiptV1Schema.parse(receipt);
  if (parsed.completionChecksum !== null && parsed.completionChecksum !== agentWorkReceiptChecksumV1(parsed)) {
    throw new Error('AGENT_WORK_RECEIPT_COMPLETION_CHECKSUM_MISMATCH');
  }
  return parsed;
}
