#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { classifyGraphifySourceBridgeV1 } from './lib/graphify-source-bridge-classification-v1.mjs';
import { qualifySealedGraphifyBindingsV1 } from './lib/sealed-graphify-binding-qualification-v1.mjs';
import {
  buildSealedSnapshotGraphifyInventoryPlanV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/indexing/graphify-source-inventory-writer-v2.ts';

const args = process.argv.slice(2);
const valueFor = (name: string) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
};
const admissionPath = path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const admission = JSON.parse(fs.readFileSync(admissionPath, 'utf8'));
const workspaceRevision = valueFor('--workspace-revision') ?? admission.workspaceRevision;
const outputArg = valueFor('--output');
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true
  || admission.graphifyExecutionAuthorized !== false || admission.projectionWritesAuthorized !== false) {
  throw new Error('SEALED_GRAPHIFY_PLAN_ADMISSION_RECEIPT_INVALID');
}
if (workspaceRevision !== admission.workspaceRevision) throw new Error('SEALED_GRAPHIFY_PLAN_WORKSPACE_REVISION_MISMATCH');
if (!outputArg) throw new Error('SEALED_GRAPHIFY_PLAN_OUTPUT_REQUIRED_UNDER_TMP');
const outputPath = path.resolve(REPO_ROOT, outputArg);
const tmpRoot = path.join(REPO_ROOT, '.tmp');
const outputRelative = path.relative(tmpRoot, outputPath);
if (!outputRelative || outputRelative.startsWith('..') || path.isAbsolute(outputRelative)) {
  throw new Error('SEALED_GRAPHIFY_PLAN_OUTPUT_MUST_REMAIN_UNDER_TMP');
}
const planPath = outputPath.replace(/\.json$/i, '.plan.json');
const planRelative = path.relative(tmpRoot, planPath);
if (!planRelative || planRelative.startsWith('..') || path.isAbsolute(planRelative)) {
  throw new Error('SEALED_GRAPHIFY_PLAN_FILE_MUST_REMAIN_UNDER_TMP');
}

const manifestPath = path.join(
  REPO_ROOT,
  'docs/reports/workspace-source-snapshots',
  `${String(admission.snapshotRevision).replace(/^sha256:/, '')}.json`,
);
const snapshot = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const rootRepositories = (snapshot.repositories ?? []).filter((repository: any) =>
  repository.kind === 'ROOT' && repository.relativePath === '',
);
if (rootRepositories.length !== 1 || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(String(rootRepositories[0].head ?? ''))
  || typeof rootRepositories[0].dirty !== 'boolean') {
  throw new Error('SEALED_GRAPHIFY_PLAN_ROOT_GIT_PROVENANCE_INVALID');
}
const rootGitProvenance = {
  baseCommitOid: String(rootRepositories[0].head),
  dirty: rootRepositories[0].dirty,
};
const manifest = (snapshot.sources ?? [])
  .filter((source: any) => source.repositoryId === 'repo:root')
  .map((source: any) => ({
    repositoryId: String(source.repositoryId),
    repositoryRelativePath: String(source.repositoryRelativePath ?? ''),
    sourceRef: String(source.sourceRef ?? '').replaceAll('\\', '/'),
    sourceRevision: String(source.sourceRevision ?? ''),
    contentDigest: String(source.contentDigest ?? '').replace(/^sha256:/i, '').toLowerCase(),
    byteLength: Number(source.byteLength),
  }))
  .sort((left: any, right: any) => Buffer.compare(Buffer.from(left.sourceRef), Buffer.from(right.sourceRef)));
if (manifest.length === 0 || manifest.length > snapshot.sources.length
  || admission.sourceCount !== snapshot.sources.length) {
  throw new Error(`SEALED_GRAPHIFY_PLAN_ROOT_COHORT_MISMATCH:${manifest.length}:${snapshot.sources.length}`);
}

