import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const receiptArg = process.argv.find((arg) => arg.startsWith('--receipt='));
const receiptPath = resolve(root, receiptArg?.slice('--receipt='.length) ?? 'docs/reports/current-source-selection-input-v1.json');
const reportPath = resolve(root, 'docs/reports/current-snapshot-receipt-freshness-v1.json');
const repositoryId = process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app';
const producerRevision = 'atlas.current-snapshot-receipt-freshness.v1';

const digest = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const bindingChecksum = (bindings: Array<Record<string, unknown>>) => digest(
  bindings
    .map((binding) => [
      String(binding.sourceRef ?? ''),
      String(binding.sourceRevision ?? binding.codeSourceRevision ?? ''),
      String(binding.contentHash ?? ''),
      String(binding.byteLength ?? ''),
    ].join(':'))
    .sort()
    .join('\n'),
);

let receipt: Record<string, any>;
try {
  receipt = JSON.parse(await readFile(receiptPath, 'utf8'));
} catch (error) {
  throw new Error(`RECEIPT_UNREADABLE: ${receiptPath}: ${error instanceof Error ? error.message : String(error)}`);
}

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId,
  producerRevision,
});
const workspace = origin.record;
const currentBindings = origin.bindings as unknown as Array<Record<string, unknown>>;
const checks: Record<string, boolean> = {
  schema: receipt.schema === 'atlas.current-source-selection-input.v1',
  status: receipt.status === 'CURRENT_SNAPSHOT_PROVEN',
  executionId: typeof receipt.executionId === 'string' && receipt.executionId.trim().length > 0,
  workspaceRevision: receipt.workspaceRevision === workspace.workspaceRevision,
  workspaceRevisionRecordChecksum: receipt.workspaceRevisionRecordChecksum === workspace.checksum,
  workspaceOriginRuntimeRevision: receipt.workspaceOriginRuntimeRevision === origin.runtimeRevision,
};

if (typeof receipt.sourceRefSetChecksum === 'string' && Array.isArray(receipt.bindings)) {
  checks.sourceSelectionChecksum = receipt.sourceRefSetChecksum === bindingChecksum(receipt.bindings);
  checks.sourceSelectionMatchesCurrentWorkspace = receipt.bindings.length === currentBindings.length
    && receipt.sourceRefSetChecksum === bindingChecksum(currentBindings);
} else {
  checks.sourceSelectionChecksum = false;
  checks.sourceSelectionMatchesCurrentWorkspace = false;
}

const fresh = Object.values(checks).every(Boolean);
const report = {
  schema: 'atlas.current-snapshot-receipt-freshness.v1',
  status: fresh ? 'RECEIPT_FRESH_FOR_BOUND_WRITE' : (receipt.status === 'CURRENT_SNAPSHOT_PROVEN' ? 'RECEIPT_STALE_OR_INCOMPLETE' : 'RECEIPT_NOT_PROVEN'),
  readOnly: true,
  writesPerformed: false,
  receiptPath,
  receiptExecutionId: receipt.executionId ?? null,
  receiptWorkspaceRevision: receipt.workspaceRevision ?? null,
  currentWorkspaceRevision: workspace.workspaceRevision,
  receiptWorkspaceRevisionRecordChecksum: receipt.workspaceRevisionRecordChecksum ?? null,
  currentWorkspaceRevisionRecordChecksum: workspace.checksum,
  receiptWorkspaceOriginRuntimeRevision: receipt.workspaceOriginRuntimeRevision ?? null,
  currentWorkspaceOriginRuntimeRevision: origin.runtimeRevision,
  currentSourceCount: currentBindings.length,
  checks,
  producerRevision,
  observedAt: new Date().toISOString(),
};

await mkdir(resolve(root, 'docs/reports'), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, checks, reportPath }, null, 2));
if (!fresh) process.exitCode = 3;
