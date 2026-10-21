import crypto from 'node:crypto';
import path from 'node:path';

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const ANALYZABLE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs', '.svelte']);

export function validateExactIndexedSourcePathV1(value) {
  if (typeof value !== 'string' || value.length > 500 || !value ||
      /[\\\u0000-\u001f\u007f?#]/u.test(value) || path.posix.isAbsolute(value) ||
      path.win32.isAbsolute(value) || /^[a-z][a-z0-9+.-]*:/i.test(value) ||
      value.split('/').some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error('INDEXED_SOURCE_PATH_INVALID');
  }
  return value;
}

export function validateIndexedSourceBatchRequestV1(input) {
  const { directory, workspaceRevision, limit = 8, concurrency = 2, afterSourceRef = null, enableSvelteTypeScriptPlugin = false } = input;
  validateExactIndexedSourcePathV1(directory);
  if (afterSourceRef !== null) {
    validateExactIndexedSourcePathV1(afterSourceRef);
    if (!afterSourceRef.startsWith(`${directory}/`)) throw new Error('INDEXED_SOURCE_BATCH_CURSOR_INVALID');
  }
  if (!SHA256.test(workspaceRevision ?? '')) throw new Error('INDEXED_SOURCE_BATCH_WORKSPACE_REQUIRED');
  if (!Number.isInteger(limit) || limit < 1 || limit > 16) throw new Error('INDEXED_SOURCE_BATCH_LIMIT_INVALID');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 2) throw new Error('INDEXED_SOURCE_BATCH_CONCURRENCY_INVALID');
  if (typeof enableSvelteTypeScriptPlugin !== 'boolean') throw new Error('INDEXED_SOURCE_BATCH_SVELTE_TYPESCRIPT_PLUGIN_INVALID');
  return { directory, workspaceRevision, limit, concurrency, afterSourceRef, enableSvelteTypeScriptPlugin };
}

export function classifyIndexedSourceProviderResultV1(result) {
  if (!result || typeof result !== 'object') return 'FAILED_OR_UNAVAILABLE';
  if (String(result.status ?? '').startsWith('SKIPPED')) return 'SKIPPED';
  if (['FAILED', 'UNAVAILABLE', 'TIMEOUT', 'ERROR', 'STALE', 'INVALID'].some(marker => String(result.status ?? '').includes(marker))) return 'FAILED_OR_UNAVAILABLE';
  if (typeof result.passCount === 'number' &&
      (result.passCount === 0 || result.exactRevisionPassCount !== result.passCount)) return 'PARTIAL';
  return 'COMPLETED';
}

export function verifyIndexedSourceProviderReceiptV1(receipt, summary) {
  const { receiptChecksum, ...body } = receipt;
  const checksum = crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  const providerStatus = Object.fromEntries(Object.entries(receipt.providers ?? {}).map(([name, provider]) => [name, provider.status]));
  if (receipt.schema !== 'atlas.indexed-source-provider-diagnostic.v1' || receiptChecksum !== checksum || summary.receiptChecksum !== checksum ||
      receipt.source?.sourceRef !== summary.sourceRef || receipt.source?.sourceRevision !== summary.sourceRevision ||
      receipt.source?.exactByteSha256 !== summary.sourceRevision || receipt.source?.workspaceRevision !== summary.workspaceRevision ||
      receipt.status !== summary.status || receipt.indexingOutcome !== summary.indexingOutcome ||
      JSON.stringify(providerStatus) !== JSON.stringify(summary.providerStatus) ||
      receipt.canonicalAuthority !== false || receipt.canonicalWritesAttempted !== false || receipt.canonicalWritesCommitted !== 0) {
    throw new Error('INDEXED_SOURCE_PROVIDER_RECEIPT_READBACK_MISMATCH');
  }
  return summary;
}

export function verifyReusableIndexedSourceReceiptV1(receipt, summary, row, snapshotRevision, sourceBytes) {
  verifyIndexedSourceProviderReceiptV1(receipt, summary);
  if (summary.status !== 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED' || summary.indexingOutcome !== 'DRY_RUN_VALIDATED_NOT_INDEXED' ||
      Object.values(summary.providerStatus).length === 0 || !Object.values(summary.providerStatus).every(status => status === 'COMPLETED') ||
      row.canonical_source_ref !== summary.sourceRef || row.source_revision !== summary.sourceRevision || row.workspace_revision !== summary.workspaceRevision ||
      !SHA256.test(snapshotRevision ?? '') || receipt.source.sourceReadMode !== 'MATERIALIZED_ADMITTED_SNAPSHOT' ||
      receipt.source.materializedSnapshotRevision !== snapshotRevision ||
      `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}` !== summary.sourceRevision) {
    throw new Error('INDEXED_SOURCE_REUSE_NOT_QUALIFIED');
  }
  return { ...summary, observationMode: 'REUSED_VERIFIED_RECEIPT' };
}

