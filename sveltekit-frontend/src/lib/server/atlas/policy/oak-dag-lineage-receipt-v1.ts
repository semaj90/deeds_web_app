import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { OakExecutionReceiptV1 } from './oak-dag-execution-adapter-v1.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const oakExecutionLineageV1Schema = z.object({
  schema: z.literal('atlas.oak-execution-lineage.v1'),
  requestId: id,
  kernelRevision: revision,
  functionRevision: revision,
  contextManifestChecksum: sha256Hex,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: sha256Hex,
  workspaceRevision: revision,
  sourceRevisionSetChecksum: sha256Hex,
  evidenceRevisionSetChecksum: sha256Hex,
  graphRevision: revision.nullable(),
  representationRevision: revision.nullable(),
  producerRevision: revision,
  canonicalAuthority: z.literal(false),
}).strict();

export type OakExecutionLineageV1 = z.infer<typeof oakExecutionLineageV1Schema>;

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = stable((value as Record<string, unknown>)[key]);
        return out;
      }, {});
  }
  return value;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

export type OakLineageBoundExecutionReceiptV1 = Readonly<{
  schema: 'atlas.oak-lineage-bound-execution-receipt.v1';
  execution: OakExecutionReceiptV1;
  lineage: OakExecutionLineageV1;
  deterministicLineageExecutionChecksum: string;
  writesPerformed: false;
  canonicalAuthority: false;
}>;

/**
 * Binds an already-produced read-only OaK receipt to the exact Parent Atlas
 * identity/revision context that admitted it. Runtime timing is intentionally
 * excluded from the deterministic checksum by using the executor's own
 * deterministicExecutionChecksum rather than the full action receipts.
 */
export function bindOakExecutionReceiptToLineageV1(input: {
  execution: OakExecutionReceiptV1;
  lineage: OakExecutionLineageV1;
}): OakLineageBoundExecutionReceiptV1 {
  const lineage = oakExecutionLineageV1Schema.parse(input.lineage);
  if (input.execution.writesPerformed !== false || input.execution.canonicalAuthority !== false) {
    throw new Error('OAK_LINEAGE_EXECUTION_NOT_READ_ONLY');
  }
  const deterministicLineageExecutionChecksum = checksum({
    planId: input.execution.planId,
    planChecksum: input.execution.planChecksum,
    deterministicExecutionChecksum: input.execution.deterministicExecutionChecksum,
    lineage,
  });
  return {
    schema: 'atlas.oak-lineage-bound-execution-receipt.v1',
    execution: input.execution,
    lineage,
    deterministicLineageExecutionChecksum,
    writesPerformed: false,
    canonicalAuthority: false,
  };
}
