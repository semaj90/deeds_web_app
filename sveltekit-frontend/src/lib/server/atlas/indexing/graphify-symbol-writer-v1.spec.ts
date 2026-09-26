import { describe, expect, it } from 'vitest';
import { compileStructuralExtractionFabric } from '@deeds/parent-atlas';
import { mapStructuralFabricToGraphifyProjectionV1 } from './graphify-symbol-projection-v1.js';
import type { GraphifySymbolProjectionPreflightInputV1 } from './graphify-symbol-projection-preflight-v1.js';
import {
  writeGraphifySymbolsInTransactionV1,
  writeGraphifySymbolsV1,
  type GraphifySymbolWriterSqlClientV1,
} from './graphify-symbol-writer-v1.js';

const workspaceId = '625743d2-092b-4fa8-abe0-9dc094920c80';
const fileId = '11111111-1111-4111-8111-111111111111';
const runId = '22222222-2222-4222-8222-222222222222';
const executionId = '33333333-3333-4333-8333-333333333333';
const sourceRef = 'src/lib/example.ts';
const workspaceRevision = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const sourceRevision = 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const contentDigest = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';

function buildBatch() {
  const fabric = compileStructuralExtractionFabric({
    schema: 'atlas.structural-extraction-input.v1',
    source_ref: sourceRef,
    source_revision: sourceRevision,
    workspace_revision: workspaceRevision,
    language: 'typescript',
    chunker_revision: 'treesitter-chunker:test',
    ast_grep_revision: 'ast-grep:test',
    langextract_revision: 'langextract:test',
    chunks: [
      {
        upstream_node_id: 'node-parent',
        upstream_file_id: 'file-native',
        upstream_symbol_id: 'symbol-parent',
        upstream_chunk_id: 'chunk-parent',
        source_ref: sourceRef,
        language: 'typescript',
        node_type: 'class_declaration',
        kind: 'class',
        symbol_name: 'Example',
        parent_route: ['module'],
        parent_context: 'module',
        byte_start: 0,
        byte_end: 90,
        start_line: 0,
        end_line: 4,
        content_hash: 'c'.repeat(64),
        calls: [], imports: [], exports: ['Example'],
      },
      {
        upstream_node_id: 'node-method',
        upstream_file_id: 'file-native',
        upstream_symbol_id: 'symbol-method',
        upstream_chunk_id: 'chunk-method',
        source_ref: sourceRef,
        language: 'typescript',
        node_type: 'method_definition',
        kind: 'method',
        symbol_name: 'run',
        parent_route: ['module', 'Example'],
        parent_context: 'Example',
        byte_start: 24,
        byte_end: 82,
        start_line: 1,
        end_line: 3,
        content_hash: 'd'.repeat(64),
        calls: [], imports: [], exports: [],
      },
    ],
    xref_edges: [], lsp_observations: [], ast_grep_observations: [], langextract_observations: [], diagnostics: [],
  }, { producer_revision: 'fabric:test' });

  return mapStructuralFabricToGraphifyProjectionV1({
    workspaceId,
    fileId,
    workspaceRevision,
    sourceRef,
    sourceRevision,
    fabric,
    nativeCoordinatesByUpstreamNodeId: {
      'node-parent': { upstreamNodeId: 'node-parent', startByte: 0, endByte: 90, startRow: 0, endRow: 4, astFingerprint: 'e'.repeat(64) },
      'node-method': { upstreamNodeId: 'node-method', startByte: 24, endByte: 82, startRow: 1, endRow: 3, astFingerprint: 'f'.repeat(64) },
    },
    referenceEvidenceByReferenceId: {},
    parentStableSymbolKeyByNominationId: {
      [`treesitter-chunker:node-parent:${sourceRevision}`]: null,
      [`treesitter-chunker:node-method:${sourceRevision}`]: 'upstream-symbol:symbol-parent',
    },
  });
}

function preflightInput(): Omit<GraphifySymbolProjectionPreflightInputV1, 'batch'> {
  return {
    admittedWorkspaceRevision: workspaceRevision,
    runOwner: {
      expectedWorkspaceRevision: workspaceRevision,
      runId,
      executionId,
      workspaceId,
      runWorkspaceRevision: workspaceRevision,
      runCompleted: true,
      terminalExecutionBound: true,
      canonicalAuthority: true,
      workspaceForeignRowExists: true,
      sourceManifestBound: true,
      readbackVerified: true,
      coordinatorCompletedStageCount: 10,
    },
    sourceBinding: {
      fileId,
      workspaceId,
      workspaceRevision,
      sourceRef,
      sourceRevision,
      contentDigest,
      byteLength: 100,
      readbackVerified: true,
    },
    structuralReceipt: {
      sourceRef,
      sourceRevision,
      sourceRevisionAuthority: 'PROVEN',
      workspaceRevision,
      status: 'COMPILED_NATIVE',
      providerStatus: 'PROVEN',
      provenanceStatus: 'NATIVE_READY',
      strictNativeMode: true,
      canonicalPromotionMayBeAttempted: true,
      compatibilityNodeIdCount: 0,
      compatibilityFileIdCount: 0,
      compatibilityChunkIdCount: 0,
      canonicalIdentityCreated: false,
    },
  };
}

type RowStore = Map<string, Record<string, unknown>>;

