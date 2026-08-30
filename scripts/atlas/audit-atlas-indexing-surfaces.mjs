#!/usr/bin/env node
/**
 * Read-only audit of the Parent Atlas indexing surfaces.
 * Checks AST/symbol coverage, Postgres 18/pgvector indexes, Qdrant mirrors,
 * and Drizzle/ast-grep wiring. It performs no writes or migrations.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const frontendRoot = join(repoRoot, 'sveltekit-frontend');
const reportPath = join(repoRoot, 'docs/reports/atlas-indexing-surfaces-v1.json');
const env = loadRepoEnv();
const qdrantUrl = String(env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/\/$/, '');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 2,
  connectionTimeoutMillis: 5000,
  statement_timeout: 10000,
});

const report = {
  schema: 'atlas.indexing-surfaces.v1',
  generatedAt: new Date().toISOString(),
  readOnly: true,
  canonicalAuthority: 'postgres',
  ast: {},
  postgres: {},
  qdrant: {},
  drizzle: {},
  findings: [],
};

function finding(id, severity, message, evidence = []) {
  report.findings.push({ id, severity, message, evidence });
}

function countMatches(text, pattern) {
  return [...text.matchAll(pattern)].length;
}

async function query(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function tableExists(tableName) {
  const rows = await query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`],
  );
  return Boolean(rows[0]?.exists);
}

async function tableCount(tableName, where = '') {
  if (!await tableExists(tableName)) return { exists: false, count: null };
  const rows = await query(`SELECT count(*)::bigint AS count FROM public."${tableName}" ${where}`);
  return { exists: true, count: Number(rows[0]?.count ?? 0) };
}

async function auditAst() {
  const backfillPath = join(repoRoot, 'scripts/atlas/backfill-ast-symbols.mjs');
  const extractionPaths = [
    join(repoRoot, 'scripts/atlas/phase1-ast-grep-extraction.mjs'),
    join(frontendRoot, 'scripts/atlas/phase1-ast-grep-extraction.mjs'),
    join(frontendRoot, 'scripts/atlas/phase1.5-ast-grep-extraction.mjs'),
  ].filter(existsSync);
  const backfillText = readFileSync(backfillPath, 'utf8');
  const extractionText = extractionPaths.map((file) => readFileSync(file, 'utf8')).join('\n');
  const packageText = readFileSync(join(frontendRoot, 'package.json'), 'utf8');
  let napiAvailable = false;
  try {
    execFileSync(process.execPath, ['-e', "import('@ast-grep/napi').then(() => process.exit(0)).catch(() => process.exit(1))"], {
      cwd: frontendRoot,
      stdio: 'ignore',
      timeout: 10000,
    });
    napiAvailable = true;
  } catch {
    napiAvailable = false;
  }
  report.ast = {
    dependencyDeclared: packageText.includes('@ast-grep/napi'),
    napiAvailable,
    extractionScripts: extractionPaths.map((file) => file.slice(repoRoot.length + 1)),
    activeBackfill: 'scripts/atlas/backfill-ast-symbols.mjs',
    activeBackfillUsesAstGrep: /@ast-grep\/napi/.test(backfillText) && /parse\(/.test(backfillText),
    activeBackfillRegexMatchers: countMatches(backfillText, /\.match\(/g),
    extractionRegexFallbackReferences: countMatches(extractionText, /regex fallback|extractSymbolsViaRegex/gi),
    supportedSymbolKinds: ['function', 'class', 'method', 'variable', 'interface', 'enum', 'import', 'export'],
  };
  if (!report.ast.napiAvailable) finding('AST_GREP_RUNTIME_MISSING', 'high', 'The @ast-grep/napi runtime is not importable from the frontend workspace.');
  if (!report.ast.activeBackfillUsesAstGrep) finding('AST_BACKFILL_REGEX_ONLY', 'high', 'The active AST symbol backfill uses line regexes instead of an AST parser.', ['scripts/atlas/backfill-ast-symbols.mjs']);
  if (report.ast.extractionRegexFallbackReferences > 0) finding('AST_EXTRACTION_FALLBACK_PRESENT', 'medium', 'An AST extraction path still advertises or uses regex fallback.', report.ast.extractionScripts);
}

async function auditPostgres() {
  try {
    const version = await query('SELECT current_setting(\'server_version\') AS version');
    const extensions = await query("SELECT extname, extversion FROM pg_extension WHERE extname IN ('vector', 'pg_search', 'pg_trgm') ORDER BY extname");
    const extension = extensions.find((row) => row.extname === 'vector');
    const tables = {};
    const columns = {};
    for (const table of [
      'atlas_packets', 'codebase_chunk_index', 'atlas_packet_features', 'atlas_ast_nodes',
      'atlas_symbol_registry', 'atlas_symbol_versions',
      'atlas_structural_reference_resolutions', 'atlas_observation_feature_rows',
    ]) {
      tables[table] = await tableCount(table);
      if (tables[table].exists) {
        const columnRows = await query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1
          ORDER BY ordinal_position
        `, [table]);
        columns[table] = columnRows.map((row) => row.column_name);
      } else columns[table] = [];
    }

    const populated = {};
    if (tables.codebase_chunk_index.exists) {
      const codeColumns = new Set(columns.codebase_chunk_index);
      const vectorColumn = ['content_embedding', 'content_embedding_768', 'embedding', 'summary_embedding', 'signature_embedding'].find((name) => codeColumns.has(name));
      const searchColumn = ['search_vector', 'bm25_search_vector'].find((name) => codeColumns.has(name));
      const qdrantColumn = ['qdrant_id', 'qdrant_point_id'].find((name) => codeColumns.has(name));
      populated.codebaseChunkEmbeddingColumn = vectorColumn ?? null;
      populated.codebaseChunkSearchColumn = searchColumn ?? null;
      populated.codebaseChunkQdrantColumn = qdrantColumn ?? null;
      if (vectorColumn) populated.codebaseChunkEmbeddings = await tableCount('codebase_chunk_index', `WHERE "${vectorColumn}" IS NOT NULL`);
      if (searchColumn) populated.codebaseChunkSearchVectors = await tableCount('codebase_chunk_index', `WHERE "${searchColumn}" IS NOT NULL`);
      if (qdrantColumn) populated.codebaseChunkQdrantIds = await tableCount('codebase_chunk_index', `WHERE "${qdrantColumn}" IS NOT NULL`);
      for (const column of ['content_embedding', 'content_embedding_768', 'content_embedding_384', 'summary_embedding', 'signature_embedding', 'search_vector']) {
        if (codeColumns.has(column)) {
          populated[`codebaseChunk_${column}`] = await tableCount('codebase_chunk_index', `WHERE "${column}" IS NOT NULL`);
        }
      }
    }
    if (tables.atlas_packet_features.exists) {
      populated.packetAstSymbols = await tableCount('atlas_packet_features', 'WHERE COALESCE(cardinality(ast_symbols), 0) > 0');
    }
    if (tables.atlas_packets?.exists) {
      populated.atlasPacketsSemantic768 = await tableCount('atlas_packets', 'WHERE embedding IS NOT NULL');
    }
    if (tables.atlas_ast_nodes.exists) populated.astNodesWithSymbols = await tableCount('atlas_ast_nodes', "WHERE COALESCE(qualified_symbol, '') <> ''");
    if (tables.atlas_symbol_registry.exists) populated.symbolRegistryActive = await tableCount('atlas_symbol_registry', "WHERE status = 'active'");

    const indexes = await query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND (indexdef ILIKE '%hnsw%' OR indexdef ILIKE '%gin%' OR indexdef ILIKE '%search_vector%')
      ORDER BY tablename, indexname
    `);
    const bitmapTables = await query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name ILIKE '%bitmap%'
      ORDER BY table_name
    `);
    const proposedBitmapProjection = await tableExists('atlas_file_search_index_v1');
    const proposedConceptLinks = await tableExists('atlas_file_search_concept_links_v1');
    const pgSearch = extensions.find((row) => row.extname === 'pg_search');
    report.postgres = {
      reachable: true,
      serverVersion: version[0]?.version ?? null,
      extensions: Object.fromEntries(extensions.map((row) => [row.extname, row.extversion])),
      vectorExtension: extension?.extversion ?? null,
      lexicalOwner: pgSearch ? 'UNVERIFIED_PG_SEARCH_AVAILABLE' : 'POSTGRES_FTS_TSVECTOR_GIN_TS_RANK_CD',
      denseOwner: 'POSTGRES_CODEBASE_CHUNK_INDEX_CONTENT_EMBEDDING_HALFvec_768_ACTIVE_LANE',
      canonicalDenseRepresentation: 'semantic_768',
      canonicalDenseColumn: tables.codebase_chunk_index.exists && columns.codebase_chunk_index.includes('content_embedding')
        ? 'codebase_chunk_index.content_embedding'
        : 'UNAVAILABLE',
      proposedSearchProjection: {
        table: 'atlas_file_search_index_v1',
        applied: proposedBitmapProjection,
        conceptLinksApplied: proposedConceptLinks,
        writesPerformedByAudit: false,
      },
      tables,
      columns,
      populated,
      bitmapTables: bitmapTables.map((row) => row.table_name),
      relevantIndexes: indexes.map((row) => ({ table: row.tablename, name: row.indexname, definition: row.indexdef })),
    };
    if (!extension) finding('PGVECTOR_EXTENSION_MISSING', 'high', 'The live PostgreSQL database does not report the vector extension.');
    if (!tables.atlas_symbol_registry.exists) finding('SYMBOL_REGISTRY_TABLE_MISSING', 'high', 'The stable cross-revision symbol registry migration has not been applied to the live database.');
    if (!tables.atlas_observation_feature_rows.exists) finding('FEATURE_ROW_TABLE_MISSING', 'high', 'The revisioned observation feature-row table has not been applied to the live database.');
    if (tables.atlas_ast_nodes.exists && !populated.astNodesWithSymbols?.count) finding('AST_NODE_SYMBOL_COVERAGE_EMPTY', 'high', 'atlas_ast_nodes exists but has no populated qualified symbols.');
    if (tables.atlas_symbol_registry.exists && !populated.symbolRegistryActive?.count) finding('SYMBOL_REGISTRY_EMPTY', 'high', 'The stable symbol registry exists but has no active symbols.');
    if (tables.codebase_chunk_index.exists && !populated.codebaseChunkSearchVectors?.count) finding('BM25_VECTOR_EMPTY', 'high', 'codebase_chunk_index exists but has no populated search_vector rows.');
    if (tables.codebase_chunk_index.exists && populated.codebaseChunk_content_embedding?.count === 0) finding('POSTGRES_CANONICAL_EMBEDDING_EMPTY', 'high', 'The canonical 768-dimensional Postgres embedding column is present but empty; Qdrant is populated independently.', ['codebase_chunk_index.content_embedding', 'codebase_chunks_768_v2']);
    if (tables.codebase_chunk_index.exists && populated.codebaseChunk_content_embedding?.count > 0 && populated.codebaseChunk_content_embedding.count < tables.codebase_chunk_index.count) {
      finding('POSTGRES_CANONICAL_EMBEDDING_PARTIAL', 'high', 'The canonical semantic_768 column is only partially populated; the active halfvec(768) lane must not be promoted as a substitute without a representation receipt.', [`${populated.codebaseChunk_content_embedding.count}/${tables.codebase_chunk_index.count}`, 'codebase_chunk_index.content_embedding']);
    }
    // BitmapAnd/BitmapOr are PostgreSQL planner strategies, not a required
    // schema object. Keep the inventory for diagnostics, but do not report an
    // absent table as an architecture failure.
    if (tables.atlas_packet_features.exists && populated.packetAstSymbols?.count < tables.atlas_packet_features.count * 0.5) {
      finding('PACKET_AST_SYMBOL_COVERAGE_LOW', 'medium', 'Fewer than half of atlas_packet_features rows have AST symbols.', [`${populated.packetAstSymbols.count}/${tables.atlas_packet_features.count}`]);
    }
  } catch (error) {
    report.postgres = { reachable: false, error: String(error.message ?? error) };
    finding('POSTGRES_UNAVAILABLE', 'high', 'The read-only indexing audit could not connect to PostgreSQL.');
  }
}

async function auditQdrant() {
  try {
    const response = await fetch(`${qdrantUrl}/collections`, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    const collections = [];
    for (const item of payload.result?.collections ?? []) {
      const name = item.name;
      const infoResponse = await fetch(`${qdrantUrl}/collections/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(10000) });
      const info = infoResponse.ok ? await infoResponse.json() : {};
      collections.push({
        name,
        vectors: info.result?.config?.params?.vectors ?? null,
        points: info.result?.points_count ?? null,
        indexedVectors: info.result?.indexed_vectors_count ?? null,
        status: info.result?.status ?? null,
      });
    }
    report.qdrant = { reachable: true, url: qdrantUrl, collections };
    const canonical = collections.find((item) => item.name === 'codebase_chunks_768');
    if (!canonical) finding('QDRANT_CANONICAL_COLLECTION_MISSING', 'high', 'The canonical codebase_chunks_768 collection is not advertised by Qdrant.');
    else if (canonical.points === 0) finding('QDRANT_CANONICAL_COLLECTION_EMPTY', 'high', 'The canonical Qdrant collection exists but contains no points.');
  } catch (error) {
    report.qdrant = { reachable: false, url: qdrantUrl, error: String(error.message ?? error) };
    finding('QDRANT_UNAVAILABLE', 'high', 'The read-only indexing audit could not reach Qdrant.');
  }
}

async function auditDrizzle() {
  const journalPath = join(frontendRoot, 'drizzle/meta/_journal.json');
  const manualDir = join(frontendRoot, 'drizzle/manual');
  const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, 'utf8')) : { entries: [] };
  const manualFiles = existsSync(manualDir)
    ? (await import('node:fs')).readdirSync(manualDir).filter((file) => file.endsWith('.sql'))
    : [];
  const sidecarPath = join(frontendRoot, 'drizzle/sidecar-migrations.json');
  const sidecars = existsSync(sidecarPath) ? JSON.parse(readFileSync(sidecarPath, 'utf8')) : [];
  const journalNames = new Set((journal.entries ?? []).map((entry) => entry.tag));
  const sidecarEntries = Array.isArray(sidecars) ? sidecars : sidecars.sidecars ?? sidecars.migrations ?? [];
  const sidecarNames = new Set(sidecarEntries.map((entry) => String(entry.file ?? entry.name ?? entry.path ?? entry)));
  const untrackedManual = manualFiles.filter((file) => !sidecarNames.has(file) && !journalNames.has(file));
  report.drizzle = { journalEntries: journal.entries?.length ?? 0, manualSqlFiles: manualFiles.length, declaredSidecars: sidecarNames.size, untrackedManualFiles: untrackedManual.slice(0, 50) };
  if (untrackedManual.length) finding('DRIZZLE_SIDECAR_DECLARATION_GAP', 'medium', 'Manual SQL files are not visibly declared in the Drizzle sidecar manifest.', untrackedManual.slice(0, 20));
}

await auditAst();
await auditPostgres();
await auditQdrant();
await auditDrizzle();
await pool.end();

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, findings: report.findings, report }, null, 2));
