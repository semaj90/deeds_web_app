import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { classifyIndexedSourceProviderResultV1, runIndexedSourceBatchV1,
  validateExactIndexedSourcePathV1, validateIndexedSourceBatchRequestV1, verifyIndexedSourceProviderReceiptV1, verifyReusableIndexedSourceReceiptV1 } from './indexed-source-batch-v1.mjs';
import { auditIndexedSourceDirectoryV1, readIndexedSourceDirectoryRowsV1 } from '../audit-indexed-source-batch-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const request = { directory: 'src/routes', workspaceRevision, limit: 4, concurrency: 2 };
const rowFor = name => ({ canonical_source_ref: `src/routes/${name}`, source_revision: sourceRevision, workspace_revision: workspaceRevision });
const resultFor = row => ({ sourceRef: row.canonical_source_ref, sourceRevision: row.source_revision, workspaceRevision,
  status: 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED', indexingOutcome: 'DRY_RUN_VALIDATED_NOT_INDEXED', providerStatus: { ast: 'COMPLETED', nlp: 'COMPLETED' },
  canonicalAuthority: false, canonicalWritesCommitted: 0, receiptChecksum: 'fixture', receiptPath: '.tmp/fixture.json' });

function receiptFixture(row) {
  const body = { schema: 'atlas.indexed-source-provider-diagnostic.v1',
    source: { sourceRef: row.canonical_source_ref, sourceRevision: row.source_revision, exactByteSha256: row.source_revision, workspaceRevision },
    providers: { ast: { status: 'COMPLETED' }, nlp: { status: 'COMPLETED' } }, status: 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED',
    indexingOutcome: 'DRY_RUN_VALIDATED_NOT_INDEXED',
    canonicalAuthority: false, canonicalWritesAttempted: false, canonicalWritesCommitted: 0 };
  const receiptChecksum = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return { receipt: { ...body, receiptChecksum }, summary: { ...resultFor(row), receiptChecksum } };
}

test('batch inputs preserve exact case and repository prefix while rejecting traversal and unbounded work', () => {
  assert.equal(validateIndexedSourceBatchRequestV1(request).enableSvelteTypeScriptPlugin, false);
  assert.equal(validateExactIndexedSourcePathV1('sveltekit-frontend/src/routes/(app)/[id]/+Page.svelte'), 'sveltekit-frontend/src/routes/(app)/[id]/+Page.svelte');
  for (const directory of ['../src', '/src', 'C:/src', 'src//routes', 'src/./routes', 'src/../routes', 'src\\routes', 'https://example.com/src', 'src/#fragment']) {
    assert.throws(() => validateIndexedSourceBatchRequestV1({ ...request, directory }));
  }
  assert.throws(() => validateIndexedSourceBatchRequestV1({ ...request, workspaceRevision: '0' }));
  assert.throws(() => validateIndexedSourceBatchRequestV1({ ...request, limit: 17 }));
  assert.throws(() => validateIndexedSourceBatchRequestV1({ ...request, concurrency: 3 }));
  assert.throws(() => validateIndexedSourceBatchRequestV1({ ...request, enableSvelteTypeScriptPlugin: 'off' }));
  assert.throws(() => validateIndexedSourceBatchRequestV1({ ...request, afterSourceRef: 'src/other/file.ts' }));
});

test('provider skips, unavailable servers and missing revision passes cannot become completed diagnostics', () => {
  assert.equal(classifyIndexedSourceProviderResultV1({ status: 'SKIPPED_UNSUPPORTED_LANGUAGE' }), 'SKIPPED');
  assert.equal(classifyIndexedSourceProviderResultV1({ status: 'UNAVAILABLE_LANGUAGE_SERVER' }), 'FAILED_OR_UNAVAILABLE');
  assert.equal(classifyIndexedSourceProviderResultV1({ status: 'TIMEOUT' }), 'FAILED_OR_UNAVAILABLE');
  assert.equal(classifyIndexedSourceProviderResultV1({ status: 'STALE_SOURCE' }), 'FAILED_OR_UNAVAILABLE');
  assert.equal(classifyIndexedSourceProviderResultV1({ passCount: 0, exactRevisionPassCount: 0 }), 'PARTIAL');
  assert.equal(classifyIndexedSourceProviderResultV1({ passCount: 2, exactRevisionPassCount: 1 }), 'PARTIAL');
  assert.equal(classifyIndexedSourceProviderResultV1({ passCount: 2, exactRevisionPassCount: 2 }), 'COMPLETED');
});

