#!/usr/bin/env node
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const targets = ['evidence_receipts', 'task_evidence', 'openspec_evidence_chunks', 'atlas_ontology_linked_tuples'];
const sql = `
WITH targets(table_name) AS (
  SELECT unnest(ARRAY[${targets.map((name) => `'${name}'`).join(', ')}]::text[])
)
SELECT jsonb_build_object(
  'relations', (SELECT jsonb_agg(jsonb_build_object('table', table_name, 'relation', to_regclass('public.' || table_name)::text) ORDER BY table_name) FROM targets),
  'tupleColumns', (SELECT jsonb_agg(jsonb_build_object('column', c.column_name, 'type', c.data_type, 'nullable', c.is_nullable) ORDER BY c.ordinal_position) FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='atlas_ontology_linked_tuples' AND c.column_name IN ('source_ref','source_revision','workspace_revision','evidence_span','provenance')),
  'tupleIndexes', (SELECT jsonb_agg(jsonb_build_object('name', i.indexname, 'definition', i.indexdef) ORDER BY i.indexname) FROM pg_indexes i WHERE i.schemaname='public' AND i.tablename='atlas_ontology_linked_tuples'),
  'evidenceCandidateRelations', (SELECT jsonb_agg(jsonb_build_object('schema', n.nspname, 'name', c.relname, 'kind', c.relkind) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.relkind IN ('r','p','v','m') AND (c.relname ILIKE '%evidence%' OR c.relname ILIKE '%receipt%' OR c.relname ILIKE '%task%card%'))
);`;
const raw = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-X', '-U', 'legal_admin', '-d', 'legal_ai_db', '-A', '-t', '-c', sql,
], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000 }).trim();
const observation = JSON.parse(raw);
const relationPresent = Object.fromEntries(observation.relations.map(({ table, relation }) => [table, relation !== null]));
const tupleColumnNames = new Set((observation.tupleColumns ?? []).map(({ column }) => column));
const revisionIndexPresent = (observation.tupleIndexes ?? []).some(({ definition }) =>
  /\(source_ref,\s*source_revision\)/i.test(definition) && /source_revision\s+is\s+not\s+null/i.test(definition));
const receiptBody = {
  schema: 'atlas.grounded-nlp-tuple-schema-audit.v1',
  status: 'LIVE_SCHEMA_OBSERVED',
  observedAt: new Date().toISOString(),
  target: 'legal-ai-postgres/legal_ai_db',
  relationPresent,
  tupleColumnPresent: {
    sourceRef: tupleColumnNames.has('source_ref'),
    sourceRevision: tupleColumnNames.has('source_revision'),
    workspaceRevision: tupleColumnNames.has('workspace_revision'),
    evidenceSpanJsonb: observation.tupleColumns?.some(({ column, type }) => column === 'evidence_span' && type === 'jsonb') ?? false,
    provenanceJsonb: observation.tupleColumns?.some(({ column, type }) => column === 'provenance' && type === 'jsonb') ?? false,
  },
  revisionIndexPresent,
  migrationShapeStatus: tupleColumnNames.has('source_revision')
    && tupleColumnNames.has('workspace_revision')
    && revisionIndexPresent ? 'EXPECTED_REVISION_SHAPE_PRESENT' : 'EXPECTED_REVISION_SHAPE_ABSENT',
  tupleColumns: observation.tupleColumns ?? [],
  tupleIndexes: observation.tupleIndexes ?? [],
  evidenceCandidateRelations: observation.evidenceCandidateRelations ?? [],
  evidence: ['sveltekit-frontend/drizzle/manual/20260920b_atlas_ontology_schema_alters.sql'],
  readOnlyCatalogQuery: true,
  writesPerformed: false,
  migrationApplied: false,
  canonicalAuthority: false,
};
const canonicalJson = (value) => Array.isArray(value)
  ? `[${value.map(canonicalJson).join(',')}]`
  : value && typeof value === 'object'
    ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const receipt = { ...receiptBody, receiptChecksum: sha256(canonicalJson(receiptBody)) };
const relativePath = '.tmp/atlas/grounded-nlp-tuple-schema-audit-v1.json';
const receiptPath = path.join(root, relativePath);
mkdirSync(path.dirname(receiptPath), { recursive: true });
writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
const readback = JSON.parse(readFileSync(receiptPath, 'utf8'));
const { receiptChecksum, ...readbackBody } = readback;
assert.equal(receiptChecksum, sha256(canonicalJson(readbackBody)));
assert.deepEqual(readback, receipt);
console.log(JSON.stringify({
  status: receipt.status,
  relationPresent,
  tupleColumnPresent: receipt.tupleColumnPresent,
  revisionIndexPresent,
  migrationShapeStatus: receipt.migrationShapeStatus,
  writesPerformed: false,
  readback: 'MATCH',
  receiptPath: relativePath,
  receiptChecksum: receipt.receiptChecksum,
}, null, 2));
