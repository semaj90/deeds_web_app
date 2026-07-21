#!/usr/bin/env node
/**
 * Audit the live feature-layer schema against the normalized Atlas contract.
 *
 * The audit is intentionally read-only and never assumes the schema is already
 * aligned. Missing columns are reported as findings rather than causing the
 * script to abort.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');

const TABLES = {
  feature_implementations: {
    required: ['feature_key', 'feature_name', 'status', 'confidence'],
    recommended: ['packet_key', 'source_ref', 'content_hash', 'processing_pass_id'],
  },
  feature_file_edges: {
    required: ['feature_key', 'file_path', 'role'],
    recommended: ['packet_key', 'source_ref', 'content_hash', 'stable_key'],
  },
  feature_lexical_facts: {
    required: ['packet_key', 'source_ref', 'keywords', 'identifiers', 'symbols', 'imported_modules', 'content_hash', 'extractor_version'],
    recommended: ['feature_key', 'lexical_summary', 'language', 'processing_pass_id'],
  },
  feature_domain_facts: {
    required: ['packet_key', 'source_ref', 'domain_class', 'content_hash', 'classifier_kind', 'classifier_version'],
    recommended: ['feature_key', 'domain_confidence', 'domain_probabilities', 'model_hash', 'feature_contract_version', 'processing_pass_id'],
  },
  feature_structural_facts: {
    required: ['packet_key', 'source_ref', 'content_hash', 'parser_version', 'imports', 'calls', 'exports'],
    recommended: ['feature_key', 'tree_node_id', 'symbol_name', 'symbol_kind', 'structural_path', 'line_start', 'line_end', 'processing_pass_id'],
  },
  feature_ontology_tuples: {
    required: ['packet_key', 'source_ref', 'subject_type', 'subject_id', 'predicate', 'object_type', 'object_id', 'confidence', 'ontology_version', 'extractor_version'],
    recommended: ['feature_key', 'object_value', 'processing_pass_id', 'valid_from', 'valid_to'],
  },
  atlas_packets: {
    required: ['packet_key', 'source_ref', 'feature_id', 'feature_label', 'summary', 'keywords', 'domain_class'],
    recommended: ['content_hash', 'tree_node_id', 'qdrant_point_id', 'pagerank_score', 'som_cluster', 'kmeans_cluster', 'used_concepts'],
  },
};

function asSet(rows) {
  return new Set(rows.map((row) => row.column_name));
}

async function inspectTable(pool, tableName) {
  const columnsResult = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
    ORDER BY ordinal_position
  `, [tableName]);

  const rowCountResult = await pool.query(`SELECT COUNT(*)::bigint AS count FROM ${tableName}`);
  const columns = columnsResult.rows;
  const columnSet = asSet(columns);
  const spec = TABLES[tableName] ?? { required: [], recommended: [] };

  const requiredMissing = spec.required.filter((name) => !columnSet.has(name));
  const recommendedMissing = spec.recommended.filter((name) => !columnSet.has(name));
  const status = requiredMissing.length === 0 ? 'PASS' : 'FAIL';

  return {
    table_name: tableName,
    row_count: rowCountResult.rows[0]?.count ?? '0',
    columns,
    required_missing: requiredMissing,
    recommended_missing: recommendedMissing,
    status,
  };
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

  const tables = Object.keys(TABLES);
  const audit = [];

  try {
    for (const tableName of tables) {
      try {
        audit.push(await inspectTable(pool, tableName));
      } catch (error) {
        audit.push({
          table_name: tableName,
          row_count: '0',
          columns: [],
          required_missing: TABLES[tableName]?.required ?? [],
          recommended_missing: TABLES[tableName]?.recommended ?? [],
          status: 'ERROR',
          error: String(error?.message ?? error),
        });
      }
    }

    const summary = {
      generated_at: new Date().toISOString(),
      tables: audit,
      tables_passed: audit.filter((row) => row.status === 'PASS').length,
      tables_failed: audit.filter((row) => row.status !== 'PASS').length,
      feature_join_ready: audit.find((row) => row.table_name === 'feature_implementations')?.required_missing.length === 0 &&
        audit.find((row) => row.table_name === 'feature_file_edges')?.required_missing.length === 0,
    };

    await fs.mkdir(REPORT_DIR, { recursive: true });
    await fs.writeFile(
      path.join(REPORT_DIR, 'feature-layer-schema-audit.json'),
      `${JSON.stringify(summary, null, 2)}\n`,
    );

    const lines = [
      '# Feature Layer Schema Audit',
      '',
      `Generated: ${summary.generated_at}`,
      '',
      `Tables passed: ${summary.tables_passed}/${audit.length}`,
      `Tables failed: ${summary.tables_failed}/${audit.length}`,
      `Feature join ready: ${summary.feature_join_ready ? 'YES' : 'NO'}`,
      '',
    ];

    for (const row of audit) {
      lines.push(`## ${row.table_name}`);
      lines.push(`- status: ${row.status}`);
      lines.push(`- row_count: ${row.row_count}`);
      lines.push(`- required_missing: ${row.required_missing.length ? row.required_missing.join(', ') : 'none'}`);
      lines.push(`- recommended_missing: ${row.recommended_missing.length ? row.recommended_missing.join(', ') : 'none'}`);
      if (row.error) {
        lines.push(`- error: ${row.error}`);
      }
      lines.push('');
    }

    await fs.writeFile(
      path.join(REPORT_DIR, 'feature-layer-schema-audit.md'),
      `${lines.join('\n')}\n`,
    );

    console.log(JSON.stringify(summary, null, 2));
    if (!summary.feature_join_ready) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