test('bounded source workers overlap while preserving deterministic output and checksum', async () => {
  const sourceRows = ['z.ts', 'a.ts', 'm.ts', 'b.ts'].map(rowFor);
  let active = 0;
  let peak = 0;
  const analyzeSource = async row => {
    active++;
    peak = Math.max(peak, active);
    await new Promise(resolve => setImmediate(resolve));
    active--;
    return resultFor(row);
  };
  const first = await runIndexedSourceBatchV1({ ...request, sourceRows, analyzeSource });
  const second = await runIndexedSourceBatchV1({ ...request, sourceRows: [...sourceRows].reverse(), analyzeSource });
  assert.equal(peak, 2);
  assert.deepEqual(first.items.map(item => item.sourceRef), ['a.ts', 'b.ts', 'm.ts', 'z.ts'].map(name => `src/routes/${name}`));
  assert.equal(first.receiptChecksum, second.receiptChecksum);
  assert.equal(first.status, 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED');
  assert.equal(first.indexingOutcome, 'DRY_RUN_VALIDATED_NOT_INDEXED');
});

test('ambiguous bindings, missing revisions and invalid paths are excluded before dispatch', async () => {
  let calls = 0;
  const result = await runIndexedSourceBatchV1({ ...request,
    sourceRows: [rowFor('a.ts'), rowFor('a.ts'), { ...rowFor('b.ts'), source_revision: null }, rowFor('../escape.ts')],
    analyzeSource: async () => { calls++; throw new Error('MUST_NOT_RUN'); } });
  assert.equal(calls, 0);
  assert.equal(result.counts.EXCLUDED, 3);
  assert.equal(result.status, 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED');
  await assert.rejects(runIndexedSourceBatchV1({ ...request, sourceRows: [rowFor('file.ts'), { ...rowFor('bad.ts'), canonical_source_ref: 'src/routes-other/file.ts' }], analyzeSource: resultFor }));
});

test('unsupported extensions are excluded without invoking the provider', async () => {
  let calls = 0;
  const report = await runIndexedSourceBatchV1({ ...request,
    sourceRows: [rowFor('guide.md'), rowFor('summarize.ps1'), rowFor('analyze.mjs')],
    analyzeSource: async row => { calls++; return resultFor(row); } });
  assert.equal(calls, 1);
  assert.equal(report.items.find(item => item.sourceRef.endsWith('guide.md')).reason, 'INDEXED_SOURCE_LANGUAGE_UNSUPPORTED');
  assert.equal(report.items.find(item => item.sourceRef.endsWith('summarize.ps1')).reason, 'INDEXED_SOURCE_LANGUAGE_UNSUPPORTED');
  assert.equal(report.counts.EXCLUDED, 2);
});

test('provider errors, stale receipts and skipped providers remain visible without dropping successful peers', async () => {
  const report = await runIndexedSourceBatchV1({ ...request, sourceRows: ['a.ts', 'b.ts', 'c.ts', 'd.ts'].map(rowFor), analyzeSource: async row => {
    if (row.canonical_source_ref.endsWith('a.ts')) throw new Error('PROVIDER_TIMEOUT');
    if (row.canonical_source_ref.endsWith('b.ts')) return { ...resultFor(row), sourceRevision: `sha256:${'c'.repeat(64)}` };
    if (row.canonical_source_ref.endsWith('c.ts')) return { ...resultFor(row), providerStatus: { lsp: 'SKIPPED' } };
    return resultFor(row);
  } });
  assert.deepEqual(report.counts, { COMPLETED: 1, PARTIAL: 1, EXCLUDED: 0, FAILED: 2 });
  assert.equal(report.datastoreWritesPerformed, false);
});

test('empty and truncated scans have explicit statuses and never claim complete directory coverage', async () => {
  const empty = await runIndexedSourceBatchV1({ ...request, sourceRows: [], analyzeSource: resultFor });
  assert.equal(empty.status, 'NO_INDEXED_SOURCES');
  const bounded = await runIndexedSourceBatchV1({ ...request, limit: 1, sourceRows: ['a.ts', 'b.ts'].map(rowFor), analyzeSource: resultFor });
  assert.equal(bounded.truncated, true);
  assert.equal(bounded.items.length, 1);
  assert.equal(bounded.nextSourceRef, 'src/routes/a.ts');
  assert.equal(bounded.status, 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED');
  assert.equal(bounded.indexingOutcome, 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED');
  const resumed = await runIndexedSourceBatchV1({ ...request, afterSourceRef: bounded.nextSourceRef, sourceRows: [rowFor('b.ts')], analyzeSource: resultFor });
  assert.equal(resumed.items[0].sourceRef, 'src/routes/b.ts');
  assert.equal(resumed.nextSourceRef, null);
  await assert.rejects(runIndexedSourceBatchV1({ ...request, afterSourceRef: bounded.nextSourceRef, sourceRows: [rowFor('a.ts')], analyzeSource: resultFor }), /CURSOR_MISMATCH/);
});

test('directory driver passes the selected Svelte LSP profile after rolling back its bounded source SELECT', async () => {
  const statements = [];
  let released = false;
  let ended = false;
  const sourceRow = rowFor('file.ts');
  const fixture = receiptFixture(sourceRow);
  const result = await auditIndexedSourceDirectoryV1({ ...request, enableSvelteTypeScriptPlugin: false }, {
    loadEnvironment: () => ({ DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/fixture' }),
    createPool: () => ({ connect: async () => ({
      query: async (sql, parameters) => {
        statements.push({ sql, parameters });
        return { rows: sql.includes('SELECT b.canonical_source_ref') ? [sourceRow] : [] };
      }, release: () => { released = true; },
    }), end: async () => { ended = true; } }),
    executeFile: async (command, args, options) => {
      assert.equal(released && ended, true);
      assert.equal(statements.at(-1).sql, 'ROLLBACK');
      assert.equal(command, process.execPath);
      assert.deepEqual(args.slice(1, 3), [sourceRow.canonical_source_ref, workspaceRevision]);
      assert.ok(args.includes('--svelte-typescript-plugin=off'));
      assert.equal(options.shell, undefined);
      assert.equal(options.timeout, 200_000);
      return { stdout: JSON.stringify(fixture.summary) };
    },
    readReceipt: () => fixture.receipt,
  });
  assert.equal(statements[0].sql, 'BEGIN TRANSACTION READ ONLY');
  const selection = statements.find(item => item.sql.includes('SELECT b.canonical_source_ref'));
  assert.deepEqual(selection.parameters, [workspaceRevision, 'src/routes/', 5, null]);
  assert.match(selection.sql, /lower\(b\.canonical_source_ref\).*svelte/);
  assert.match(selection.sql, /GROUP BY b\.canonical_source_ref, b\.source_revision, b\.workspace_revision/);
  assert.equal(result.counts.COMPLETED, 1);
});

test('independent provider receipt readback rejects tampering and inconsistent summary identity', () => {
  const { receipt, summary } = receiptFixture(rowFor('file.ts'));
  assert.equal(verifyIndexedSourceProviderReceiptV1(receipt, summary), summary);
  assert.throws(() => verifyIndexedSourceProviderReceiptV1({ ...receipt, canonicalAuthority: true }, summary));
  assert.throws(() => verifyIndexedSourceProviderReceiptV1(receipt, { ...summary, workspaceRevision: `sha256:${'f'.repeat(64)}` }));
  assert.throws(() => verifyIndexedSourceProviderReceiptV1(receipt, { ...summary, providerStatus: { ast: 'SKIPPED' } }));
});

test('directory driver closes the pool when connection acquisition fails', async () => {
  let ended = false;
  await assert.rejects(auditIndexedSourceDirectoryV1(request, {
    loadEnvironment: () => ({ DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/fixture' }),
    createPool: () => ({ connect: async () => { throw new Error('DB_UNAVAILABLE'); }, end: async () => { ended = true; } }),
  }), /DB_UNAVAILABLE/);
  assert.equal(ended, true);
});

test('reusable successes require independent exact snapshot and provider readback', () => {
  const bytes = Buffer.from('exact source 😀');
  const row = { ...rowFor('file.ts'), source_revision: `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}` };
  const fixture = receiptFixture(row);
  const snapshot = `sha256:${'c'.repeat(64)}`;
  fixture.receipt.source.sourceReadMode = 'MATERIALIZED_ADMITTED_SNAPSHOT';
  fixture.receipt.source.materializedSnapshotRevision = snapshot;
  const { receiptChecksum, ...body } = fixture.receipt;
  const hash = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  fixture.receipt.receiptChecksum = hash;
  fixture.summary.receiptChecksum = hash;
  const result = verifyReusableIndexedSourceReceiptV1(fixture.receipt, fixture.summary, row, snapshot, bytes);
  assert.equal(result.observationMode, 'REUSED_VERIFIED_RECEIPT');
  assert.throws(() => verifyReusableIndexedSourceReceiptV1(fixture.receipt, fixture.summary, row, snapshot, Buffer.from('changed')));
  assert.throws(() => verifyReusableIndexedSourceReceiptV1(fixture.receipt, fixture.summary, row, workspaceRevision, bytes));
  assert.throws(() => verifyReusableIndexedSourceReceiptV1(fixture.receipt, { ...fixture.summary, providerStatus: { ast: 'TIMEOUT' } }, row, snapshot, bytes));
});

test('finite inventory uses the same selection in one repeatable-read read-only transaction', async () => {
  const statements = [];
  const rows = await readIndexedSourceDirectoryRowsV1(request, {
    loadEnvironment: () => ({ DATABASE_URL: 'postgresql://fixture:fixture@127.0.0.1/fixture' }),
    createPool: () => ({ connect: async () => ({ query: async (sql, parameters) => {
      statements.push({ sql, parameters });
      return { rows: sql.includes('SELECT b.canonical_source_ref')
        ? [rowFor('file.ts'), { ...rowFor('unmatched.ts'), graphify_file_match_count: 0 }] : [] };
    }, release() {} }), async end() {} }),
  }, true);
  assert.equal(rows.length, 2);
  assert.equal(statements[0].sql, 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
  assert.deepEqual(statements.find(item => item.parameters)?.parameters, [workspaceRevision, 'src/routes/', 100001, null]);
  assert.match(statements.find(item => item.parameters).sql, /LEFT JOIN graphify_files/);
  assert.equal(statements.at(-1).sql, 'ROLLBACK');
});
