#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const FRONTEND = path.join(ROOT, 'sveltekit-frontend');
const APPLY = process.argv.includes('--apply');
const FIXTURE = process.argv.includes('--fixture');
const VERBOSE = process.argv.includes('--verbose');
const DATABASE_URL = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL || '';

if (!DATABASE_URL) {
  console.error('DATABASE_URL_MIGRATOR or DATABASE_URL is required');
  process.exit(2);
}

const migrations = [
  '20260817_atlas_feature_intelligence_v1.sql',
  '20260818_atlas_dynamic_hyperedge_entities_v1.sql',
  '20260818_atlas_symbol_registry_v1.sql',
  '20260818_atlas_schema_object_registry_v1.sql',
  '20260818_atlas_test_registry_v1.sql',
];

const requiredTables = [
  'atlas_features', 'atlas_evidence', 'atlas_feature_evidence',
  'atlas_relationships', 'atlas_relationship_members', 'atlas_relationship_cardinality',
  'atlas_relationship_evidence', 'atlas_relationship_embeddings', 'atlas_feature_embeddings',
  'atlas_feature_state_receipts', 'atlas_dynamic_hyperedge_candidates',
  'atlas_evidence_entities', 'atlas_symbol_registry', 'atlas_symbol_aliases',
  'atlas_symbol_versions', 'atlas_structural_reference_resolutions',
  'atlas_schema_object_registry', 'atlas_schema_object_aliases', 'atlas_schema_object_versions',
  'atlas_test_registry', 'atlas_test_aliases', 'atlas_test_versions', 'atlas_test_execution_receipts',
];

const requiredFunctions = [
  'atlas_validate_relationship',
  'atlas_dynamic_hyperedge_neighborhood',
];

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : stable(value), 'utf8').digest('hex');
}

async function readMigration(name) {
  const file = path.join(FRONTEND, 'drizzle', 'manual', name);
  const sql = await readFile(file, 'utf8');
  return { name, file, sql, checksum: sha256(sql) };
}

const migrationFiles = await Promise.all(migrations.map(readMigration));
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const client = await pool.connect();
const gates = {};
const details = {};

