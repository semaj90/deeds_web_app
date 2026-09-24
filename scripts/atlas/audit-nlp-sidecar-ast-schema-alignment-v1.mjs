#!/usr/bin/env node

/**
 * Compare live NLP AstUnit evidence with the canonical atlas_ast_nodes schema.
 * This is an audit only: it never inserts, updates, migrates, or promotes.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const REPORT = resolve(ROOT, 'docs/reports/nlp-sidecar-ast-schema-alignment-v1.json');
const SOURCE_RELATIVE = 'scripts/atlas/audit-pgvector-schema.mjs';
const BASE_URL = (process.env.ATLAS_NLP_SIDECAR_URL ?? 'http://127.0.0.1:8095').replace(/\/$/, '');

const tableColumns = (() => {
  try {
    const raw = execFileSync('docker', [
      'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
      '-At', '-c', "select column_name from information_schema.columns where table_schema='public' and table_name='atlas_ast_nodes' order by ordinal_position",
    ], { encoding: 'utf8', timeout: 15000 });
    return raw.split(/\r?\n/).map((value) => value.trim()).filter(Boolean);
  } catch (error) {
    return { error: String(error?.message ?? error) };
  }
})();

const sourceText = await readFile(resolve(ROOT, SOURCE_RELATIVE), 'utf8');
const sourceRevision = `sha256:${createHash('sha256').update(sourceText, 'utf8').digest('hex')}`;
const payload = {
  text: sourceText,
  source_type: 'codebase',
  source_ref: SOURCE_RELATIVE,
  source_revision: sourceRevision,
  language: 'javascript',
  passes: ['structural'],
};

// These are the explicit evidence-to-table correspondences. Unmapped table
// fields are intentionally not synthesized by the sidecar.
const fieldMap = {
  tree_node_id: 'tree_node_id',
  relative_path: 'source_ref',
  node_kind: 'node_kind',
  qualified_symbol: 'qualified_symbol',
  parser_language: 'language',
  start_byte: 'byte_start',
  end_byte: 'byte_end',
  line_start: 'line_start',
  line_end: 'line_end',
  source_revision: 'source_revision',
  parser_name: 'parser_engine',
  parser_version: 'parser_revision',
  grammar_version: 'grammar_revision',
};

// Remaining live columns are deliberately classified instead of being
// invented in the sidecar response. They belong to the canonical writer,
// source-envelope/identity boundary, archival bookkeeping, or database
// bookkeeping. This keeps the audit strict without making 8095 a writer.
const tableFieldClassification = {
  structural_key: 'canonical_writer_derived_identity',
  repo_id: 'source_authority_lineage',
  normalized_node_hash: 'canonical_writer_node_content_hash',
  source_content_hash: 'source_envelope_raw_file_digest',
  created_at: 'database_bookkeeping',
  superseded_by: 'canonical_archive_relationship',
  normalized_signature: 'optional_structural_identity_evidence',
  parent_tree_node_id: 'canonical_parent_identity_resolution',
  source_ref_key: 'source_authority_lineage',
  updated_at: 'database_bookkeeping',
  workspace_id: 'source_authority_lineage',
};

const report = {
  schema: 'atlas.nlp-sidecar-ast-schema-alignment.v1',
  generatedAt: new Date().toISOString(),
  endpoint: `${BASE_URL}/analyze`,
  table: 'public.atlas_ast_nodes',
  sourceRef: SOURCE_RELATIVE,
  sourceRevision,
  canonicalAuthority: false,
  promotionAuthorized: false,
  writesPerformed: false,
  schemaColumns: Array.isArray(tableColumns) ? tableColumns : [],
  schemaRead: Array.isArray(tableColumns),
  checks: [],
};

const check = (id, pass, details = {}) => {
  report.checks.push({ id, status: pass ? 'PASS' : 'REVIEW_REQUIRED', ...details });
};

try {
  const response = await fetch(`${BASE_URL}/analyze`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await response.json();
  const structural = body?.pass_results?.find((pass) => pass.family === 'structural');
  const unit = structural?.artifacts?.ast_units?.[0] ?? null;
  check('http', response.ok, { statusCode: response.status });
  check('structural-unit-present', Boolean(unit));

  const unclassifiedTableFields = Array.isArray(tableColumns)
    ? tableColumns.filter((column) => (
      !Object.prototype.hasOwnProperty.call(fieldMap, column)
      && !Object.prototype.hasOwnProperty.call(tableFieldClassification, column)
    ))
    : [];
  const mappedFields = Object.keys(fieldMap).filter((column) => Array.isArray(tableColumns) && tableColumns.includes(column));
  const missingEvidenceFields = mappedFields.filter((column) => !unit || !(fieldMap[column] in unit));
  const nonCanonicalFields = ['tree_node_id', 'source_revision', 'parser_revision', 'grammar_revision']
    .filter((field) => !unit || !(field in unit));

  check('mapped-evidence-fields-present', missingEvidenceFields.length === 0, { mappedFields, missingEvidenceFields });
  check('all-table-fields-mapped-or-classified', unclassifiedTableFields.length === 0, {
    unclassifiedTableFields,
    classifiedTableFields: tableFieldClassification,
  });
  check('source-revision-preserved', structural?.source_revision === sourceRevision);
  check('promotion-closed', unit?.canonical_authority === false, { canonicalAuthority: unit?.canonical_authority ?? null });
  check('packet-key-excluded-from-ast-unit', Boolean(unit) && !Object.prototype.hasOwnProperty.call(unit, 'packet_key'), {
    packetKeyPresent: Boolean(unit) && Object.prototype.hasOwnProperty.call(unit, 'packet_key'),
  });

  report.observed = {
    astUnitCount: structural?.artifacts?.ast_units?.length ?? 0,
    providerRevision: body?.provider_revision ?? null,
    sourceRef: structural?.source_ref ?? null,
    sourceRevision: structural?.source_revision ?? null,
    packetKeyPresent: Boolean(unit) && Object.prototype.hasOwnProperty.call(unit, 'packet_key'),
    unclassifiedTableFields,
    classifiedTableFields: tableFieldClassification,
    missingEvidenceFields,
    mappedFields,
    sidecarIsCanonicalWriter: false,
  };
} catch (error) {
  report.checks.push({ id: 'runtime-request', status: 'REVIEW_REQUIRED', error: String(error?.message ?? error) });
}

report.status = report.checks.some((item) => item.status === 'REVIEW_REQUIRED')
  ? 'AST_UNIT_SCHEMA_ALIGNMENT_REVIEW_REQUIRED'
  : 'AST_UNIT_SCHEMA_ALIGNMENT_PROVEN';
report.reviewRequired = report.checks.filter((item) => item.status === 'REVIEW_REQUIRED').length;
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: 'docs/reports/nlp-sidecar-ast-schema-alignment-v1.json', status: report.status, reviewRequired: report.reviewRequired, writesPerformed: false }, null, 2));
if (report.status !== 'AST_UNIT_SCHEMA_ALIGNMENT_PROVEN') process.exitCode = 1;
