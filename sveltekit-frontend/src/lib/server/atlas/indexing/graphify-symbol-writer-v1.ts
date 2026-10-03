import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  proveGraphifySymbolProjectionPreflightV1,
  type GraphifySymbolProjectionPreflightInputV1,
} from './graphify-symbol-projection-preflight-v1.js';
import type {
  GraphifySymbolProjectionBatchV1,
  GraphifySymbolProjectionCandidateV1,
} from './graphify-symbol-projection-v1.js';

export const GRAPHIFY_SYMBOL_WRITER_V1 = 'atlas.graphify-symbol-writer.2026-09-13.v1' as const;

const nonEmpty = z.string().min(1);
const uuid = z.string().uuid();
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);

export interface GraphifySymbolWriterSqlClientV1 {
  query: (text: string, values?: readonly unknown[]) => Promise<{
    rowCount: number | null;
    rows: Array<Record<string, unknown>>;
  }>;
}

export const graphifySymbolWriterReceiptV1Schema = z.object({
  schema: z.literal('atlas.graphify-symbol-writer-receipt.v1'),
  workspaceId: uuid,
  workspaceRevision: nonEmpty,
  sourceRef: nonEmpty,
  sourceRevision: nonEmpty,
  fileId: uuid,
  runId: uuid,
  executionId: uuid,
  symbolCandidateCount: z.number().int().nonnegative(),
  symbolInsertedCount: z.number().int().nonnegative(),
  symbolExistingIdenticalCount: z.number().int().nonnegative(),
  readbackVerified: z.literal(true),
  writesPerformed: z.literal(true),
  canonicalAuthority: z.literal(false),
  preflightReceiptChecksum: sha256,
  projectionBatchChecksum: sha256,
  symbolReadbackChecksum: sha256,
  producerRevision: z.literal(GRAPHIFY_SYMBOL_WRITER_V1),
}).strict();

export type GraphifySymbolWriterReceiptV1 = z.infer<typeof graphifySymbolWriterReceiptV1Schema>;

export type GraphifySymbolWriterInputV1 = GraphifySymbolProjectionPreflightInputV1 & {
  client: GraphifySymbolWriterSqlClientV1;
};

type PersistedSymbolReadbackV1 = {
  symbolId: string;
  fileId: string;
  stableSymbolKey: string;
  symbolKind: string;
  qualifiedName: string | null;
  parentSymbolId: string | null;
  startByte: string;
  endByte: string;
  startRow: number;
  endRow: number;
  signatureText: string | null;
  sourceTextHash: string;
  astFingerprint: string;
  metadata: Record<string, unknown>;
};

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

function normalizeDigest(value: unknown): string {
  const raw = String(value ?? '').trim().toLowerCase();
  const match = /^(?:sha256:)?([a-f0-9]{64})$/.exec(raw);
  if (!match) throw new Error(`GRAPHIFY_SYMBOL_WRITER_DIGEST_INVALID:${raw}`);
  return match[1]!;
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function parseMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  }
  throw new Error('GRAPHIFY_SYMBOL_METADATA_READBACK_INVALID');
}

function metadataFor(
  batch: GraphifySymbolProjectionBatchV1,
  symbol: GraphifySymbolProjectionCandidateV1,
): Record<string, unknown> {
  return {
    schema: 'atlas.graphify-symbol-projection-metadata.v1',
    workspaceRevision: batch.workspaceRevision,
    sourceRef: normalizeSourceRef(batch.sourceRef),
    sourceRevision: batch.sourceRevision,
    upstreamNodeId: symbol.upstreamNodeId,
    upstreamSymbolId: symbol.upstreamSymbolId ?? null,
    upstreamChunkId: symbol.upstreamChunkId,
    extractorRevision: symbol.extractorRevision,
    mapperRevision: batch.mapperRevision,
  };
}

