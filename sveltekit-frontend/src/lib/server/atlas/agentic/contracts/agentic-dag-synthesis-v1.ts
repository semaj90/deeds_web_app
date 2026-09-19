import { z } from 'zod';
import {
  buildAtlasWorkflowSpec,
} from '../../agentic-file-compiler/workflow-spec-builder.js';
import type { AtlasWorkflowSpecV1 } from '../../agentic-file-compiler/contracts.js';

export const AgenticDagSynthesisReceiptV1Schema = z.object({
  schema: z.literal('atlas.agentic-dag-synthesis-receipt.v1'),
  workflowId: z.string().min(1),
  workflowRevision: z.number().int().positive(),
  workflowChecksum: z.string().min(1),
  nodeCount: z.number().int().positive(),
  status: z.enum(['READY_FOR_PROOF', 'BLOCKED_BY_CONTRACT']),
  workflow: z.unknown(),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type AgenticDagSynthesisReceiptV1 = z.infer<typeof AgenticDagSynthesisReceiptV1Schema>;

/** Wraps the existing workflow compiler; it does not create a second DAG owner. */
export function synthesizeAgenticDagV1(
  input: Omit<AtlasWorkflowSpecV1, 'schema' | 'checksum'>,
): AgenticDagSynthesisReceiptV1 {
  const workflow = buildAtlasWorkflowSpec(input);
  return AgenticDagSynthesisReceiptV1Schema.parse({
    schema: 'atlas.agentic-dag-synthesis-receipt.v1',
    workflowId: workflow.workflowId,
    workflowRevision: workflow.workflowRevision,
    workflowChecksum: workflow.checksum,
    nodeCount: workflow.nodes.length,
    status: 'READY_FOR_PROOF',
    workflow,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
