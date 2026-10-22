import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { runIndexedSourceBatchV1, validateIndexedSourceBatchRequestV1, verifyIndexedSourceProviderReceiptV1, verifyReusableIndexedSourceReceiptV1 } from './lib/indexed-source-batch-v1.mjs';
import { selectIndexedSourceCohortPageV1 } from './lib/indexed-source-cohort-v1.mjs';

const executeFile = promisify(execFile);

function reusablePageItems(request) {
  if (!process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT) return new Map();
  const directory = path.join(REPO_ROOT, '.tmp/atlas');
  const items = new Map();
  for (const name of fs.readdirSync(directory).filter(name => /^indexed-source-batch-\d+\.json$/.test(name)).sort().reverse()) {
    const page = readProviderReceipt(path.relative(REPO_ROOT, path.join(directory, name)));
    const { receiptChecksum, ...body } = page;
    if (receiptChecksum !== `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`) continue;
    if (page.directory !== request.directory || page.workspaceRevision !== request.workspaceRevision ||
        page.afterSourceRef !== request.afterSourceRef || Boolean(page.enableSvelteTypeScriptPlugin) !== request.enableSvelteTypeScriptPlugin) continue;
    for (const item of page.items ?? []) {
      if (item.status === 'COMPLETED' && !items.has(item.sourceRef)) items.set(item.sourceRef, item);
    }
  }
  return items;
}