function fakeClient(options: { conflictKey?: string; staleFile?: boolean } = {}): GraphifySymbolWriterSqlClientV1 & { queries: string[]; rows: RowStore } {
  const queries: string[] = [];
  const rows: RowStore = new Map();
  let idCounter = 0;
  return {
    queries,
    rows,
    async query(text, values = []) {
      queries.push(text);
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rowCount: null, rows: [] };
      if (text.includes('FROM public.graphify_files') && text.includes('FOR SHARE')) {
        return { rowCount: 1, rows: [{
          file_id: fileId,
          workspace_id: workspaceId,
          workspace_revision: options.staleFile ? 'sha256:' + '9'.repeat(64) : workspaceRevision,
          source_ref: sourceRef,
          content_hash: contentDigest,
          code_source_revision: sourceRevision,
          byte_length: 100,
          last_seen_run_id: runId,
        }] };
      }
      if (text.includes('INSERT INTO public.graphify_symbols')) {
        const key = String(values[1]);
        const existing = rows.get(key);
        if (existing) return { rowCount: 0, rows: [] };
        idCounter += 1;
        const symbolId = idCounter === 1 ? '44444444-4444-4444-8444-444444444444' : '55555555-5555-4555-8555-555555555555';
        const row: Record<string, unknown> = {
          symbol_id: symbolId,
          file_id: values[0], stable_symbol_key: values[1], symbol_kind: values[2], qualified_name: values[3],
          parent_symbol_id: values[4], start_byte: values[5], end_byte: values[6], start_row: values[7], end_row: values[8],
          signature_text: values[9], source_text_hash: values[10], ast_fingerprint: values[11], metadata: JSON.parse(String(values[12])),
        };
        if (options.conflictKey === key) row.symbol_kind = 'conflicting-kind';
        rows.set(key, row);
        return { rowCount: 1, rows: [row] };
      }
      if (text.includes('FROM public.graphify_symbols')) {
        const row = rows.get(String(values[1]));
        return row ? { rowCount: 1, rows: [row] } : { rowCount: 0, rows: [] };
      }
      throw new Error(`unexpected query: ${text}`);
    },
  };
}

function input(client: GraphifySymbolWriterSqlClientV1, batch = buildBatch()) {
  return { client, batch, ...preflightInput() };
}

describe('Graphify symbol writer v1', () => {
  it('writes parents before children and returns a verified symbol receipt', async () => {
    const client = fakeClient();
    const receipt = await writeGraphifySymbolsInTransactionV1(input(client));
    expect(receipt.symbolCandidateCount).toBe(2);
    expect(receipt.symbolInsertedCount).toBe(2);
    expect(receipt.symbolExistingIdenticalCount).toBe(0);
    expect(receipt.readbackVerified).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(client.queries[0]).toContain('FOR SHARE');
    const rows = [...client.rows.values()];
    const parent = rows.find((row) => row.stable_symbol_key === 'upstream-symbol:symbol-parent');
    const child = rows.find((row) => row.stable_symbol_key === 'upstream-symbol:symbol-method');
    expect(child?.parent_symbol_id).toBe(parent?.symbol_id);
  });

  it('is logically idempotent: an identical replay inserts zero new rows and verifies both existing rows', async () => {
    const client = fakeClient();
    const first = await writeGraphifySymbolsInTransactionV1(input(client));
    const second = await writeGraphifySymbolsInTransactionV1(input(client));
    expect(first.symbolInsertedCount).toBe(2);
    expect(second.symbolInsertedCount).toBe(0);
    expect(second.symbolExistingIdenticalCount).toBe(2);
    expect(second.symbolReadbackChecksum).toBe(first.symbolReadbackChecksum);
  });

  it('fails closed if an existing unique-key row has different structural payload', async () => {
    const client = fakeClient({ conflictKey: 'upstream-symbol:symbol-parent' });
    await expect(writeGraphifySymbolsInTransactionV1(input(client)))
      .rejects.toThrow('GRAPHIFY_SYMBOL_EXISTING_ROW_CONFLICT:upstream-symbol:symbol-parent');
  });

  it('rechecks graphify_files at write time and rejects stale workspace binding', async () => {
    const client = fakeClient({ staleFile: true });
    await expect(writeGraphifySymbolsInTransactionV1(input(client)))
      .rejects.toThrow('GRAPHIFY_SYMBOL_FILE_WORKSPACE_REVISION_MISMATCH');
    expect(client.queries.some((query) => query.includes('INSERT INTO public.graphify_symbols'))).toBe(false);
  });

  it('fails before SQL symbol inserts when a child parent is absent from the batch', async () => {
    const client = fakeClient();
    const batch = buildBatch();
    const childOnly = { ...batch, symbols: batch.symbols.filter((symbol) => symbol.parentStableSymbolKey) };
    await expect(writeGraphifySymbolsInTransactionV1(input(client, childOnly)))
      .rejects.toThrow('GRAPHIFY_SYMBOL_PARENT_NOT_IN_BATCH');
  });

  it('the transaction-owning wrapper rolls back on a write/readback conflict', async () => {
    const client = fakeClient({ conflictKey: 'upstream-symbol:symbol-parent' });
    await expect(writeGraphifySymbolsV1(input(client))).rejects.toThrow('GRAPHIFY_SYMBOL_EXISTING_ROW_CONFLICT');
    expect(client.queries[0]).toBe('BEGIN');
    expect(client.queries.at(-1)).toBe('ROLLBACK');
    expect(client.queries).not.toContain('COMMIT');
  });
});
