import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  assertSummaryIdentityWriteAdmitted,
  SummaryIdentityWriteBlockedError,
} from './summary-identity-write-gate-v1.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../../..');

test('summary writes fail closed while identity is unresolved', () => {
  assert.throws(
    () => assertSummaryIdentityWriteAdmitted('offline-summary-pipeline'),
    (error) => error instanceof SummaryIdentityWriteBlockedError
      && error.code === 'SUMMARY_IDENTITY_UNRESOLVED'
      && error.message.includes('physical, logical, and attempt identities'),
  );
});

test('summary write gate rejects missing writer identity', () => {
  assert.throws(() => assertSummaryIdentityWriteAdmitted(''), /writer must be a non-empty string/);
});

test('offline summary pipeline is blocked before external services initialize', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/atlas/offline-summary-pipeline.mjs'), 'utf8');
  const guardPosition = source.indexOf("assertSummaryIdentityWriteAdmitted('offline-summary-pipeline')");
  const redisPosition = source.indexOf('const redis = new Redis', source.indexOf('async function main()'));

  assert.notEqual(guardPosition, -1);
  assert.ok(guardPosition < redisPosition);
});

test('analysis import keeps dry-run and blocks apply before SQL file writes', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/atlas/analysis-pass-orchestrator.mts'), 'utf8');
  const dryRunPosition = source.indexOf('if (isDryRun)');
  const guardPosition = source.indexOf("assertSummaryIdentityWriteAdmitted('analysis-pass-orchestrator')");
  const sqlWritePosition = source.indexOf('fs.writeFileSync(tempSqlFile, insertSQL)');

  assert.notEqual(dryRunPosition, -1);
  assert.notEqual(guardPosition, -1);
  assert.notEqual(sqlWritePosition, -1);
  assert.ok(dryRunPosition < guardPosition);
  assert.ok(guardPosition < sqlWritePosition);
});

test('summary stub writer is blocked before database initialization', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/atlas/backfill-summary-stubs.mjs'), 'utf8');
  const guardPosition = source.indexOf("assertSummaryIdentityWriteAdmitted('backfill-summary-stubs')");
  const poolPosition = source.indexOf('new pg.Pool');

  assert.notEqual(guardPosition, -1);
  assert.ok(guardPosition < poolPosition);
});

test('summary chunk backfill keeps preview and blocks apply before database initialization', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/atlas/backfill-summary-layers-from-chunks.mjs'), 'utf8');
  const applyPosition = source.indexOf("if (APPLY) assertSummaryIdentityWriteAdmitted('backfill-summary-layers-from-chunks')");
  const poolPosition = source.indexOf('new Pool({ connectionString: resolveDatabaseUrl(ENV)');

  assert.notEqual(applyPosition, -1);
  assert.ok(applyPosition < poolPosition);
});

test('Gemma summary apply is blocked before model or database work', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/atlas/gemma4-parent-atlas-summaries.mjs'), 'utf8');
  const guardPosition = source.indexOf("if (APPLY) assertSummaryIdentityWriteAdmitted('gemma4-parent-atlas-summaries')");
  const mainPosition = source.indexOf('async function main()');
  const poolPosition = source.indexOf('new pg.Pool', mainPosition);

  assert.ok(mainPosition < guardPosition);
  assert.ok(guardPosition < poolPosition);
});

test('Gemma summary importer rejects apply before database writes', async () => {
  const source = await readFile(path.join(repositoryRoot, 'scripts/atlas/import-gemma4-summaries.mjs'), 'utf8');
  const guardPosition = source.indexOf("assertSummaryIdentityWriteAdmitted('import-gemma4-summaries')");
  const writePosition = source.indexOf('await client.query(');

  assert.notEqual(guardPosition, -1);
  assert.ok(guardPosition < writePosition);
});

