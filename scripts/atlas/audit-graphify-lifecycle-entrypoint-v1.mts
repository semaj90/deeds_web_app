import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const reportPath = path.resolve(root, 'docs/reports/graphify-lifecycle-entrypoint-v1.json');
const repositoryId = process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app';
const producerRevision = 'atlas.graphify-lifecycle-entrypoint.v1';

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId,
  producerRevision,
});

const report = {
  schema: 'atlas.graphify-lifecycle-entrypoint-audit.v1',
  status: 'READY_FOR_INJECTED_WIRING',
  readOnly: true,
  workspaceRevision: origin.record.workspaceRevision,
  sourceManifestDigest: origin.record.sourceManifestDigest,
  repositoryId: origin.record.repositoryId,
  repositoryRevision: origin.record.baseCommitOid,
  sourceCount: origin.record.sourceCount,
  bindingCount: origin.bindings.length,
  skippedCount: origin.skipped.length,
  producerRevision,
  requiredOpenInputs: ['workspaceRevision', 'repositoryRevision', 'sourceManifestDigest', 'sourceBindings', 'parserContractVersion', 'extractionContractVersion'],
  lifecycleComposition: 'open -> fanout(runId) -> close(runId)',
  liveStartupWired: false,
  graphifyRunsWritten: false,
  canonicalAuthority: false,
  writesPerformed: false,
  blockers: origin.bindings.length === 0 ? ['WORKSPACE_SOURCE_BINDINGS_EMPTY'] : [],
};

await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, workspaceRevision: report.workspaceRevision, bindingCount: report.bindingCount, report: reportPath }, null, 2));
