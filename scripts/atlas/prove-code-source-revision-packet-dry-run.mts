import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { dryRunCodeSourceRevisionPacket } from '../../sveltekit-frontend/src/lib/server/atlas/identity/code-source-revision-packet-dry-run.js';

const root = process.cwd();
const reportPath = path.join(root, 'docs', 'reports', 'code-source-revision-packet-dry-run.json');
const result = dryRunCodeSourceRevisionPacket({
  packetKey: 'packet:dry-run:code-source-revision',
  sourceRef: 'src/atlas/dry-run.ts',
  sourceContent: 'export const dryRun = true;\n',
  workspaceRevision: 'workspace:dry-run',
  representationId: 'semantic_768',
  representationRevision: 1,
});
const report = {
  schema: 'atlas.code-source-revision.packet-dry-run.v1',
  generatedAt: new Date().toISOString(),
  status: result.status === 'READY_FOR_PERSISTENCE_REVIEW'
    ? 'DRY_RUN_CONTRACT_PROVEN_INPUT_BINDING_OPEN'
    : 'DRY_RUN_BLOCKED',
  canonicalWrites: false,
  livePacketBinding: false,
  result,
};
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: path.relative(root, reportPath), canonicalWrites: false }, null, 2));