const snapshotRoot = path.resolve(REPO_ROOT, '.tmp', 'workspace-source-snapshots', String(admission.snapshotRevision).replace(/^sha256:/, ''));
const realSnapshotRoot = fs.realpathSync(snapshotRoot);
const sourceBytes = new Map<string, { digest: string; byteLength: number; status: string }>();
for (const source of manifest) {
  const parts = source.repositoryRelativePath.replaceAll('\\', '/').split('/');
  if (!source.sourceRef || !source.repositoryRelativePath || parts.some((part: string) => !part || part === '.' || part === '..')
    || path.isAbsolute(source.repositoryRelativePath)) {
    sourceBytes.set(source.sourceRef, { digest: '', byteLength: -1, status: 'INVALID_PATH' });
    continue;
  }
  const candidate = path.resolve(realSnapshotRoot, ...parts);
  const relative = path.relative(realSnapshotRoot, candidate);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    sourceBytes.set(source.sourceRef, { digest: '', byteLength: -1, status: 'PATH_OUTSIDE_SNAPSHOT' });
    continue;
  }
  try {
    const realPath = fs.realpathSync(candidate);
    const realRelative = path.relative(realSnapshotRoot, realPath);
    if (!realRelative || realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      sourceBytes.set(source.sourceRef, { digest: '', byteLength: -1, status: 'SYMLINK_OUTSIDE_SNAPSHOT' });
      continue;
    }
    const bytes = fs.readFileSync(realPath);
    const digest = crypto.createHash('sha256').update(bytes).digest('hex');
    const status = `sha256:${digest}` === source.sourceRevision && digest === source.contentDigest
      && bytes.byteLength === source.byteLength ? 'MATCH' : 'DRIFT';
    sourceBytes.set(source.sourceRef, { digest, byteLength: bytes.byteLength, status });
  } catch (error) {
    sourceBytes.set(source.sourceRef, {
      digest: '', byteLength: -1,
      status: error instanceof Error && 'code' in error && error.code === 'ENOENT' ? 'MISSING' : 'READ_ERROR',
    });
  }
}

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 120000,
  application_name: 'atlas-plan-sealed-graphify-inventory-v1',
});
const client = await pool.connect();
let existingRows: Array<Record<string, unknown>> = [];
let bindingRows: Array<Record<string, unknown>> = [];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  existingRows = (await client.query(`
    SELECT files.source_ref::text, files.workspace_revision::text,
           files.code_source_revision::text, files.content_hash::text, files.byte_length::int,
           files.first_seen_run_id::text, first_seen.workspace_id::text AS first_seen_workspace_id
      FROM public.graphify_files AS files
      JOIN public.graphify_runs AS first_seen
        ON first_seen.run_id = files.first_seen_run_id
     WHERE files.source_ref = ANY($1::text[])
     ORDER BY files.source_ref, files.workspace_revision, files.code_source_revision
  `, [manifest.map((source: any) => source.sourceRef)])).rows;
  bindingRows = (await client.query(`
    SELECT repo_id, canonical_source_ref::text, workspace_revision::text,
           source_revision::text, content_digest::text, byte_length::text
      FROM public.atlas_workspace_source_bindings
     WHERE repo_id = 'deeds-web-app'
       AND workspace_revision = $1
       AND canonical_source_ref = ANY($2::text[])
     ORDER BY canonical_source_ref
  `, [workspaceRevision, manifest.map((source: any) => source.sourceRef)])).rows;
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