test('summary envelope and partial-batch apply paths are blocked after preview only', async () => {
  const envelopeSource = await readFile(path.join(repositoryRoot, 'scripts/atlas/phase8-step1-2-envelopes.mjs'), 'utf8');
  const envelopeDryRun = envelopeSource.indexOf('if (DRY_RUN)');
  const envelopeGuard = envelopeSource.indexOf("assertSummaryIdentityWriteAdmitted('phase8-step1-2-envelopes')");
  const envelopeUpdate = envelopeSource.indexOf('UPDATE atlas_summary_layers', envelopeGuard);
  const batchSource = await readFile(path.join(repositoryRoot, 'scripts/atlas/validate-5k-batch-partial.mjs'), 'utf8');
  const batchDryRun = batchSource.indexOf('if (DRY_RUN)');
  const batchGuard = batchSource.indexOf("assertSummaryIdentityWriteAdmitted('validate-5k-batch-partial')");
  const batchInsert = batchSource.indexOf('INSERT INTO atlas_summary_layers', batchGuard);

  assert.ok(envelopeDryRun < envelopeGuard);
  assert.ok(envelopeGuard < envelopeUpdate);
  assert.ok(batchDryRun < batchGuard);
  assert.ok(batchGuard < batchInsert);
});

test('remaining direct summary DML paths declare a fail-closed identity guard', async () => {
  const writers = [
    ['scripts/phase-2b-summary-layers-backfill.mjs', 'phase-2b-summary-layers-backfill', 'INSERT INTO atlas_summary_layers'],
    ['scripts/atlas/backfill-feature-envelopes.mjs', 'backfill-feature-envelopes', 'update atlas_summary_layers'],
    ['scripts/atlas/backfill-summary-context.mjs', 'backfill-summary-context', 'update atlas_summary_layers'],
    ['scripts/atlas/clean-summary-layer-quality.mjs', 'clean-summary-layer-quality', 'update atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/bulk-envelope-materialization.mts', 'bulk-envelope-materialization', 'INSERT INTO atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/embeddinggemma-batch-worker.mts', 'embeddinggemma-batch-worker', 'UPDATE atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/gemma4-offline-summary-worker.mts', 'gemma4-offline-summary-worker', 'INSERT INTO atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/kmeans-summary-enrichment.mts', 'kmeans-summary-enrichment', 'UPDATE atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/gpu-kmeans-clustering.mts', 'gpu-kmeans-clustering', 'UPDATE atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/phase-b-queue-consumer-gemma4.mts', 'phase-b-queue-consumer-gemma4', 'INSERT INTO atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/phase-b-queue-consumer-embedding.mts', 'phase-b-queue-consumer-embedding', 'UPDATE atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/phase-b-queue-consumer-embedding-batch.mts', 'phase-b-queue-consumer-embedding-batch', 'UPDATE atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/propagate-tree-node-ids.mjs', 'propagate-tree-node-ids', 'UPDATE atlas_summary_layers'],
    ['sveltekit-frontend/scripts/atlas/import-colab-summaries.mts', 'import-colab-summaries', '.insert(atlasSummaryLayers)'],
    ['packages/parent-atlas/src/pipelines/backfill-summary-stubs.ts', 'package-summary-stub-writer', 'INSERT INTO atlas_summary_layers', 'SUMMARY_IDENTITY_UNRESOLVED', 'backfillSummarySubs()'],
  ];

  for (const [relativePath, writer, statement, expectedGuard, entryCall] of writers) {
    const source = await readFile(path.join(repositoryRoot, relativePath), 'utf8');
    const guardPosition = source.indexOf(expectedGuard ?? `assertSummaryIdentityWriteAdmitted('${writer}')`);
    const writePosition = source.indexOf(statement);
    const invocationPosition = source.lastIndexOf(entryCall ?? 'main()');

    assert.notEqual(guardPosition, -1, `${writer} must include the summary identity guard`);
    assert.notEqual(writePosition, -1, `${writer} must retain the expected DML site`);
    assert.ok(guardPosition < invocationPosition, `${writer} guard must be defined before script invocation`);
  }
});
