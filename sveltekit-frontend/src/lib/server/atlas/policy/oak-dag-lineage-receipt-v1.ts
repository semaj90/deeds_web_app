import {
  checksumOakExecutionValueV1,
  oakExecutionLineageV1Schema,
  type OakExecutionLineageV1,
} from '@deeds/parent-atlas';
import type { OakExecutionReceiptV1 } from './oak-dag-execution-adapter-v1.js';

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
  const deterministicLineageExecutionChecksum = checksumOakExecutionValueV1({
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
