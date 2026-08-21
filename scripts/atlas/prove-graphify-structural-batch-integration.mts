#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { GraphifyStructuralMaterializer } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-materializer.js';
import {
  materializeGraphifyStructuralBatchV1,
  materializeGraphifyStructuralDeltaV1,
  type GraphifyStructuralBatchInputV1,
  type GraphifyStructuralDeltaManifestRowV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-structural-batch-v1.js';
import { resolveRepositorySourceRevision } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/repository-source-revision.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '../..');
const REPORT_PATH = path.resolve(REPO_ROOT, 'docs/reports/gph15-gph16-structural-batch-proof.json');
const MANIFEST_PATH = path.resolve(REPO_ROOT, 'docs/reports/gph16-structural-delta-manifest.json');
const LIMIT = Math.max(1, Number(process.env.ATLAS_GPH_BATCH_LIMIT ?? '8'));
const INCLUDE = (process.env.ATLAS_GPH_BATCH_INCLUDE ?? 'sveltekit-frontend/src/lib/server/atlas').replaceAll('\\', '/');
const SUPPORTED: Record<string, string> = { '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.mjs': 'javascript', '.mts': 'typescript' };

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function discover(dir: string, out: string[]): Promise<void> {
  if (out.length >= LIMIT) return;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (out.length >= LIMIT) return;
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.svelte-kit') continue;
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) await discover(absolute, out);
    else if (entry.isFile() && SUPPORTED[path.extname(entry.name).toLowerCase()]) out.push(absolute);
  }
}

async function currentInputs(): Promise<{ rows: GraphifyStructuralBatchInputV1[]; rejected: unknown[] }> {
  const root = path.resolve(REPO_ROOT, INCLUDE);
  const files: string[] = [];
  await discover(root, files);
  const rows: GraphifyStructuralBatchInputV1[] = [];
  const rejected: unknown[] = [];
  for (const absolute of files.sort()) {
    const sourceRef = path.relative(REPO_ROOT, absolute).replaceAll('\\', '/');
    const revision = resolveRepositorySourceRevision({ repoRoot: REPO_ROOT, sourceRef });
    const source = await readFile(absolute, 'utf8');
    if (revision.status !== 'SOURCE_REVISION_RESOLVED' || !revision.sourceRevision) {
      rejected.push({ sourceRef, revision });
      continue;
    }
    rows.push({
      sourceRef,
      sourceRevision: revision.sourceRevision,
      contentHash: sha256(source),
      language: SUPPORTED[path.extname(absolute).toLowerCase()]!,
      source,
    });
  }
  return { rows, rejected };
}

async function previousManifest(): Promise<GraphifyStructuralDeltaManifestRowV1[]> {
  try {
    const raw = JSON.parse(await readFile(MANIFEST_PATH, 'utf8')) as { files?: GraphifyStructuralDeltaManifestRowV1[] };
    return Array.isArray(raw.files) ? raw.files : [];
  } catch {
    return [];
  }
}

const current = await currentInputs();
const previous = await previousManifest();
const materializer = new GraphifyStructuralMaterializer();
const workspaceRevision = current.rows[0]?.sourceRevision ?? 'UNRESOLVED';

const batch = await materializeGraphifyStructuralBatchV1({
  workspaceRevision,
  producerRevision: 'prove-graphify-structural-batch-integration.v1',
  files: current.rows,
  materializer,
});

const delta = await materializeGraphifyStructuralDeltaV1({
  previousSnapshotRevision: previous[0]?.sourceRevision ?? 'NO_PREVIOUS_MANIFEST',
  currentSnapshotRevision: workspaceRevision,
  previous,
  current: current.rows,
  materializer,
});

const report = {
  schema: 'atlas.gph15-gph16-structural-batch-proof.v1',
  generatedAt: new Date().toISOString(),
  gph15aCanonicalSourceRevision: current.rejected.length === 0,
  gph15ParseFailureIsolation: batch.isolatedFailurePass,
  gph16ProductionDeltaOrchestration: true,
  sourceRevisionPolicy: 'CLEAN_GIT_HEAD_ONLY',
  contentHashSeparateFromSourceRevision: true,
  batch,
  delta,
  sourceRevisionRejectedFiles: current.rejected,
  persistenceReadback: false,
  graphifyDailyReachability: false,
  canonicalDeletionPerformed: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
  canonicalWritesAllowed: false,
  status: current.rejected.length > 0 || batch.failedCount > 0 ? 'PROVEN_WITH_ISOLATED_FILE_FAILURES' : 'PROVEN_READ_ONLY_BATCH',
};

await mkdir(path.dirname(REPORT_PATH), { recursive: true });
await writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + '\n', 'utf8');
await writeFile(MANIFEST_PATH, JSON.stringify({
  schema: 'atlas.graphify-structural-delta-manifest.v1',
  createdAt: new Date().toISOString(),
  files: current.rows.map(({ sourceRef, sourceRevision, contentHash }) => ({ sourceRef, sourceRevision, contentHash })),
}, null, 2) + '\n', 'utf8');
console.log(JSON.stringify({ status: report.status, reportPath: REPORT_PATH, manifestPath: MANIFEST_PATH }, null, 2));