function topologicalSymbols(batch: GraphifySymbolProjectionBatchV1): GraphifySymbolProjectionCandidateV1[] {
  if (batch.symbols.length === 0) throw new Error('GRAPHIFY_SYMBOL_WRITER_EMPTY_BATCH');

  const byKey = new Map(batch.symbols.map((symbol) => [symbol.stableSymbolKey, symbol] as const));
  const state = new Map<string, 'VISITING' | 'DONE'>();
  const ordered: GraphifySymbolProjectionCandidateV1[] = [];

  const visit = (key: string): void => {
    const current = state.get(key);
    if (current === 'DONE') return;
    if (current === 'VISITING') throw new Error(`GRAPHIFY_SYMBOL_PARENT_CYCLE:${key}`);

    const symbol = byKey.get(key);
    if (!symbol) throw new Error(`GRAPHIFY_SYMBOL_PARENT_NOT_IN_BATCH:${key}`);
    state.set(key, 'VISITING');

    if (symbol.parentStableSymbolKey) {
      if (!byKey.has(symbol.parentStableSymbolKey)) {
        throw new Error(`GRAPHIFY_SYMBOL_PARENT_NOT_IN_BATCH:${symbol.parentStableSymbolKey}`);
      }
      visit(symbol.parentStableSymbolKey);
    }

    state.set(key, 'DONE');
    ordered.push(symbol);
  };

  for (const symbol of batch.symbols) visit(symbol.stableSymbolKey);
  return ordered;
}

async function verifyFileBindingAtWriteTime(input: GraphifySymbolWriterInputV1, runId: string): Promise<void> {
  const result = await input.client.query(
    `SELECT file_id, workspace_id, workspace_revision, source_ref, content_hash,
            code_source_revision, byte_length, last_seen_run_id
       FROM public.graphify_files
      WHERE file_id = $1
      FOR SHARE`,
    [input.batch.fileId],
  );

  if (result.rowCount !== 1 || !result.rows[0]) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_BINDING_READBACK_FAILED');
  }

  const row = result.rows[0];
  const expectedBinding = input.sourceBinding;
  if (String(row.file_id) !== input.batch.fileId || String(row.workspace_id) !== input.batch.workspaceId) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_IDENTITY_MISMATCH');
  }
  if (String(row.workspace_revision) !== input.batch.workspaceRevision) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_WORKSPACE_REVISION_MISMATCH');
  }
  if (normalizeSourceRef(String(row.source_ref)) !== normalizeSourceRef(input.batch.sourceRef)) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_SOURCE_REF_MISMATCH');
  }
  if (String(row.code_source_revision) !== input.batch.sourceRevision) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_SOURCE_REVISION_MISMATCH');
  }
  if (normalizeDigest(row.content_hash) !== expectedBinding.contentDigest) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_CONTENT_DIGEST_MISMATCH');
  }
  if (Number(row.byte_length) !== expectedBinding.byteLength) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_BYTE_LENGTH_MISMATCH');
  }
  if (String(row.last_seen_run_id) !== runId) {
    throw new Error('GRAPHIFY_SYMBOL_FILE_RUN_BINDING_MISMATCH');
  }
}

function normalizePersistedSymbol(row: Record<string, unknown>): PersistedSymbolReadbackV1 {
  return {
    symbolId: uuid.parse(row.symbol_id),
    fileId: uuid.parse(row.file_id),
    stableSymbolKey: nonEmpty.parse(row.stable_symbol_key),
    symbolKind: nonEmpty.parse(row.symbol_kind),
    qualifiedName: row.qualified_name === null || row.qualified_name === undefined ? null : String(row.qualified_name),
    parentSymbolId: row.parent_symbol_id === null || row.parent_symbol_id === undefined ? null : uuid.parse(row.parent_symbol_id),
    startByte: BigInt(String(row.start_byte)).toString(),
    endByte: BigInt(String(row.end_byte)).toString(),
    startRow: Number(row.start_row),
    endRow: Number(row.end_row),
    signatureText: row.signature_text === null || row.signature_text === undefined ? null : String(row.signature_text),
    sourceTextHash: nonEmpty.parse(row.source_text_hash),
    astFingerprint: nonEmpty.parse(row.ast_fingerprint),
    metadata: parseMetadata(row.metadata),
  };
}