const bridgeClasses = classifyGraphifySourceBridgeV1({ manifestRows: manifest, graphifyRows: existingRows, workspaceRevision });
const bridgeByRef = new Map(bridgeClasses.map((row) => [row.sourceRef, row]));
const sourceBindingQualification = qualifySealedGraphifyBindingsV1({
  sources: manifest,
  bindingRows,
  workspaceRevision,
  repositoryId: 'deeds-web-app',
});
const qualifiedBindingRefs = new Set(sourceBindingQualification.qualifiedSourceRefs);
const byteCounts = [...sourceBytes.values()].reduce<Record<string, number>>((result, row) => {
  result[row.status] = (result[row.status] ?? 0) + 1;
  return result;
}, {});
const candidates = manifest.flatMap((source: any) => {
  const bytes = sourceBytes.get(source.sourceRef)!;
  if (bytes.status !== 'MATCH' || !qualifiedBindingRefs.has(source.sourceRef)) return [];
  const bridge = bridgeByRef.get(source.sourceRef)!;
  if (bridge.exactSourceRevisionRowCount > 1) {
    throw new Error(`SEALED_GRAPHIFY_PLAN_AMBIGUOUS_PRIOR_EXACT_REVISION:${source.sourceRef}`);
  }
  return [{
    sourceRef: source.sourceRef,
    workspaceRevision,
    sourceRevision: source.sourceRevision,
    inventoryState: bridge.graphifyRowCount === 0
      ? 'NO_GRAPHIFY_ROW' as const
      : bridge.exactSourceRevisionRowCount > 0
        ? 'EXACT_SOURCE_REVISION_ROW' as const
        : 'OTHER_REVISION_ROW_ONLY' as const,
    priorFirstSeenRunId: bridge.priorFirstSeenRunId,
    priorFirstSeenWorkspaceId: bridge.priorFirstSeenWorkspaceId,
    byteStatus: 'MATCH' as const,
    observedContentDigest: bytes.digest,
    observedByteLength: bytes.byteLength,
  }];
});

const plan = candidates.length > 0 ? buildSealedSnapshotGraphifyInventoryPlanV1({
  snapshotRevision: admission.snapshotRevision,
  workspaceRevision,
  baseCommitOid: rootGitProvenance.baseCommitOid,
  sourceManifestDigest: String(admission.sourceSelectionChecksum).replace(/^sha256:/, ''),
  snapshotMembershipChecksum: String(admission.snapshotMembershipChecksum).replace(/^sha256:/, ''),
  snapshotSourceCount: snapshot.sources.length,
  scopeSourceCount: manifest.length,
  sources: manifest,
  candidates,
}) : null;
const serialize = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const fileDigest = (value: string) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
let planFile = null;
if (plan) {
  const planText = serialize(plan);
  fs.mkdirSync(path.dirname(planPath), { recursive: true });
  fs.writeFileSync(planPath, planText, { flag: 'wx' });
  planFile = { path: path.relative(REPO_ROOT, planPath), sha256: fileDigest(planText), selectedSourceCount: plan.selectedSourceCount };
}
const receipt = {
  schema: 'atlas.sealed-graphify-inventory-dry-plan.v1',
  generatedAt: new Date().toISOString(),
  status: candidates.length === manifest.length && sourceBindingQualification.counts.exact === manifest.length
    ? 'ALL_ROOT_SOURCES_BYTE_AND_BINDING_VERIFIED_PLAN_READY'
    : 'PARTIAL_BYTE_OR_BINDING_QUALIFICATION_PLAN_ONLY',
  workspaceRevision,
  snapshotRevision: admission.snapshotRevision,
  snapshotSourceCount: snapshot.sources.length,
  sourceScope: 'repo:root',
  rootManifestSourceCount: manifest.length,
  exactByteVerification: byteCounts,
  sourceBindingQualification: {
    expectedSourceCount: sourceBindingQualification.expectedSourceCount,
    observedBindingRowCount: sourceBindingQualification.observedBindingRowCount,
    counts: sourceBindingQualification.counts,
    checksum: sourceBindingQualification.checksum,
  },
  historicalGraphifyClassifications: bridgeClasses.reduce<Record<string, number>>((result, row) => {
    result[row.classification] = (result[row.classification] ?? 0) + 1;
    return result;
  }, {}),
  candidateCount: candidates.length,
  plan: planFile,
  executionAuthorized: false,
  rootGitProvenance,
  writerRowShapeCompatible: plan?.writerRowShapeCompatible ?? false,
  existingWriterExecutionCompatible: plan?.existingWriterExecutionCompatible ?? false,
  canonicalAuthority: false,
  writesPerformed: { postgres: false, qdrant: false, neo4j: false, valkey: false },
};
const receiptText = serialize(receipt);
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, receiptText, { flag: 'wx' });
console.log(JSON.stringify({ ...receipt, outputPath: path.relative(REPO_ROOT, outputPath), outputSha256: fileDigest(receiptText) }, null, 2));