try {
  const server = await client.query(`SELECT current_database() AS database, current_user AS username, current_setting('server_version') AS version`);
  details.server = server.rows[0];

  if (APPLY) {
    for (const migration of migrationFiles) {
      if (VERBOSE) console.log(`[atlas-db-proof] applying ${migration.name}`);
      await client.query(migration.sql);
    }
  }

  const extension = await client.query(`SELECT extname, extversion FROM pg_extension WHERE extname = 'vector'`);
  gates.PGVECTOR_EXTENSION = extension.rowCount === 1;
  details.pgvector = extension.rows[0] ?? null;

  const tableRows = await client.query(`
    SELECT name,
           to_regclass('public.' || name)::text AS relation_name
    FROM unnest($1::text[]) AS name
    ORDER BY name
  `, [requiredTables]);
  const missingTables = tableRows.rows.filter((row) => !row.relation_name).map((row) => row.name);
  gates.REQUIRED_TABLES_EXIST = missingTables.length === 0;
  details.missing_tables = missingTables;

  const functionRows = await client.query(`
    SELECT name,
           EXISTS (
             SELECT 1 FROM pg_proc p
             JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.proname = name
           ) AS present
    FROM unnest($1::text[]) AS name
    ORDER BY name
  `, [requiredFunctions]);
  const missingFunctions = functionRows.rows.filter((row) => !row.present).map((row) => row.name);
  gates.REQUIRED_FUNCTIONS_EXIST = missingFunctions.length === 0;
  details.missing_functions = missingFunctions;

  const evidenceEntityFk = await client.query(`
    SELECT pg_get_constraintdef(con.oid, false) AS definition
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname = 'public'
      AND rel.relname = 'atlas_evidence_entities'
      AND con.contype = 'f'
  `);
  gates.EVIDENCE_ENTITY_FK_TO_EVIDENCE = evidenceEntityFk.rows.some((row) =>
    String(row.definition).includes('FOREIGN KEY (evidence_id) REFERENCES atlas_evidence(evidence_id)'));
  details.evidence_entity_foreign_keys = evidenceEntityFk.rows;

  const schemaRegistryColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='atlas_schema_object_versions'
    ORDER BY ordinal_position
  `);
  const schemaColumnNames = new Set(schemaRegistryColumns.rows.map((row) => row.column_name));
  gates.SCHEMA_REGISTRY_VERSION_PROVENANCE = ['catalog_oid', 'schema_revision', 'definition_hash', 'schema_object_version_id', 'stable_schema_object_id']
    .every((name) => schemaColumnNames.has(name));
  details.schema_registry_version_columns = [...schemaColumnNames];

  const symbolRegistryColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='atlas_symbol_versions'
    ORDER BY ordinal_position
  `);
  const symbolColumnNames = new Set(symbolRegistryColumns.rows.map((row) => row.column_name));
  gates.SYMBOL_REGISTRY_NATIVE_PROVENANCE = ['upstream_node_id', 'upstream_symbol_id', 'upstream_chunk_id', 'source_revision', 'declaration_hash']
    .every((name) => symbolColumnNames.has(name));
  details.symbol_registry_version_columns = [...symbolColumnNames];

  const testRegistryColumns = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='atlas_test_execution_receipts'
    ORDER BY ordinal_position
  `);
  const testColumnNames = new Set(testRegistryColumns.rows.map((row) => row.column_name));
  gates.TEST_EXECUTION_RECEIPT_SURFACE = ['execution_receipt_id', 'test_key', 'run_revision', 'status', 'report_checksum']
    .every((name) => testColumnNames.has(name));
  details.test_execution_columns = [...testColumnNames];

  if (FIXTURE && gates.REQUIRED_TABLES_EXIST && gates.REQUIRED_FUNCTIONS_EXIST) {
    await client.query('BEGIN');
    try {
      const suffix = sha256(`${Date.now()}:${process.pid}`).slice(0, 12);
      const evidenceId = `proof:evidence:${suffix}`;
      const relationshipId = `proof:relationship:${suffix}`;
      const symbolId = `proof:symbol:${suffix}`;
      const schemaId = `proof:schema:${suffix}`;
      const testId = `proof:test:${suffix}`;

      await client.query(`
        INSERT INTO atlas_evidence(evidence_id,evidence_kind,source_ref,source_revision,evidence_revision,producer_revision,confidence,payload,search_text)
        VALUES ($1,'proof.fixture','proof://database','proof-src-r1','proof-ev-r1','database-proof-r1',1,'{}'::jsonb,'proof fixture')
      `, [evidenceId]);
      await client.query(`
        INSERT INTO atlas_evidence_entities(evidence_id,entity_type,entity_id,role,source_ref,source_revision,extraction_revision,confidence)
        VALUES ($1,'symbol',$2,'defines','proof://database','proof-src-r1','database-proof-r1',1)
      `, [evidenceId, symbolId]);

      await client.query(`
        INSERT INTO atlas_relationships(
          relationship_id,relationship_type,participant_count,relationship_degree,relationship_degree_kind,
          source_ref,source_revision,relationship_revision,producer_revision,confidence
        ) VALUES ($1,'PROOF_RELATION',2,2,'binary','proof://database','proof-src-r1','proof-rel-r1','database-proof-r1',1)
      `, [relationshipId]);
      await client.query(`
        INSERT INTO atlas_relationship_members(relationship_id,member_ordinal,role,entity_type,entity_id)
        VALUES ($1,0,'left','symbol',$2),($1,1,'right','schema_object',$3)
      `, [relationshipId, symbolId, schemaId]);
      const valid = await client.query(`SELECT atlas_validate_relationship($1) AS valid`, [relationshipId]);
      gates.FIXTURE_RELATIONSHIP_VALIDATION = valid.rows[0]?.valid === true;

      await client.query(`
        INSERT INTO atlas_symbol_registry(
          stable_symbol_id,canonical_key,language,symbol_kind,canonical_name,canonical_qualified_name,
          created_from_nomination_id,created_from_source_ref,created_from_source_revision,registry_revision
        ) VALUES ($1,$2,'typescript','function','proofSymbol','proof::proofSymbol',$3,'proof://database','proof-src-r1','proof-reg-r1')
      `, [symbolId, `proof-key:${suffix}`, `proof-nomination:${suffix}`]);

      await client.query(`
        INSERT INTO atlas_schema_object_registry(
          stable_schema_object_id,canonical_key,database_key,schema_name,object_kind,canonical_name,
          canonical_qualified_name,created_from_nomination_id,created_from_source_ref,
          created_from_source_revision,registry_revision
        ) VALUES ($1,$2,'proof-db','public','table','proof_table','public.proof_table',$3,'proof://database','proof-src-r1','proof-reg-r1')
      `, [schemaId, `proof-schema-key:${suffix}`, `proof-schema-nomination:${suffix}`]);

      await client.query(`
        INSERT INTO atlas_test_registry(
          stable_test_id,canonical_key,framework,canonical_source_ref,canonical_full_name,
          created_from_nomination_id,created_from_source_revision,registry_revision
        ) VALUES ($1,$2,'vitest','proof.test.ts','proof fixture',$3,'proof-src-r1','proof-reg-r1')
      `, [testId, `proof-test-key:${suffix}`, `proof-test-nomination:${suffix}`]);

      const neighborhood = await client.query(`SELECT * FROM atlas_dynamic_hyperedge_neighborhood($1::text[], 10)`, [[symbolId]]);
      gates.FIXTURE_DYNAMIC_HYPEREDGE = neighborhood.rows.some((row) => row.evidence_id === evidenceId);

      const readback = await client.query(`
        SELECT
          EXISTS(SELECT 1 FROM atlas_evidence WHERE evidence_id=$1) AS evidence,
          EXISTS(SELECT 1 FROM atlas_evidence_entities WHERE evidence_id=$1 AND entity_id=$2) AS evidence_entity,
          EXISTS(SELECT 1 FROM atlas_symbol_registry WHERE stable_symbol_id=$2) AS symbol,
          EXISTS(SELECT 1 FROM atlas_schema_object_registry WHERE stable_schema_object_id=$3) AS schema_object,
          EXISTS(SELECT 1 FROM atlas_test_registry WHERE stable_test_id=$4) AS test
      `, [evidenceId, symbolId, schemaId, testId]);
      gates.FIXTURE_READBACK = Object.values(readback.rows[0] ?? {}).every(Boolean);
    } finally {
      await client.query('ROLLBACK');
    }
  } else if (FIXTURE) {
    gates.FIXTURE_RELATIONSHIP_VALIDATION = false;
    gates.FIXTURE_DYNAMIC_HYPEREDGE = false;
    gates.FIXTURE_READBACK = false;
  }

  const requiredGateNames = [
    'PGVECTOR_EXTENSION', 'REQUIRED_TABLES_EXIST', 'REQUIRED_FUNCTIONS_EXIST',
    'EVIDENCE_ENTITY_FK_TO_EVIDENCE', 'SCHEMA_REGISTRY_VERSION_PROVENANCE',
    'SYMBOL_REGISTRY_NATIVE_PROVENANCE', 'TEST_EXECUTION_RECEIPT_SURFACE',
    ...(FIXTURE ? ['FIXTURE_RELATIONSHIP_VALIDATION', 'FIXTURE_DYNAMIC_HYPEREDGE', 'FIXTURE_READBACK'] : []),
  ];
  const status = requiredGateNames.every((name) => gates[name]) ? 'PROVEN' : 'DEGRADED';
  const receipt = {
    schema: 'atlas.feature-intelligence-database-proof.v1',
    generated_at: new Date().toISOString(),
    apply_requested: APPLY,
    fixture_requested: FIXTURE,
    fixture_rolled_back: FIXTURE,
    migrations: migrationFiles.map(({ name, checksum }) => ({ name, checksum })),
    gates,
    details,
    status,
  };
  receipt.checksum = sha256(receipt);
  console.log(JSON.stringify(receipt, null, 2));
  if (status !== 'PROVEN') process.exitCode = 2;
} finally {
  client.release();
  await pool.end();
}