function assertPersistedSymbolMatches(input: {
  batch: GraphifySymbolProjectionBatchV1;
  symbol: GraphifySymbolProjectionCandidateV1;
  parentSymbolId: string | null;
  row: PersistedSymbolReadbackV1;
}): void {
  const { batch, symbol, parentSymbolId, row } = input;
  const expectedMetadata = metadataFor(batch, symbol);
  const mismatch =
    row.fileId !== symbol.fileId
    || row.stableSymbolKey !== symbol.stableSymbolKey
    || row.symbolKind !== symbol.symbolKind
    || row.qualifiedName !== symbol.qualifiedName
    || row.parentSymbolId !== parentSymbolId
    || row.startByte !== BigInt(symbol.startByte).toString()
    || row.endByte !== BigInt(symbol.endByte).toString()
    || row.startRow !== symbol.startRow
    || row.endRow !== symbol.endRow
    || row.signatureText !== (symbol.signatureText ?? null)
    || row.sourceTextHash !== symbol.sourceTextHash
    || row.astFingerprint !== symbol.astFingerprint
    || stable(row.metadata) !== stable(expectedMetadata);

  if (mismatch) {
    throw new Error(`GRAPHIFY_SYMBOL_EXISTING_ROW_CONFLICT:${symbol.stableSymbolKey}`);
  }
}

async function insertAndReadbackSymbol(input: {
  client: GraphifySymbolWriterSqlClientV1;
  batch: GraphifySymbolProjectionBatchV1;
  symbol: GraphifySymbolProjectionCandidateV1;
  parentSymbolId: string | null;
}): Promise<{ inserted: boolean; row: PersistedSymbolReadbackV1 }> {
  const metadata = metadataFor(input.batch, input.symbol);
  const insert = await input.client.query(
    `INSERT INTO public.graphify_symbols (
       file_id, stable_symbol_key, symbol_kind, qualified_name, parent_symbol_id,
       start_byte, end_byte, start_row, end_row, signature_text,
       source_text_hash, ast_fingerprint, metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     ON CONFLICT (file_id, stable_symbol_key) DO NOTHING
     RETURNING symbol_id, file_id, stable_symbol_key, symbol_kind, qualified_name,
               parent_symbol_id, start_byte, end_byte, start_row, end_row,
               signature_text, source_text_hash, ast_fingerprint, metadata`,
    [
      input.symbol.fileId,
      input.symbol.stableSymbolKey,
      input.symbol.symbolKind,
      input.symbol.qualifiedName,
      input.parentSymbolId,
      input.symbol.startByte,
      input.symbol.endByte,
      input.symbol.startRow,
      input.symbol.endRow,
      input.symbol.signatureText ?? null,
      input.symbol.sourceTextHash,
      input.symbol.astFingerprint,
      JSON.stringify(metadata),
    ],
  );

  if (insert.rowCount !== 0 && insert.rowCount !== 1) {
    throw new Error(`GRAPHIFY_SYMBOL_INSERT_CARDINALITY_INVALID:${input.symbol.stableSymbolKey}`);
  }

  const readback = await input.client.query(
    `SELECT symbol_id, file_id, stable_symbol_key, symbol_kind, qualified_name,
            parent_symbol_id, start_byte, end_byte, start_row, end_row,
            signature_text, source_text_hash, ast_fingerprint, metadata
       FROM public.graphify_symbols
      WHERE file_id = $1 AND stable_symbol_key = $2`,
    [input.symbol.fileId, input.symbol.stableSymbolKey],
  );

  if (readback.rowCount !== 1 || !readback.rows[0]) {
    throw new Error(`GRAPHIFY_SYMBOL_INDEPENDENT_READBACK_FAILED:${input.symbol.stableSymbolKey}`);
  }

  const row = normalizePersistedSymbol(readback.rows[0]);
  assertPersistedSymbolMatches({ ...input, row });
  return { inserted: insert.rowCount === 1, row };
}

