import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

/** Read-only proof that the admitted materialized source can reach the existing
 * 8095 AST/chunk boundary with the same repository-qualified identity. */
const ROOT = resolve(import.meta.dirname, '../..');
const ADMISSION = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/snapshot-bound-nlp-lineage-v1.json');
const SAMPLE_SIZE = 8;
const sha256 = (value: Buffer) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const digestHex = (value: unknown) => clean(value).toLowerCase().replace(/^sha256:/, '');
const clean = (value: unknown) => String(value ?? '').trim();
const safePath = (root: string, sourceRef: string) => {
  const target = resolve(root, sourceRef.replaceAll('\\', '/'));
  const rel = relative(root, target);
  return rel === '..' || rel.startsWith(`..${sep}`) ? null : target;
};

const admission = JSON.parse(await readFile(ADMISSION, 'utf8')) as {
  status?: string; authority?: boolean; workspaceRevision?: string; snapshotRevision?: string;
};
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true
  || !admission.workspaceRevision || !admission.snapshotRevision) throw new Error('ADMITTED_SNAPSHOT_REQUIRED');

const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${admission.snapshotRevision.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
  snapshotRevision?: string; sources?: Array<{ repositoryId: string; repositoryRelativePath: string; sourceRef: string; sourceRevision: string; contentDigest: string; byteLength: number }>;
};
if (snapshot.snapshotRevision !== admission.snapshotRevision || !snapshot.sources?.length) throw new Error('ADMITTED_SNAPSHOT_MISMATCH');
const materializedRoot = resolve(ROOT, '.tmp/workspace-source-snapshots', admission.snapshotRevision.replace(/^sha256:/, ''));
if (!existsSync(materializedRoot)) throw new Error('MATERIALIZED_SNAPSHOT_MISSING');

const repoEnv = loadRepoEnv(process.env);
process.env.DATABASE_URL = resolveDatabaseUrl(repoEnv);
const modelPath = String(repoEnv.ROTORQUANT_MODEL_PATH ?? repoEnv.TURBO_MODEL_PATH ?? '').trim();
if (!modelPath) throw new Error('ROTORQUANT_MODEL_PATH_REQUIRED_FOR_NLP_LINEAGE_PROOF');
process.env.ROTORQUANT_MODEL_PATH = modelPath;
const { executeACPTool } = await import('../../sveltekit-frontend/src/lib/server/services/knowledge-search/ACPToolRegistry.ts');
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, statement_timeout: 120000 });
const violations: string[] = [];
let members: Array<Record<string, unknown>> = [];
try {
  const result = await pool.query(`
    SELECT repository_id, repository_relative_path, source_ref, code_source_revision,
           content_hash, byte_length, workspace_revision
      FROM public.graphify_execution_file_membership_v2
     WHERE workspace_revision = $1
     ORDER BY repository_id, repository_relative_path
  `, [admission.workspaceRevision]);
  members = result.rows;
} finally { await pool.end(); }

const selected = members.filter((row) => {
  const sourceRef = clean(row.source_ref);
  return safePath(materializedRoot, sourceRef) && /\.(tsx?|mts|cts|jsx?)$/i.test(sourceRef);
}).slice(0, SAMPLE_SIZE);
const observations: unknown[] = [];
for (const row of selected) {
  const sourceRef = clean(row.source_ref);
  const file = safePath(materializedRoot, sourceRef);
  if (!file || !existsSync(file)) { violations.push(`MATERIALIZED_SOURCE_MISSING:${sourceRef}`); continue; }
  const bytes = await readFile(file);
  const digest = sha256(bytes);
  if (digestHex(digest) !== digestHex(row.content_hash) || digestHex(digest) !== digestHex(row.code_source_revision) || bytes.byteLength !== Number(row.byte_length)) {
    violations.push(`SOURCE_IDENTITY_MISMATCH:${sourceRef}`); continue;
  }
  const language = /\.(tsx?|mts|cts)$/i.test(sourceRef) ? 'typescript' : /\.jsx?$/i.test(sourceRef) ? 'javascript' : null;
  if (!language) continue;
  const result = await executeACPTool('nlp:ast-chunk', {
    source: bytes.toString('utf8'), language, filePath: sourceRef, sourceRevision: digest,
  });
  const data = result.data as Record<string, unknown> | undefined;
  observations.push({ sourceRef, repositoryId: row.repository_id, sourceRevision: digest, success: result.success, schema: data?.schema ?? null, chunkCount: Array.isArray(data?.chunks) ? data?.chunks.length : null });
  if (!result.success || data?.schema !== 'atlas.ast.evidence.v1') violations.push(`NLP_AST_CHUNK_FAILED:${sourceRef}`);
}

const report = {
  schema: 'atlas.snapshot-bound-nlp-lineage.v1', gate: 'SNAPSHOT-BOUND-NLP-LINEAGE-PREFLIGHT-01',
  status: violations.length === 0 && selected.length > 0 ? 'SNAPSHOT_BOUND_NLP_PREFLIGHT_PROVEN' : 'SNAPSHOT_BOUND_NLP_PREFLIGHT_BLOCKED',
  proofLevel: violations.length === 0 && selected.length > 0 ? 'BOUNDED_LIVE_PROVEN' : 'PARTIAL_PROVEN',
  sourceKind: 'ADMITTED_WORKSPACE_SNAPSHOT', workspaceRevision: admission.workspaceRevision,
  snapshotRevision: admission.snapshotRevision, materializedRoot, membershipRows: members.length,
  sampledRows: selected.length, sampleLimit: SAMPLE_SIZE, observations, violations,
  ownership: { sourceBytes: 'materialized snapshot', astCstAndChunks: 'LangExtract/Tree-sitter sidecar :8095', canonicalIdentity: 'PostgreSQL graphify_execution_file_membership_v2', writesPerformed: false },
  nextGate: violations.length === 0 ? 'CURRENT-PACKET-CHUNK-LINEAGE-BRIDGE-RECONCILIATION' : 'SNAPSHOT-BOUND-NLP-REPAIR-01',
  writesPerformed: false, canonicalAuthority: false,
};
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, workspaceRevision: report.workspaceRevision, membershipRows: members.length, sampledRows: selected.length, violations, reportPath: REPORT }, null, 2));
process.exitCode = report.status.endsWith('PROVEN') ? 0 : 1;