function readProviderReceipt(relativePath) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) throw new Error('PROVIDER_RECEIPT_PATH_INVALID');
  const root = fs.realpathSync(path.join(REPO_ROOT, '.tmp', 'atlas'));
  const filePath = fs.realpathSync(path.resolve(REPO_ROOT, relativePath));
  const relative = path.relative(root, filePath);
  if (!relative || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative) || fs.statSync(filePath).size > 4 * 1024 * 1024) {
    throw new Error('PROVIDER_RECEIPT_PATH_OR_SIZE_INVALID');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

export async function readIndexedSourceDirectoryRowsV1(input, dependencies = {}, inventory = false) {
  const request = validateIndexedSourceBatchRequestV1(input);
  const env = dependencies.loadEnvironment ? dependencies.loadEnvironment() : loadRepoEnv(process.env);
  const poolOptions = { connectionString: resolveDatabaseUrl(env), max: 1, connectionTimeoutMillis: 5000 };
  const pool = dependencies.createPool ? dependencies.createPool(poolOptions) : new pg.Pool(poolOptions);
  let client;
  let sourceRows;
  try {
    client = await pool.connect();
    await client.query(inventory ? 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '10s'");
    const result = await client.query(
      `SELECT b.canonical_source_ref, b.source_revision, b.workspace_revision,
              count(*)::int AS binding_count, count(DISTINCT gf.file_id)::int AS graphify_file_match_count
       FROM atlas_workspace_source_bindings b
       ${inventory ? 'LEFT JOIN' : 'JOIN'} graphify_files gf ON gf.source_ref = b.canonical_source_ref AND gf.code_source_revision = b.source_revision
       WHERE b.workspace_revision = $1 AND left(b.canonical_source_ref, length($2)) = $2
         AND lower(b.canonical_source_ref) ~ '\\.(ts|tsx|js|jsx|mts|cts|mjs|cjs|svelte)$'
         AND ($4::text IS NULL OR b.canonical_source_ref COLLATE "C" > $4)
       GROUP BY b.canonical_source_ref, b.source_revision, b.workspace_revision
       ORDER BY b.canonical_source_ref COLLATE "C", b.source_revision COLLATE "C"
       LIMIT $3`, [request.workspaceRevision, `${request.directory}/`, inventory ? 100001 : request.limit + 1, inventory ? null : request.afterSourceRef]);
    sourceRows = result.rows;
    if (inventory && sourceRows.length > 100000) throw new Error('INDEXED_SOURCE_INVENTORY_LIMIT_EXCEEDED');
    await client.query('ROLLBACK');
  } catch (error) {
    try { await client?.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client?.release();
    await pool.end();
  }
  return sourceRows;
}

export async function auditIndexedSourceDirectoryV1(input, dependencies = {}) {
  const request = validateIndexedSourceBatchRequestV1(input);
  const env = dependencies.loadEnvironment ? dependencies.loadEnvironment() : loadRepoEnv(process.env);
  const sidecarUrl = input.sidecarUrl ?? env.MINIFORGE_SIDECAR_URL ?? env.LANGEXTRACT_URL ?? 'http://127.0.0.1:8095';
  if (!/^http:\/\/127\.0\.0\.1:\d{2,5}$/.test(sidecarUrl)) throw new Error('INDEXED_SOURCE_BATCH_SIDECAR_INVALID');
  const cohort = input.cohortPath ? readProviderReceipt(input.cohortPath) : null;
  if (cohort && cohort.snapshotRevision !== `sha256:${path.basename(fs.realpathSync(process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT))}`) throw new Error('COHORT_SNAPSHOT_MISMATCH');
  const sourceRows = cohort ? selectIndexedSourceCohortPageV1(cohort, request) : await readIndexedSourceDirectoryRowsV1(input, dependencies);
  const reusable = dependencies.executeFile ? new Map() : reusablePageItems(request);
  const report = await runIndexedSourceBatchV1({ ...request, sourceRows, analyzeSource: async row => {
    const prior = reusable.get(row.canonical_source_ref);
    if (prior) {
      try {
        const receipt = readProviderReceipt(prior.receiptPath);
        const snapshotRoot = fs.realpathSync(process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT);
        const sourcePath = fs.realpathSync(path.join(snapshotRoot, row.canonical_source_ref));
        const relative = path.relative(snapshotRoot, sourcePath);
        if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('REUSE_SOURCE_OUTSIDE_SNAPSHOT');
        return verifyReusableIndexedSourceReceiptV1(receipt, { ...prior, status: receipt.status,
          indexingOutcome: receipt.indexingOutcome, canonicalAuthority: false, canonicalWritesCommitted: 0 }, row,
          `sha256:${path.basename(snapshotRoot)}`, fs.readFileSync(sourcePath));
      } catch {}
    }
    const script = path.join(REPO_ROOT, 'scripts', 'atlas', 'audit-indexed-source-providers-v1.mjs');
    const execute = dependencies.executeFile ?? executeFile;
    const sveltePluginSetting = request.enableSvelteTypeScriptPlugin ? 'on' : 'off';
    const { stdout } = await execute(process.execPath, [script, row.canonical_source_ref, request.workspaceRevision,
      `--sidecar=${sidecarUrl}`, `--svelte-typescript-plugin=${sveltePluginSetting}`], {
      cwd: REPO_ROOT, timeout: 420_000, maxBuffer: 1024 * 1024, windowsHide: true,
    });
    const summary = JSON.parse(stdout);
    const receipt = (dependencies.readReceipt ?? readProviderReceipt)(summary.receiptPath);
    return verifyIndexedSourceProviderReceiptV1(receipt, summary);
  } });
  if (!cohort) return report;
  const { receiptChecksum, ...body } = report;
  const qualified = { ...body, cohortReceiptChecksum: cohort.receiptChecksum, cohortPath: input.cohortPath };
  return { ...qualified, receiptChecksum: `sha256:${createHash('sha256').update(JSON.stringify(qualified)).digest('hex')}` };
}

async function main() {
  const args = process.argv.slice(2);
  const pluginFlag = args.find(arg => arg.startsWith('--svelte-typescript-plugin='));
  const cohortFlag = args.find(arg => arg.startsWith('--cohort='));
  const positional = args.filter(arg => !arg.startsWith('--svelte-typescript-plugin=') && !arg.startsWith('--cohort='));
  const [directory, workspaceRevision, limit = '8', concurrency = '2', afterSourceRef = null] = positional;
  const pluginMode = pluginFlag?.slice('--svelte-typescript-plugin='.length) ?? 'off';
  if (!['on', 'off'].includes(pluginMode)) throw new Error('INDEXED_SOURCE_BATCH_SVELTE_TYPESCRIPT_PLUGIN_INVALID');
  const report = await auditIndexedSourceDirectoryV1({ directory, workspaceRevision, limit: Number(limit), concurrency: Number(concurrency), afterSourceRef,
    enableSvelteTypeScriptPlugin: pluginMode === 'on', cohortPath: cohortFlag?.slice('--cohort='.length) });
  const outputDirectory = path.join(REPO_ROOT, '.tmp', 'atlas');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const outputPath = path.join(outputDirectory, `indexed-source-batch-${Date.now()}.json`);
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ...report, reportPath: path.relative(REPO_ROOT, outputPath).replaceAll('\\', '/') }, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(error => { console.error(String(error?.message ?? error)); process.exitCode = 1; });
}
