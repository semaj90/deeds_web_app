#!/usr/bin/env node
/**
 * Parent Atlas PG18 recommendation readiness inventory (v1).
 * Query-only, no schema changes, no table writes, no index build, no GPU calls.
 * Designed for scripts/atlas/ and the existing connection-config.mjs owner.
 * JSON receipts are written only with explicit --out, exclusive-create.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const INSPECTED_TABLES = Object.freeze([
  'codebase_chunk_index', 'atlas_representations', 'atlas_domain_ontology',
  'atlas_feature_map', 'kanban_tasks', 'gpu_cluster_centroids',
  'atlas_artifacts', 'atlas_concept_tie_v2', 'feature_registry_vectors',
]);

const EXPECTED_CORE = ['codebase_chunk_index','atlas_representations','atlas_domain_ontology','atlas_feature_map','kanban_tasks'];
const digest = (bytes) => 'sha256:' + createHash('sha256').update(bytes).digest('hex');
const allowedIoNames = ['io_method', 'io_workers','io_max_concurrency','effective_io_concurrency','maintenance_io_concurrency'];

/** Query a *single* dedicated connection for one repeatable-read snapshot. */
export async function inspectPg18ReadinessV1(connection, { projectionEvidence = null } = {}) {
  if (!connection || typeof connection.query !== 'function') throw new TypeError('QUERYABLE_REQUIRED');
  const seenSql = [];
  let begun = false;
  let failed = null;
  try {
    await connection.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    begun = true;
    const query = async (sql, params = []) => {
      if (!/^\s*SELECT\b/i.test(sql)) throw new Error('AUDIT_ONLY_SELECT_ALLOWED');
      seenSql.push(sql);
      const result = await connection.query(sql, params);
      if (!Array.isArray(result?.rows)) throw new Error('BAD_QUERY_RESULT');
      return result.rows;
    };
    const versions = await query('SELECT current_setting(\'server_version\') AS postgres_version, current_database() AS database_name');
    const settings = await query('SELECT name, setting, unit, source FROM pg_settings WHERE name = ANY($1::text[]) ORDER BY name', [allowedIoNames]);
    const extension = await query("SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'");
    const columns = await query(`SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`, [INSPECTED_TABLES]);
    const indexes = await query(`SELECT t.relname AS tablename, i.relname AS indexname,
      am.amname AS access_method, ix.indisvalid AS is_valid, ix.indisready AS is_ready,
      pg_get_indexdef(i.oid) AS indexdef
      FROM pg_index ix JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      JOIN pg_am am ON am.oid = i.relam
      WHERE n.nspname = 'public' AND t.relname = ANY($1::text[])
      ORDER BY t.relname, i.relname`, [INSPECTED_TABLES]);
    const hasTable = new Set(columns.map(r => String(r.table_name)));
    const canonicalColumn = columns.some(r=>r.table_name==='codebase_chunk_index'&&r.column_name==='content_embedding_768'&&r.udt_name==='vector');
    const canonicalHnsw = indexes.filter(r=>r.tablename==='codebase_chunk_index' && r.access_method==='hnsw' && r.is_valid===true && r.is_ready===true && /\bcontent_embedding_768\b/.test(r.indexdef??'') && /\bvector_cosine_ops\b/.test(r.indexdef??''));
    const aio = Object.fromEntries(settings.map(r => [r.name, {setting:r.setting,unit:r.unit??null,source:r.source??null}]));
    const missingTables = EXPECTED_CORE.filter(t=>!hasTable.has(t));
    const prereqs = {
      postgres18MajorVersion: /^18(?:\.|$)/.test(String(versions[0]?.postgres_version ?? '')),
      coreTablesPresent: missingTables.length===0,
      vectorExtensionPresent: extension.length===1,
      canonical768VectorColumnPresent: canonicalColumn,
      validCanonicalHnswPresent: canonicalHnsw.length>0,
    };
    return {
      schema:'atlas.pg18-recommendation-readiness-audit.v1',
      mode:'READ_ONLY',
      postgresVersion:versions[0]?.postgres_version??null,
      databaseName:versions[0]?.database_name??null,
      aio, pgvectorExtensionVersion:extension[0]?.extversion??null,
      tablesObserved:[...hasTable].sort(), missingCoreTables:missingTables,
      optionalTablesAbsent:INSPECTED_TABLES.filter(t=>!hasTable.has(t)&&!EXPECTED_CORE.includes(t)),
      canonicalHnswIndexes:canonicalHnsw.map(x=>({indexname:x.indexname,indexdef:x.indexdef})),
      indexes:indexes.map(x=>({table:x.tablename,index:x.indexname,method:x.access_method,valid:x.is_valid,ready:x.is_ready,definition:x.indexdef})),
      predicates:prereqs,
      postgresSchemaStatus:Object.values(prereqs).every(Boolean)?'SCHEMA_READY_FOR_READ_ONLY_BENCHMARK':'SCHEMA_INCOMPLETE',
      projectionAdmission: projectionEvidence?.overall_verdict ?? 'UNVERIFIED',
      projectionEvidenceChecksum:projectionEvidence?.sha256 ?? null,
      // This structural audit cannot prove 11 lineage/semantic predicates.
      canonicalProjectionSafe:false,
      gpuProjectionAuthorized:false,
      canonicalAuthority:false, writesPerformed:false,
      queryCount:seenSql.length,
      limitations:[
        'Index availability is not exact-vs-HNSW recall parity.',
        'This audit does not prove per-row source, ordinal, semantic, or graph projection lineage.',
        'No CUDA, CAGRA, KMeans, or GPU computation was executed.',
      ],
    };
  } catch (error) {
    failed = error;
    throw error;
  } finally {
    if (begun) {
      try { await connection.query('ROLLBACK'); }
      catch (rollbackError) { if (!failed) throw rollbackError; }
    }
  }
}

function argValue(name) {
  const flag = `--${name}=`;
  return process.argv.slice(2).find(s=>s.startsWith(flag))?.slice(flag.length)??null;
}

async function main() {
  // Dynamic imports prevent database connections and .env reads at module import.
  const { default: pg } = await import('pg');
  const { loadRepoEnv, resolveDatabaseUrl } = await import('./connection-config.mjs');
  const { connectionString } = {connectionString: resolveDatabaseUrl(loadRepoEnv(process.env))};
  const pool = new pg.Pool({connectionString,max:1,connectionTimeoutMillis:5000});
  let evidence=null;
  const reportFile = argValue('projection-report');
  if (reportFile) {
    const bytes=await readFile(reportFile);
    const doc=JSON.parse(bytes.toString('utf8'));
    evidence={overall_verdict:doc.overall_verdict,sha256:digest(bytes)};
  }
  let c;
  try {
    c=await pool.connect();
    const report=await inspectPg18ReadinessV1(c,{projectionEvidence:evidence});
    const encoded=JSON.stringify(report,null,2)+'\n';
    const out=argValue('out');
    if (out) {
      await mkdir(path.dirname(out),{recursive:true});
      await writeFile(out,encoded,{flag:'wx'});
    }
    process.stdout.write(encoded);
  } finally { c?.release(); await pool.end(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error=>{
    console.error(JSON.stringify({status:'FAILED',reason:error?.code??'ERROR', message: String(error?.message??error).replace(/postgres(?:ql)?:\/\/[^\s]+/ig,'postgresql://[REDACTED]')}));
    process.exitCode=1;
  });
}
