import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const repoRoot = resolve(process.argv[2] ?? process.cwd());
const sourcePath = resolve(
  repoRoot,
  'sveltekit-frontend/src/lib/server/atlas/agentic/agentic-action-registry-v1.ts'
);
const reportPath = resolve(
  process.argv[3] ?? 'docs/reports/agentic-action-registry-owner-v1.json'
);

const source = await readFile(sourcePath, 'utf8');
const sourceChecksum = `sha256:${createHash('sha256').update(source).digest('hex')}`;
const actionIds = [...source.matchAll(/actionId:\s*'([^']+)'/g)].map((match) => match[1]);
const uniqueActionIds = [...new Set(actionIds)].sort();
const mutationActionIds = [...source.matchAll(/actionId:\s*'([^']+)'[\s\S]*?mutability:\s*'([^']+)'/g)]
  .filter((match) => match[2] !== 'READ_ONLY')
  .map((match) => match[1])
  .sort();

const report = {
  schema: 'atlas.agentic-action-registry-owner-audit.v1',
  source: {
    path: sourcePath,
    checksum: sourceChecksum,
    exportedRegistry: 'AGENTIC_ACTION_REGISTRY_V1_SEED',
  },
  census: {
    actionCount: actionIds.length,
    uniqueActionCount: uniqueActionIds.length,
    duplicateActionIds: actionIds.filter((id, index) => actionIds.indexOf(id) !== index),
    actionIds: uniqueActionIds,
    mutationActionIds,
  },
  ownerDecision: {
    storageOwner: 'CODE_DEFINED',
    status: 'NOT_REQUIRED_AT_CURRENT_SCALE',
    postgresTable: false,
    bm25SearchIndex: false,
    canonicalAuthority: false,
    writesPerformed: false,
    rationale: [
      'The registry is a bounded 13-action seed used by typed lookup/filter helpers.',
      'The current change does not require external action discovery, persistence, or full-text action search.',
      'Moving it to PostgreSQL now would create a second owner without a migration, readback, or caller requirement.',
    ],
    revisitWhen: [
      'An admitted requirement needs operator-managed action discovery or BM25 search.',
      'The registry needs durable audit/history independent of the source release.',
      'The registry grows beyond a bounded code-defined catalog and a replacement owner is explicitly authorized.',
    ],
  },
  safety: {
    decisionScope: 'AR-02.1',
    runtimeBehaviorChanged: false,
    databaseWrites: false,
    migrationRequired: false,
    promotionAuthorized: false,
  },
};

if (report.census.actionCount !== 13 || report.census.uniqueActionCount !== 13) {
  throw new Error(`Unexpected action registry census: ${report.census.actionCount}/${report.census.uniqueActionCount}`);
}

await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, reportPath }, null, 2));
