#!/usr/bin/env node
/**
 * Read-only reconciliation of a sealed large-corpus embedding export's
 * projection IDs against existing PostgreSQL ID bridges.
 *
 * A Qdrant point ID is only a projection locator here. This audit never
 * promotes it to canonical identity and never reads or writes vector data.
 *
 * Usage:
 *   node scripts/atlas/audit-large-corpus-qdrant-id-bridge-v1.mjs \
 *     --input=sveltekit-frontend/tmp/codebase_chunks_768-embeddings.ndjson \
 *     --output=docs/reports/<unique-report>.json
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: resolve(repoRoot, 'sveltekit-frontend/.env') });
dotenv.config({ path: resolve(repoRoot, 'sveltekit-frontend/.env.local'), override: true });

const args = new Map();
for (let i = 2; i < process.argv.length; i += 1) {
  if (!process.argv[i].startsWith('--')) continue;
  const [key, inline] = process.argv[i].slice(2).split('=', 2);
  const value = inline ?? process.argv[i + 1];
  if (inline === undefined && value && !value.startsWith('--')) i += 1;
  args.set(key, value ?? true);
}

const inputArg = args.get('input');
const outputArg = args.get('output');
if (typeof inputArg !== 'string' || !inputArg) throw new Error('EXPLICIT_INPUT_REQUIRED');
if (typeof outputArg !== 'string' || !outputArg) throw new Error('EXPLICIT_UNIQUE_OUTPUT_REQUIRED');
const inputPath = resolve(repoRoot, inputArg);
const outputPath = resolve(repoRoot, outputArg);

const dbConfig = {
  host: process.env.DB_HOST || process.env.PGHOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || process.env.PGPORT || 5434),
  database: process.env.DB_NAME || process.env.PGDATABASE || 'legal_ai_db',
  user: process.env.DB_USER || process.env.PGUSER || 'legal_admin',
  password: process.env.DB_PASSWORD || process.env.PGPASSWORD,
  connectionTimeoutMillis: 15000,
};
if (!dbConfig.password) throw new Error('POSTGRES_PASSWORD_NOT_CONFIGURED');

const ids = new Set();
const sourceRefsById = new Map();
const fileHash = createHash('sha256');
for await (const chunk of createReadStream(inputPath)) fileHash.update(chunk);
let inputRecords = 0;
let malformedRecords = 0;
let idsMissing = 0;
let sourceRefsMissing = 0;
for await (const line of createInterface({ input: createReadStream(inputPath), crlfDelay: Infinity })) {
  inputRecords += 1;
  let row;
  try { row = JSON.parse(line); } catch { malformedRecords += 1; continue; }
  const id = row?.id === null || row?.id === undefined ? '' : String(row.id).trim();
  if (!id) { idsMissing += 1; continue; }
  ids.add(id);
  const sourceRef = typeof row.source_ref === 'string' ? row.source_ref.trim() : '';
  if (!sourceRef) { sourceRefsMissing += 1; continue; }
  const refs = sourceRefsById.get(id) ?? new Set();
  refs.add(sourceRef);
  sourceRefsById.set(id, refs);
}
if (!inputRecords || malformedRecords) throw new Error(`INPUT_NDJSON_INVALID:${malformedRecords}/${inputRecords}`);

const idList = [...ids];
const prefixedIds = idList.map((id) => `qdrant:${id}`);
const pool = new pg.Pool(dbConfig);
const client = await pool.connect();
const byTable = {};
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  await client.query("SET LOCAL statement_timeout = '120s'");
  const schema = await client.query(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
  `, [['codebase_chunk_index', 'atlas_packets', 'code_retrieval_chunks']]);
  const columns = new Map();
  for (const row of schema.rows) {
    const set = columns.get(row.table_name) ?? new Set();
    set.add(row.column_name);
    columns.set(row.table_name, set);
  }

  const specs = [
    { table: 'codebase_chunk_index', column: 'qdrant_id', canonical: true },
    { table: 'atlas_packets', column: 'qdrant_point_id', canonical: true },
    { table: 'code_retrieval_chunks', column: 'qdrant_id', canonical: false, prefix: true },
  ];
  for (const spec of specs) {
    const tableColumns = columns.get(spec.table);
    if (!tableColumns?.has(spec.column)) {
      byTable[spec.table] = { available: false, matchRows: 0, matchedExportIds: 0, exactSourceRefRows: 0, duplicateMatchedIds: 0 };
      continue;
    }
    const predicates = spec.prefix
      ? `${spec.column}::text = ANY($2::text[]) OR ${spec.column}::text = ANY($1::text[])`
      : `${spec.column}::text = ANY($1::text[])`;
    const sourceRefExpr = tableColumns.has('source_ref')
      ? "NULLIF(btrim(source_ref::text), '')"
      : tableColumns.has('metadata')
        ? "NULLIF(btrim(metadata->>'source_ref'), '')"
        : 'NULL::text';
    const pathColumn = tableColumns.has('relative_path') ? 'relative_path'
      : tableColumns.has('file_path') ? 'file_path' : null;
    const pathExpr = pathColumn ? `NULLIF(btrim(${pathColumn}::text), '')` : 'NULL::text';
    const query = await client.query(`
      SELECT ${spec.column}::text AS projection_id,
             ${sourceRefExpr} AS source_ref,
             ${pathExpr} AS relative_path
      FROM public.${spec.table}
      WHERE ${predicates}
    `, spec.prefix ? [idList, prefixedIds] : [idList]);
    const matchedIds = new Set();
    const countsById = new Map();
    let exactSourceRefRows = 0;
    let rowsWithSourceRef = 0;
    let sourceRefMismatchRows = 0;
    let sourceRefUnavailableRows = 0;
    let exactPathRows = 0;
    let pathUnavailableRows = 0;
    for (const row of query.rows) {
      const rawId = String(row.projection_id ?? '').replace(/^qdrant:/, '');
      matchedIds.add(rawId);
      countsById.set(rawId, (countsById.get(rawId) ?? 0) + 1);
      if (!row.source_ref) sourceRefUnavailableRows += 1;
      else {
        rowsWithSourceRef += 1;
        if (sourceRefsById.get(rawId)?.has(String(row.source_ref).trim())) exactSourceRefRows += 1;
        else sourceRefMismatchRows += 1;
      }
      if (!row.relative_path) pathUnavailableRows += 1;
      else if (sourceRefsById.get(rawId)?.has(String(row.relative_path).trim())) exactPathRows += 1;
    }
    byTable[spec.table] = {
      available: true,
      canonicalLocatorTable: spec.canonical,
      projectionIdColumn: spec.column,
      acceptedPrefixForm: spec.prefix ? 'qdrant:<point-id>' : 'raw-point-id',
      matchRows: query.rowCount,
      matchedExportIds: matchedIds.size,
      rowsWithSourceRef,
      exactSourceRefRows,
      sourceRefMismatchRows,
      sourceRefUnavailableRows,
      comparedPathColumn: pathColumn,
      exactPathRows,
      pathUnavailableRows,
      duplicateMatchedIds: [...countsById.values()].filter((count) => count > 1).length,
      identityWarning: 'Projection ID equality is locator evidence only; it does not prove canonical identity, current source revision, content hash, or vector-byte parity.',
    };
  }
  await client.query('ROLLBACK');

  const report = {
    schema: 'atlas.large-corpus-qdrant-id-bridge-audit.v1',
    generatedAt: new Date().toISOString(),
    mode: 'LOCAL_NDJSON_STREAM_PLUS_POSTGRES_REPEATABLE_READ_READ_ONLY',
    input: {
      path: relative(repoRoot, inputPath),
      sha256: fileHash.digest('hex'),
      records: inputRecords,
      distinctProjectionIds: ids.size,
      distinctIdSourceRefPairs: [...sourceRefsById.values()].reduce((sum, refs) => sum + refs.size, 0),
      malformedRecords,
      missingProjectionIds: idsMissing,
      missingSourceRefs: sourceRefsMissing,
    },
    postgresProjectionBridges: byTable,
    decision: 'LOCATOR_CENSUS_ONLY_NO_CANONICAL_ADMISSION',
    safeguards: {
      qdrantPointIdIsCanonicalIdentity: false,
      sourceRefEqualityAloneProvesRevision: false,
      vectorsFetched: false,
      inferenceCalls: 0,
      postgresWrites: 0,
      qdrantWrites: 0,
      valkeyWrites: 0,
      graphWrites: 0,
    },
  };
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({
    status: report.decision,
    inputRecords,
    distinctProjectionIds: ids.size,
    postgresProjectionBridges: Object.fromEntries(Object.entries(byTable).map(([table, result]) => [table, {
      available: result.available,
      matchedExportIds: result.matchedExportIds,
      exactSourceRefRows: result.exactSourceRefRows,
      duplicateMatchedIds: result.duplicateMatchedIds,
    }])),
    reportPath: relative(repoRoot, outputPath),
  }, null, 2));
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}
