#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = new Map(process.argv.slice(2).map((arg) => {
  const split = arg.indexOf('=');
  return split < 0 ? [arg, 'true'] : [arg.slice(0, split), arg.slice(split + 1)];
}));
const packetKey = args.get('--packet-key');
const sourceRef = args.get('--source-ref');
const workspaceRevision = args.get('--workspace-revision');
const sourceRevision = args.get('--source-revision');
if (!packetKey || !sourceRef || !workspaceRevision || !sourceRevision) {
  throw new Error('REQUIRED_ARGS: --packet-key= --source-ref= --workspace-revision= --source-revision=');
}

const defaultReport = path.join(root, `.tmp/atlas/function-orf-feature-source-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`);
const reportPath = path.resolve(args.get('--report') ?? defaultReport);
const requiredColumns = [
  'packet_key', 'feature_revision', 'source_ref', 'source_revision',
  'registry_revision', 'source_version_receipt_id', 'workspace_revision',
  'representation_id', 'representation_revision', 'tree_node_id',
  'ontology_mask', 'ast_pattern_mask', 'structural_flags', 'evidence_refs',
  'producer_revision', 'input_digest',
];
const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 10000,
  application_name: 'atlas-function-orf-feature-source-v1',
});

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

let report;
try {
  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ');
    transactionStarted = true;
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    const columnResult = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_observation_feature_rows'
      ORDER BY ordinal_position
    `);
    const columns = new Map(columnResult.rows.map((row) => [row.column_name, row.data_type]));
    const missingColumns = requiredColumns.filter((column) => !columns.has(column));
    let matchingRowCount = null;
    let rowChecks = [];

    if (columns.has('packet_key') && columns.has('source_ref')) {
      const predicates = ['packet_key = $1', 'source_ref = $2'];
      const values = [packetKey, sourceRef];
      if (columns.has('workspace_revision')) {
        values.push(workspaceRevision);
        predicates.push(`workspace_revision = $${values.length}`);
      }
      const selected = requiredColumns.filter((column) => columns.has(column));
      const rows = await client.query(
        `SELECT ${selected.map((column) => `"${column}"`).join(', ')}
         FROM public.atlas_observation_feature_rows
         WHERE ${predicates.join(' AND ')}
         ORDER BY feature_revision NULLS FIRST
         LIMIT 3`,
        values,
      );
      matchingRowCount = rows.rowCount;
      rowChecks = rows.rows.map((row) => ({
        featureRevisionPresent: Boolean(row.feature_revision?.trim()),
        sourceRevisionMatches: row.source_revision === sourceRevision,
        registryRevisionPresent: Boolean(row.registry_revision?.trim()),
        workspaceRevisionMatches: row.workspace_revision === workspaceRevision,
        representationRevisionPresent: Boolean(row.representation_revision?.trim()),
        treeNodeIdPresent: Boolean(row.tree_node_id?.trim()),
        producerRevisionPresent: Boolean(row.producer_revision?.trim()),
        inputDigestValid: typeof row.input_digest === 'string' && /^[a-f0-9]{64}$/i.test(row.input_digest),
        evidencePresent: Array.isArray(row.evidence_refs) && row.evidence_refs.length > 0,
      }));
    }
    await client.query('ROLLBACK');
    transactionStarted = false;

    const uniqueRow = matchingRowCount === 1 && rowChecks.length === 1;
    const lineageComplete = uniqueRow && Object.values(rowChecks[0]).every(Boolean);
    report = {
      schema: 'atlas.function-orf-feature-source-audit.v1',
      status: missingColumns.length > 0
        ? 'BLOCKED_SCHEMA'
        : matchingRowCount === 0
          ? 'BLOCKED_NO_ROW'
          : matchingRowCount !== 1
            ? 'BLOCKED_AMBIGUOUS'
            : lineageComplete
              ? 'ROW_LINEAGE_COMPLETE_REQUIRES_SEMANTIC_GRAPH_GATE'
              : 'BLOCKED_ROW_LINEAGE',
      target: { packetKey, sourceRef, workspaceRevision, sourceRevision },
      table: 'public.atlas_observation_feature_rows',
      schemaColumns: [...columns].map(([name, dataType]) => ({ name, dataType })),
      requiredColumns,
      missingColumns,
      matchingRowCount,
      rowChecks,
      semanticAndGraphAdmissionProven: false,
      writesPerformed: false,
      canonicalAuthority: false,
      sourceRowsPersisted: false,
      generatedAt: new Date().toISOString(),
    };
  } finally {
    if (transactionStarted) await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
} finally {
  await pool.end();
}

const payload = JSON.stringify(canonicalize(report));
report.checksum = createHash('sha256').update(payload).digest('hex');
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({
  status: report.status,
  matchingRowCount: report.matchingRowCount,
  missingColumns: report.missingColumns,
  writesPerformed: report.writesPerformed,
  reportPath: path.relative(root, reportPath).replaceAll('\\', '/'),
  checksum: report.checksum,
}, null, 2));
