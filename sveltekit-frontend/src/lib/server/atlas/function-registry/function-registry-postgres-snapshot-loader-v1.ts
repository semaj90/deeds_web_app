import { realpath, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { FunctionRegistryReadPortsV1 } from './function-registry-read-adapter-v1.js';
import {
  createQualifiedFunctionRegistryRetrieverV1,
  type FunctionRegistrySearchCandidateV1,
} from './function-registry-retriever-v1.js';
import {
  createFunctionRegistrySnapshotLoaderV1,
  type FunctionSnapshotLoadRequestV1,
  type FunctionSnapshotLoadResultV1,
} from './function-registry-snapshot-loader-v1.js';

type QueryResult<Row> = { rows: Row[] };
type ReadOnlyClientV1 = {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
};

type SymbolRowV1 = {
  symbol_version_id: string;
  stable_symbol_id: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  qualified_name: string;
  signature_normalized: string | null;
  producer_revision: string;
  packet_key: string | null;
  upstream_node_id: string;
  byte_start: number | string;
  byte_end: number | string;
};

type BindingRowV1 = {
  repo_id: string;
  ast_repo_id: string | null;
  canonical_source_ref: string;
  source_revision: string;
  workspace_revision: string;
  content_digest: string;
};

type AstRowV1 = {
  tree_node_id: string;
  relative_path: string;
  node_kind: string;
  qualified_symbol: string;
  parser_language: string;
  normalized_signature: string;
  start_byte: number | string | null;
  end_byte: number | string | null;
  source_content_hash: string;
  source_revision: string | null;
  repo_id: string;
  parser_name: string;
  parser_version: string | null;
  grammar_version: string | null;
  ast_path: string[] | null;
};

function parseSafeInteger(value: number | string | null): number | null {
  const parsed = typeof value === 'number' ? value : value === null ? NaN : Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function sha256(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function normalizedAstRelativePath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^sveltekit-frontend\//, '');
}

function sourcePath(repoRoot: string, sourceRef: string): string | null {
  if (!sourceRef || path.isAbsolute(sourceRef) || sourceRef.includes('\0')) return null;
  const normalized = sourceRef.replaceAll('\\', '/');
  if (normalized.split('/').some((part) => part === '..' || part === '')) return null;
  const root = path.resolve(repoRoot);
  const resolved = path.resolve(root, normalized);
  return resolved.startsWith(`${root}${path.sep}`) ? resolved : null;
}

export async function readFunctionRegistrySourceBytesV1(
  repoRoot: string,
  sourceRef: string,
  sourceRevision: string,
): Promise<Uint8Array | null> {
  const candidate = sourcePath(repoRoot, sourceRef);
  if (!candidate) return null;
  try {
    const [rootReal, fileReal] = await Promise.all([realpath(repoRoot), realpath(candidate)]);
    if (!fileReal.startsWith(`${rootReal}${path.sep}`)) return null;
    if ((await stat(fileReal)).size > 16 * 1024 * 1024) return null;
    const bytes = await readFile(fileReal);
    if (bytes.byteLength > 16 * 1024 * 1024) return null;
    const expected = sourceRevision.replace(/^sha256:/i, '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(expected) || sha256(bytes) !== expected) return null;
    return bytes;
  } catch {
    return null;
  }
}

export function createFunctionRegistryPostgresReadPortsV1(
  client: ReadOnlyClientV1,
  repoRoot: string,
): FunctionRegistryReadPortsV1 {
  return {
    async getSymbolVersion(symbolVersionId) {
      const rows = (await client.query<SymbolRowV1>(`
        SELECT symbol_version_id, stable_symbol_id, source_ref, source_revision,
          workspace_revision, qualified_name, signature_normalized, producer_revision,
          packet_key, upstream_node_id, byte_start, byte_end
        FROM public.atlas_symbol_versions
        WHERE symbol_version_id = $1
        LIMIT 2
      `, [symbolVersionId])).rows;
      const row = rows.length === 1 ? rows[0] : null;
      if (!row) return null;
      const byteStart = parseSafeInteger(row.byte_start);
      const byteEnd = parseSafeInteger(row.byte_end);
      if (byteStart === null || byteEnd === null) return null;
      return {
        symbolVersionId: row.symbol_version_id,
        stableSymbolId: row.stable_symbol_id,
        sourceRef: row.source_ref,
        sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision,
        qualifiedName: row.qualified_name,
        signatureNormalized: row.signature_normalized,
        producerRevision: row.producer_revision,
        packetKey: row.packet_key,
        byteStart,
        byteEnd,
        upstreamNodeId: row.upstream_node_id,
      } as Awaited<ReturnType<FunctionRegistryReadPortsV1['getSymbolVersion']>>;
    },
    async getSymbolRegistry(stableSymbolId) {
      const rows = (await client.query<{ stable_symbol_id: string; registry_revision: string; status: string }>(`
        SELECT stable_symbol_id, registry_revision, status
        FROM public.atlas_symbol_registry
        WHERE stable_symbol_id = $1
        LIMIT 2
      `, [stableSymbolId])).rows;
      return rows.length === 1
        ? { stableSymbolId: rows[0].stable_symbol_id, registryRevision: rows[0].registry_revision, status: rows[0].status }
        : null;
    },
    async getPackets(packetKey) {
      const rows = (await client.query<{ packet_key: string; source_ref: string; source_revision: string; workspace_revision_key: string }>(`
        SELECT packet_key, source_ref, source_revision, workspace_revision_key
        FROM public.atlas_packets
        WHERE packet_key = $1
        LIMIT 3
      `, [packetKey])).rows;
      return rows.map((row) => ({ packetKey: row.packet_key, sourceRef: row.source_ref, sourceRevision: row.source_revision, workspaceRevisionKey: row.workspace_revision_key }));
    },
    async getWorkspaceSourceBindings(sourceRef, sourceRevision, workspaceRevision) {
      const rows = (await client.query<BindingRowV1>(`
        SELECT b.repo_id, cr.repo_id::text AS ast_repo_id,
          b.canonical_source_ref, b.source_revision, b.workspace_revision, b.content_digest
        FROM public.atlas_workspace_source_bindings b
        LEFT JOIN public.code_repos cr ON cr.name = b.repo_id
        WHERE b.canonical_source_ref = $1
          AND b.source_revision = $2 AND b.workspace_revision = $3
        LIMIT 3
      `, [sourceRef, sourceRevision, workspaceRevision])).rows;
      return rows.map((row) => ({
        repoId: row.repo_id,
        astRepoId: row.ast_repo_id,
        canonicalSourceRef: row.canonical_source_ref,
        sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision,
        contentDigest: row.content_digest,
      }));
    },
    async readSourceBytes(sourceRef, sourceRevision) {
      return readFunctionRegistrySourceBytesV1(repoRoot, sourceRef, sourceRevision);
    },
    async getAstCandidates(symbol, binding, sourceBytes) {
      if (!binding.astRepoId || !sourceBytes.byteLength) return [];
      const rows = (await client.query<AstRowV1>(`
        WITH RECURSIVE candidates AS MATERIALIZED (
          SELECT n.tree_node_id, n.parent_tree_node_id, n.node_kind, n.qualified_symbol,
            n.repo_id, n.relative_path, n.source_revision, n.source_content_hash,
            n.parser_language, n.normalized_signature, n.start_byte, n.end_byte,
            n.parser_name, n.parser_version, n.grammar_version
          FROM public.atlas_ast_nodes n
          WHERE n.repo_id = $1 AND n.relative_path = $2
            AND n.source_revision = $3 AND n.source_content_hash IN ($4, $5)
            AND n.qualified_symbol = $6 AND n.start_byte = $7 AND n.end_byte = $8
          LIMIT 2
        ), ancestry AS (
          SELECT c.tree_node_id AS candidate_tree_node_id, c.tree_node_id,
            c.parent_tree_node_id, c.node_kind, c.qualified_symbol, c.repo_id,
            c.relative_path, c.source_revision, c.source_content_hash, 0 AS depth,
            ARRAY[c.tree_node_id]::text[] AS visited
          FROM candidates c
          UNION ALL
          SELECT a.candidate_tree_node_id, p.tree_node_id, p.parent_tree_node_id,
            p.node_kind, p.qualified_symbol, p.repo_id, p.relative_path,
            p.source_revision, p.source_content_hash, a.depth + 1,
            a.visited || p.tree_node_id
          FROM ancestry a
          JOIN public.atlas_ast_nodes p ON p.tree_node_id = a.parent_tree_node_id
          WHERE a.depth < 63 AND NOT p.tree_node_id = ANY(a.visited)
            AND p.repo_id = a.repo_id AND p.relative_path = a.relative_path
            AND p.source_revision = a.source_revision AND p.source_content_hash = a.source_content_hash
        ), path_rows AS (
          SELECT CASE WHEN bool_or(parent_tree_node_id IS NULL)
            THEN array_agg(node_kind || ':' || qualified_symbol ORDER BY depth DESC)
            ELSE NULL END AS ast_path,
            candidate_tree_node_id
          FROM ancestry
          GROUP BY candidate_tree_node_id
        )
        SELECT c.tree_node_id, c.relative_path, c.node_kind, c.qualified_symbol,
          c.parser_language, c.normalized_signature, c.start_byte, c.end_byte,
          c.source_content_hash, c.source_revision, c.repo_id, c.parser_name,
          c.parser_version, c.grammar_version, p.ast_path
        FROM candidates c
        JOIN path_rows p USING (candidate_tree_node_id)
        ORDER BY c.tree_node_id
      `, [
        binding.repoId,
        normalizedAstRelativePath(symbol.sourceRef),
        symbol.sourceRevision,
        `sha256:${sha256(sourceBytes)}`,
        sha256(sourceBytes),
        symbol.qualifiedName,
        symbol.byteStart,
        symbol.byteEnd,
      ])).rows;
      return rows.map((row) => {
        const startByte = parseSafeInteger(row.start_byte);
        const endByte = parseSafeInteger(row.end_byte);
        const declarationText = startByte !== null && endByte !== null && endByte <= sourceBytes.byteLength
          ? new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes.subarray(startByte, endByte))
          : '';
        const node = {
          treeNodeId: row.tree_node_id,
          relativePath: row.relative_path,
          nodeKind: row.node_kind,
          qualifiedSymbol: row.qualified_symbol,
          parserLanguage: row.parser_language,
          normalizedSignature: row.normalized_signature,
          startByte,
          endByte,
          sourceContentHash: row.source_content_hash,
          sourceRevision: row.source_revision,
          sourceRefKey: null,
          repoId: row.repo_id,
          parserName: row.parser_name,
          parserVersion: row.parser_version,
          grammarVersion: row.grammar_version,
        };
        return {
          node,
          astPath: Array.isArray(row.ast_path) ? row.ast_path.join('/') : '',
          signature: row.normalized_signature,
          declarationText,
          parserRevision: [row.parser_name, row.parser_version, row.grammar_version].filter(Boolean).join('@'),
        };
      }) as Awaited<ReturnType<FunctionRegistryReadPortsV1['getAstCandidates']>>;
    },
  };
}

export async function loadFunctionRegistrySnapshotFromPostgresV1(input: {
  request: FunctionSnapshotLoadRequestV1;
  repoRoot: string;
}): Promise<FunctionSnapshotLoadResultV1> {
  const [{ pool }, root] = await Promise.all([
    import('$lib/server/db/client.js'),
    realpath(input.repoRoot),
  ]);
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '12000ms'");
    const loader = createFunctionRegistrySnapshotLoaderV1({ ports: createFunctionRegistryPostgresReadPortsV1(client, root) });
    return await loader.loadQualified(input.request);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

export async function discoverFunctionRegistryCandidatesFromPostgresV1(input: {
  query: string;
  workspaceRevision: string;
  limit: number;
}): Promise<FunctionRegistrySearchCandidateV1[]> {
  const { pool } = await import('$lib/server/db/client.js');
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    await client.query("SET LOCAL statement_timeout = '12000ms'");
    return await queryCallableSearchProjectionInReadOnlyTransactionV1(client, input);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

export async function queryCallableSearchProjectionInReadOnlyTransactionV1(
  client: ReadOnlyClientV1,
  input: { query: string; workspaceRevision: string; limit: number },
): Promise<FunctionRegistrySearchCandidateV1[]> {
  const query = input.query.trim();
  if (!query || !input.workspaceRevision || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 64) return [];
  const result = await client.query<{ symbol_version_id: string; source_revision: string }>(`
      WITH query_terms AS (
        SELECT plainto_tsquery('simple', $1) AS tsquery
      )
      SELECT c.symbol_version_id, c.source_revision
      FROM public.atlas_callable_search c
      CROSS JOIN query_terms q
      WHERE c.workspace_revision = $2
        AND (
          c.qualified_name = $1
          OR (numnode(q.tsquery) > 0 AND c.search_vector @@ q.tsquery)
        )
      ORDER BY
        CASE WHEN c.qualified_name = $1 THEN 0 ELSE 1 END,
        CASE WHEN numnode(q.tsquery) > 0 THEN ts_rank_cd(c.search_vector, q.tsquery, 32) ELSE 0 END DESC,
        c.symbol_version_id ASC
      LIMIT $3
    `, [query, input.workspaceRevision, input.limit]);
  return result.rows
    .filter((row) => typeof row.symbol_version_id === 'string' && row.symbol_version_id.length > 0
      && typeof row.source_revision === 'string' && row.source_revision.length > 0)
    .map((row) => ({ symbolVersionId: row.symbol_version_id, sourceRevision: row.source_revision }));
}

export function createPostgresFunctionRegistryRetrieverV1(input: {
  repoRoot: string;
  expectedWorkspaceRevision: string;
  maxCandidates?: number;
}): ReturnType<typeof createQualifiedFunctionRegistryRetrieverV1> {
  return createQualifiedFunctionRegistryRetrieverV1({
    expectedWorkspaceRevision: input.expectedWorkspaceRevision,
    maxCandidates: input.maxCandidates,
    discoverCandidates: (request) => discoverFunctionRegistryCandidatesFromPostgresV1({
      query: request.query,
      workspaceRevision: request.expectedWorkspaceRevision,
      limit: Math.min(request.limit, input.maxCandidates ?? 32, 64),
    }),
    loader: {
      loadQualified: (request) => loadFunctionRegistrySnapshotFromPostgresV1({
        request,
        repoRoot: input.repoRoot,
      }),
    },
  });
}
