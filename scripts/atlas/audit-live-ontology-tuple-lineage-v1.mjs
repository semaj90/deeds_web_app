#!/usr/bin/env node
/**
 * DB-CATALOG-01: catalog-only PostgreSQL inventory. NEVER invoke the legacy
 * prove-ontology-linked-tuple-persistence.mjs here: it INSERTs/DELETEs.
 * TODO TUPLE-LINEAGE-02: identify the real admitted evidence relation from this report.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

export const TABLES = Object.freeze([
  'atlas_ontology_tuples', 'atlas_ontology_linked_tuples',
  'evidence_receipts', 'task_evidence', 'evidence_assertion',
  'openspec_task_predicate', 'atlas_symbol_versions',
]);
export function buildCatalogReport(columns, relations, constraints) {
  const byTable = Object.fromEntries(TABLES.map(name => [name, {
    exists: false, columns: [], constraints: [],
  }]));
  for (const r of relations) if (byTable[r.table_name]) byTable[r.table_name].exists = true;
  for (const c of columns) if (byTable[c.table_name]) byTable[c.table_name].columns.push({
    name: c.column_name, type: c.data_type, nullable: c.is_nullable,
  });
  for (const c of constraints) if (byTable[c.table_name]) byTable[c.table_name].constraints.push({
    name: c.constraint_name, kind: c.constraint_type, definition: c.definition,
  });
  for (const v of Object.values(byTable)) {
    v.columns.sort((a,b) => a.name.localeCompare(b.name));
    v.constraints.sort((a,b) => a.name.localeCompare(b.name));
  }
  const present = ['atlas_ontology_tuples','atlas_ontology_linked_tuples'].filter(x => byTable[x].exists);
  return {
    schema: 'atlas.ontology-tuple-catalog-audit.v1',
    verdict: present.length === 0 ? 'TUPLE_RELATION_NOT_FOUND' :
      present.length === 2 ? 'DUAL_TUPLE_SURFACES_REQUIRE_OWNER_REVIEW' : 'TUPLE_SURFACE_DISCOVERED_REVIEW_REQUIRED',
    relations: byTable, tupleSurfaces: present,
    storageOwnerProven: false, evidenceAdmissionProven: false,
    readonlyTransaction: true, canonicalWrites: false,
    todo: [
      'TODO: review owner and reader/writer call sites for each tuple table before selecting persistence authority',
      'TODO: derive evidence join from deployed relations and explicit receipt predicates; never assume column names',
      'TODO: implement exact source bytes + stored tuple provenance readback on a separate read-only transaction',
    ],
  };
}
const digest = body => 'sha256:' + createHash('sha256').update(JSON.stringify(body)).digest('hex');
export function sealReport(body) { return { ...body, digest: digest(body) }; }
export function verifyReport(report) {
  const { digest: recorded, ...body } = report;
  if (recorded !== digest(body)) throw new Error('CATALOG_RECEIPT_READBACK_MISMATCH');
  return true;
}
async function main() {
  const output = path.resolve(process.env.ATLAS_CATALOG_REPORT ?? path.join(REPO_ROOT,'.tmp/atlas/ontology-tuple-catalog-v1.json'));
  const scratch = path.resolve(REPO_ROOT, '.tmp');
  if (!output.startsWith(scratch + path.sep) || !output.endsWith('.json')) throw new Error('SCRATCH_REPORT_PATH_REQUIRED');
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1 });
  const client = await pool.connect();
  let report;
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '15000ms'");
    const relations = (await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_name = ANY($1::text[])
      ORDER BY table_name`, [TABLES])).rows;
    const columns = (await client.query(`
      SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name = ANY($1::text[])
      ORDER BY table_name,ordinal_position`, [TABLES])).rows;
    const constraints = (await client.query(`
      SELECT t.relname AS table_name, c.conname AS constraint_name,
        c.contype::text AS constraint_type,
        pg_get_constraintdef(c.oid) AS definition
      FROM pg_constraint c JOIN pg_class t ON t.oid=c.conrelid
      JOIN pg_namespace n ON n.oid=t.relnamespace
      WHERE n.nspname='public' AND t.relname = ANY($1::text[])
      ORDER BY t.relname,c.conname`, [TABLES])).rows;
    report = sealReport(buildCatalogReport(columns,relations,constraints));
    await client.query('ROLLBACK');
  } catch (e) { await client.query('ROLLBACK').catch(()=>{}); throw e; }
  finally { client.release(); await pool.end(); }
  await mkdir(path.dirname(output), { recursive:true });
  await writeFile(output, JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  verifyReport(JSON.parse(await readFile(output,'utf8')));
  process.stdout.write(JSON.stringify({verdict:report.verdict,report:output,digest:report.digest})+'\n');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch(e=>{console.error('CATALOG_AUDIT_FAILED',e.message);process.exitCode=1;});
}
