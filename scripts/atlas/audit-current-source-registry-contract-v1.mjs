#!/usr/bin/env node

/**
 * Read-only audit of the current Graphify source registry contract.
 * No registry, binding, projection, or canonical rows are written.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_PLAN = resolve(ROOT, 'docs/reports/current-source-graphify-batch-plan-v1.json');
const REPORT = resolve(ROOT, 'docs/reports/current-source-registry-contract-v1.json');
const text = (value) => {
  const result = value == null ? '' : String(value).trim();
  return result || null;
};
const digest = (value) => createHash('sha256').update(String(value), 'utf8').digest('hex');

const sourcePlan = JSON.parse(readFileSync(SOURCE_PLAN, 'utf8'));
const planned = (sourcePlan.records ?? [])
  .filter((row) => row.classification === 'CURRENT_GRAPHIFY_EXACT')
  .sort((a, b) => String(a.sourceRef).localeCompare(String(b.sourceRef)))
  .map((row) => ({
    sourceRef: text(row.sourceRef),
    contentDigest: text(row.contentDigest),
    sourceRevision: text(row.sourceRevision),
    workspaceRevision: text(row.workspaceRevision),
    byteLength: Number(row.byteLength),
  }));

const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 120000,
});

let databaseError = null;
let columns = [];
let constraints = [];
let indexes = [];
let foreignKeys = [];
let registryRows = [];
let bindingRows = [];
let registryStats = null;
try {
  const results = await Promise.all([
    pool.query(`
      SELECT table_schema, table_name, ordinal_position, column_name, data_type,
             udt_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('atlas_source_refs', 'atlas_workspace_source_bindings')
      ORDER BY table_name, ordinal_position
    `),
    pool.query(`
      SELECT n.nspname AS schema_name, c.relname AS table_name,
             con.conname AS constraint_name, con.contype AS constraint_type,
             pg_get_constraintdef(con.oid) AS definition,
             con.convalidated AS validated
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname IN ('atlas_source_refs', 'atlas_workspace_source_bindings')
      ORDER BY c.relname, con.conname
    `),
    pool.query(`
      SELECT schemaname AS schema_name, tablename AS table_name,
             indexname AS index_name, indexdef AS definition
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN ('atlas_source_refs', 'atlas_workspace_source_bindings')
      ORDER BY tablename, indexname
    `),
    pool.query(`
      SELECT child_ns.nspname AS table_schema,
             child_rel.relname AS table_name,
             con.conname AS constraint_name,
             child_att.attname AS column_name,
             parent_ns.nspname AS referenced_schema,
             parent_rel.relname AS referenced_table,
             parent_att.attname AS referenced_column,
             con.convalidated AS validated
      FROM pg_constraint con
      JOIN pg_class child_rel ON child_rel.oid = con.conrelid
      JOIN pg_namespace child_ns ON child_ns.oid = child_rel.relnamespace
      JOIN pg_class parent_rel ON parent_rel.oid = con.confrelid
      JOIN pg_namespace parent_ns ON parent_ns.oid = parent_rel.relnamespace
      JOIN LATERAL unnest(con.conkey) WITH ORDINALITY AS child_key(attnum, ord) ON true
      JOIN LATERAL unnest(con.confkey) WITH ORDINALITY AS parent_key(attnum, ord)
        ON parent_key.ord = child_key.ord
      JOIN pg_attribute child_att
        ON child_att.attrelid = con.conrelid AND child_att.attnum = child_key.attnum
      JOIN pg_attribute parent_att
        ON parent_att.attrelid = con.confrelid AND parent_att.attnum = parent_key.attnum
      WHERE child_ns.nspname = 'public'
        AND child_rel.relname IN ('atlas_source_refs', 'atlas_workspace_source_bindings')
        AND con.contype = 'f'
      ORDER BY child_rel.relname, con.conname, child_key.ord
    `),
    pool.query(`
      SELECT source_ref_key, repo_id, source_type, relative_path, content_hash,
             commit_sha, corpus_version
      FROM public.atlas_source_refs
      WHERE repo_id = $1
      ORDER BY source_ref_key
    `, ['deeds-web-app']),
    pool.query(`
      SELECT repo_id, workspace_revision, canonical_source_ref, source_revision,
             content_digest, byte_length, source_manifest_ordinal, git_blob_oid,
             binding_checksum, producer_revision
      FROM public.atlas_workspace_source_bindings
      WHERE repo_id = $1
      ORDER BY canonical_source_ref
    `, ['deeds-web-app']),
    pool.query(`
      SELECT count(*)::integer AS rows,
             count(DISTINCT source_ref_key)::integer AS distinct_source_ref_keys,
             count(*) FILTER (WHERE source_ref_key IS NULL)::integer AS null_source_ref_keys,
             count(*) FILTER (WHERE repo_id = 'deeds-web-app')::integer AS repo_rows,
             count(DISTINCT repo_id)::integer AS repos
      FROM public.atlas_source_refs
    `),
  ]);
  [columns, constraints, indexes, foreignKeys, registryRows, bindingRows, registryStats] = results.map((result) => result.rows);
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const registryByKey = new Map(registryRows.map((row) => [String(row.source_ref_key), row]));
const bindingByKey = new Map(bindingRows.map((row) => [String(row.canonical_source_ref), row]));
const classifications = [];
for (const row of planned) {
  const registry = registryByKey.get(row.sourceRef) ?? null;
  const binding = bindingByKey.get(row.sourceRef) ?? null;
  let classification = 'UNRESOLVED';
  let reason = 'no exact registry row';
  if (registry && registry.content_hash && row.contentDigest && registry.content_hash === row.contentDigest) {
    if (binding && binding.content_digest === row.contentDigest) {
      classification = 'EXISTING_EXACT';
      reason = 'registry key, registry content hash, and workspace binding digest agree';
    } else if (!binding) {
      classification = 'REGISTERED_EXACT_UNBOUND';
      reason = 'registry key/content agree; no current workspace binding row';
    } else {
      classification = 'CONTENT_CONFLICT';
      reason = 'registry content agrees but workspace binding digest differs';
    }
  } else if (registry) {
    classification = registry.content_hash ? 'CONTENT_CONFLICT' : 'NAMESPACE_CONFLICT';
    reason = registry.content_hash ? 'exact key exists with a different content hash' : 'exact key exists without registry content hash';
  } else {
    const normalized = planned.filter((candidate) => candidate.sourceRef.toLowerCase() === row.sourceRef.toLowerCase());
    classification = normalized.length > 1 ? 'AMBIGUOUS' : 'REGISTER_NEW_EXACT';
    reason = normalized.length > 1 ? 'multiple normalized source references' : 'no exact registry row; new exact registration would require separate approval';
  }
  classifications.push({
    sourceRef: row.sourceRef,
    contentDigest: row.contentDigest,
    sourceRevision: row.sourceRevision,
    workspaceRevision: row.workspaceRevision,
    registrySourceRefKey: registry?.source_ref_key ?? null,
    registryContentHash: registry?.content_hash ?? null,
    bindingContentDigest: binding?.content_digest ?? null,
    classification,
    reason,
  });
}

const countBy = (key) => classifications.reduce((acc, row) => {
  acc[row[key]] = (acc[row[key]] ?? 0) + 1;
  return acc;
}, {});
const constraintSummary = constraints.map((row) => ({
  table: row.table_name,
  name: row.constraint_name,
  type: row.constraint_type,
  definition: row.definition,
  validated: row.validated,
}));
const report = {
  schema: 'atlas.current-source-registry-contract.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_CONTRACT_AUDIT',
  readOnly: true,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false, graphify: false },
  sourcePlan: 'docs/reports/current-source-graphify-batch-plan-v1.json',
  selectedSourceCount: planned.length,
  selectionChecksum: digest(planned.map((row) => `${row.sourceRef}:${row.contentDigest}:${row.sourceRevision}:${row.workspaceRevision}`).join('\n')),
  databaseError,
  registry: {
    table: 'public.atlas_source_refs',
    stats: registryStats?.[0] ?? null,
    columns: columns.filter((row) => row.table_name === 'atlas_source_refs'),
    constraints: constraintSummary.filter((row) => row.table === 'atlas_source_refs'),
    indexes: indexes.filter((row) => row.table_name === 'atlas_source_refs'),
  },
  workspaceBindings: {
    table: 'public.atlas_workspace_source_bindings',
    rowCount: bindingRows.length,
    columns: columns.filter((row) => row.table_name === 'atlas_workspace_source_bindings'),
    constraints: constraintSummary.filter((row) => row.table === 'atlas_workspace_source_bindings'),
    indexes: indexes.filter((row) => row.table_name === 'atlas_workspace_source_bindings'),
  },
  foreignKeys,
  keySemantics: {
    registryKey: 'atlas_source_refs.source_ref_key',
    bindingKey: 'atlas_workspace_source_bindings.canonical_source_ref',
    exactBindingKeyEqualityCount: classifications.filter((row) => row.registrySourceRefKey === row.sourceRef).length,
    bindingRowsWithExactRegistryKey: classifications.filter((row) => row.registrySourceRefKey === row.sourceRef && row.bindingContentDigest != null).length,
    note: 'Key equality is observed for this cohort; it is not promoted to canonical identity without the constraint/writer evidence above.',
  },
  classifications: countBy('classification'),
  rows: classifications,
  status: databaseError ? 'DATABASE_AUDIT_FAILED' : 'REGISTRY_CONTRACT_AUDITED',
  promotion: {
    registryWritesAllowed: false,
    workspaceBindingWritesAllowed: false,
    graphRevisionPromotionAllowed: false,
    reason: 'This audit proves shape and observed agreement only; it does not authorize or perform mutation.',
  },
};
mkdirSync(dirname(REPORT), { recursive: true });
writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  schema: report.schema,
  status: report.status,
  readOnly: true,
  selectedSourceCount: report.selectedSourceCount,
  registryRows: registryRows.length,
  bindingRows: bindingRows.length,
  classifications: report.classifications,
  foreignKeys: foreignKeys.length,
  report: REPORT,
}, null, 2));
