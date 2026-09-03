import type { WorkspaceRevisionRecordV1, WorkspaceSourceBindingV1 } from '../identity/workspace-source-binding-v1.js';
import {
  completeGraphifyRunV2,
  writeGraphifySourceInventoryV2,
  type GraphifySourceInventorySqlClientV2,
} from './graphify-source-inventory-writer-v2.js';

export type GraphifyLifecycleCompositionDepsV1<OpenReceipt, CloseReceipt, FanoutReceipt> = {
  open: (input: {
    record: WorkspaceRevisionRecordV1;
    bindings: readonly WorkspaceSourceBindingV1[];
  }) => Promise<OpenReceipt & { runId: string }>;
  fanout: (input: { runId: string; record: WorkspaceRevisionRecordV1 }) => Promise<FanoutReceipt>;
  close: (input: { runId: string }) => Promise<CloseReceipt>;
};

export async function runGraphifyLifecycleCompositionV1<OpenReceipt, CloseReceipt, FanoutReceipt>(input: {
  record: WorkspaceRevisionRecordV1;
  bindings: readonly WorkspaceSourceBindingV1[];
  deps: GraphifyLifecycleCompositionDepsV1<OpenReceipt, CloseReceipt, FanoutReceipt>;
}): Promise<{ open: OpenReceipt & { runId: string }; fanout: FanoutReceipt; close: CloseReceipt }> {
  const opened = await input.deps.open({ record: input.record, bindings: input.bindings });
  if (!opened.runId) throw new Error('GRAPHIFY_LIFECYCLE_OPEN_MISSING_RUN_ID');

  const fanout = await input.deps.fanout({ runId: opened.runId, record: input.record });
  const closed = await input.deps.close({ runId: opened.runId });
  return { open: opened, fanout, close: closed };
}

export function createGraphifyLifecycleWriterDepsV1(input: {
  client: GraphifySourceInventorySqlClientV2;
  workspaceId: string;
  parserContractVersion: string;
  extractionContractVersion: string;
  configuration?: Record<string, unknown>;
  fanout: (input: { runId: string; record: WorkspaceRevisionRecordV1 }) => Promise<unknown>;
}) {
  return {
    open: ({ record, bindings }: { record: WorkspaceRevisionRecordV1; bindings: readonly WorkspaceSourceBindingV1[] }) =>
      writeGraphifySourceInventoryV2({
        client: input.client,
        workspaceId: input.workspaceId,
        record,
        bindings,
        parserContractVersion: input.parserContractVersion,
        extractionContractVersion: input.extractionContractVersion,
        configuration: input.configuration,
      }),
    fanout: input.fanout,
    close: ({ runId }: { runId: string }) =>
      completeGraphifyRunV2({ client: input.client, runId, workspaceId: input.workspaceId }),
  };
}