export async function runIndexedSourceBatchV1({ sourceRows, analyzeSource, ...input }) {
  const request = validateIndexedSourceBatchRequestV1(input);
  if (!Array.isArray(sourceRows) || sourceRows.length > request.limit + 1) throw new Error('INDEXED_SOURCE_BATCH_ROWS_UNBOUNDED');
  const grouped = new Map();
  for (const row of sourceRows) {
    const sourceRef = row.canonical_source_ref;
    if (typeof sourceRef !== 'string' || !sourceRef.startsWith(`${request.directory}/`)) throw new Error('INDEXED_SOURCE_BATCH_DIRECTORY_MISMATCH');
    if (request.afterSourceRef !== null && sourceRef <= request.afterSourceRef) throw new Error('INDEXED_SOURCE_BATCH_CURSOR_MISMATCH');
    grouped.set(sourceRef, [...(grouped.get(sourceRef) ?? []), row]);
  }
  const truncated = sourceRows.length > request.limit;
  const candidates = [...grouped.entries()].sort(([first], [second]) => first < second ? -1 : first > second ? 1 : 0).slice(0, request.limit);
  const items = new Array(candidates.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < candidates.length) {
      const index = cursor++;
      const [sourceRef, rows] = candidates[index];
      const row = rows[0];
      const item = { sourceRef, sourceRevision: row.source_revision ?? null, workspaceRevision: row.workspace_revision ?? null };
      try { validateExactIndexedSourcePathV1(sourceRef); }
      catch {
        items[index] = { ...item, status: 'EXCLUDED', reason: 'INDEXED_SOURCE_PATH_INVALID' };
        continue;
      }
      if (!ANALYZABLE_SOURCE_EXTENSIONS.has(path.posix.extname(sourceRef).toLowerCase())) {
        items[index] = { ...item, status: 'EXCLUDED', reason: 'INDEXED_SOURCE_LANGUAGE_UNSUPPORTED' };
        continue;
      }
      const bindingCount = Number(row.binding_count ?? rows.length);
      const graphifyFileMatchCount = Number(row.graphify_file_match_count ?? rows.length);
      if (rows.length !== 1 || bindingCount !== 1 || graphifyFileMatchCount !== 1) {
        items[index] = { sourceRef, sourceRevision: null, workspaceRevision: request.workspaceRevision,
          bindingCount, graphifyFileMatchCount, status: 'EXCLUDED', reason: 'AMBIGUOUS_INDEXED_SOURCE_BINDING' };
        continue;
      }
      if (!SHA256.test(row.source_revision ?? '') || row.workspace_revision !== request.workspaceRevision) {
        items[index] = { ...item, status: 'EXCLUDED', reason: 'SOURCE_LINEAGE_UNQUALIFIED' };
        continue;
      }
      try {
        const result = await analyzeSource(row);
        if (result.sourceRef !== sourceRef || result.sourceRevision !== row.source_revision || result.workspaceRevision !== request.workspaceRevision ||
            result.canonicalAuthority !== false || result.canonicalWritesCommitted !== 0) throw new Error('PROVIDER_RECEIPT_IDENTITY_OR_EFFECT_MISMATCH');
        const statuses = Object.values(result.providerStatus ?? {});
        const complete = result.indexingOutcome === 'DRY_RUN_VALIDATED_NOT_INDEXED' &&
          result.status === 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED' && statuses.length > 0 && statuses.every(status => status === 'COMPLETED');
        items[index] = { ...item, status: complete ? 'COMPLETED' : 'PARTIAL', providerStatus: result.providerStatus ?? {},
          receiptPath: result.receiptPath ?? null, receiptChecksum: result.receiptChecksum ?? null,
          observationMode: result.observationMode ?? 'FRESH_PROVIDER_EXECUTION' };
      } catch (error) {
        items[index] = { ...item, status: 'FAILED', reason: String(error?.message ?? error).slice(0, 400) };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(request.concurrency, candidates.length) }, worker));
  const counts = Object.fromEntries(['COMPLETED', 'PARTIAL', 'EXCLUDED', 'FAILED'].map(status => [status, items.filter(item => item.status === status).length]));
  const report = { schema: 'atlas.indexed-source-batch.v1', ...request, truncated, rowsRead: sourceRows.length,
    nextSourceRef: truncated ? candidates.at(-1)?.[0] ?? null : null,
    status: items.length === 0 ? 'NO_INDEXED_SOURCES' : !truncated && counts.COMPLETED === items.length ? 'DIAGNOSTIC_COMPLETE_NOT_ADMITTED' : 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED',
    indexingOutcome: items.length > 0 && !truncated && counts.COMPLETED === items.length
      ? 'DRY_RUN_VALIDATED_NOT_INDEXED' : 'PARTIAL_DIAGNOSTIC_NOT_ADMITTED',
    counts, items, canonicalAuthority: false, canonicalWritesCommitted: 0, datastoreWritesPerformed: false };
  return { ...report, receiptChecksum: `sha256:${crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex')}` };
}