/**
 * GSP-4 symbol-only persistence owner. The caller must already be inside a
 * transaction. GSP-5 owns edge persistence because graphify_edges currently has
 * no deterministic unique arbiter and therefore cannot yet support safe replay.
 */
export async function writeGraphifySymbolsInTransactionV1(
  input: GraphifySymbolWriterInputV1,
): Promise<GraphifySymbolWriterReceiptV1> {
  const preflight = proveGraphifySymbolProjectionPreflightV1(input);
  if (preflight.status !== 'READY' || !preflight.readyForWriter || !preflight.writerMayBeAttempted) {
    throw new Error(`GRAPHIFY_SYMBOL_WRITER_PREFLIGHT_BLOCKED:${preflight.status}`);
  }
  if (!preflight.runId || !preflight.executionId) {
    throw new Error('GRAPHIFY_SYMBOL_WRITER_PREFLIGHT_OWNER_IDS_MISSING');
  }

  await verifyFileBindingAtWriteTime(input, preflight.runId);

  const ordered = topologicalSymbols(input.batch);
  const symbolIds = new Map<string, string>();
  const readbackRows: PersistedSymbolReadbackV1[] = [];
  let symbolInsertedCount = 0;
  let symbolExistingIdenticalCount = 0;

  for (const symbol of ordered) {
    const parentSymbolId = symbol.parentStableSymbolKey
      ? symbolIds.get(symbol.parentStableSymbolKey) ?? null
      : null;
    if (symbol.parentStableSymbolKey && !parentSymbolId) {
      throw new Error(`GRAPHIFY_SYMBOL_PARENT_ID_UNRESOLVED:${symbol.parentStableSymbolKey}`);
    }

    const result = await insertAndReadbackSymbol({
      client: input.client,
      batch: input.batch,
      symbol,
      parentSymbolId,
    });
    symbolIds.set(symbol.stableSymbolKey, result.row.symbolId);
    readbackRows.push(result.row);
    if (result.inserted) symbolInsertedCount += 1;
    else symbolExistingIdenticalCount += 1;
  }

  const symbolReadbackChecksum = digest(
    [...readbackRows].sort((a, b) => a.stableSymbolKey.localeCompare(b.stableSymbolKey)),
  );

  return graphifySymbolWriterReceiptV1Schema.parse({
    schema: 'atlas.graphify-symbol-writer-receipt.v1',
    workspaceId: input.batch.workspaceId,
    workspaceRevision: input.batch.workspaceRevision,
    sourceRef: normalizeSourceRef(input.batch.sourceRef),
    sourceRevision: input.batch.sourceRevision,
    fileId: input.batch.fileId,
    runId: preflight.runId,
    executionId: preflight.executionId,
    symbolCandidateCount: input.batch.symbols.length,
    symbolInsertedCount,
    symbolExistingIdenticalCount,
    readbackVerified: true,
    writesPerformed: true,
    canonicalAuthority: false,
    preflightReceiptChecksum: preflight.receiptChecksum,
    projectionBatchChecksum: input.batch.inputChecksum,
    symbolReadbackChecksum,
    producerRevision: GRAPHIFY_SYMBOL_WRITER_V1,
  });
}

/** Owns BEGIN/COMMIT/ROLLBACK for isolated canary/tests. */
export async function writeGraphifySymbolsV1(
  input: GraphifySymbolWriterInputV1,
): Promise<GraphifySymbolWriterReceiptV1> {
  await input.client.query('BEGIN');
  try {
    const receipt = await writeGraphifySymbolsInTransactionV1(input);
    await input.client.query('COMMIT');
    return receipt;
  } catch (error) {
    try { await input.client.query('ROLLBACK'); } catch {}
    throw error;
  }
}
