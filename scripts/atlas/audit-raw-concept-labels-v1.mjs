#!/usr/bin/env node
/**
 * Read-only inventory of raw packet/trace concept labels.
 *
 * Raw labels are evidence signals only. This script never creates ontology
 * classes, writes Neo4j, or mutates PostgreSQL.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT = path.join(ROOT, 'docs', 'reports', 'raw-concept-label-inventory-v1.json');
const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

const normalize = (value) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

async function tableExists(tableName) {
  const result = await pool.query('SELECT to_regclass($1) IS NOT NULL AS exists', [`public.${tableName}`]);
  return result.rows[0]?.exists === true;
}

async function collectLabels() {
  const sources = [];
  if (await tableExists('atlas_packets')) {
    const result = await pool.query(`
      SELECT concept_id::text AS label, count(*)::int AS occurrences, 'atlas_packets.concept_ids' AS source
      FROM atlas_packets, unnest(COALESCE(concept_ids, ARRAY[]::text[])) AS concept_id
      WHERE concept_id IS NOT NULL AND btrim(concept_id) <> ''
      GROUP BY concept_id
    `);
    sources.push(...result.rows);
  }
  if (await tableExists('agent_traces')) {
    const result = await pool.query(`
      SELECT value AS label, count(*)::int AS occurrences, 'agent_traces.selected_concepts' AS source
      FROM agent_traces, jsonb_array_elements_text(COALESCE(selected_concepts, '[]'::jsonb)) AS value
      WHERE btrim(value) <> ''
      GROUP BY value
    `);
    sources.push(...result.rows);
  }
  return sources;
}

try {
  const rows = await collectLabels();
  const grouped = new Map();
  for (const row of rows) {
    const normalizedLabel = normalize(row.label);
    if (!normalizedLabel) continue;
    const current = grouped.get(normalizedLabel) ?? { normalizedLabel, rawLabels: new Set(), sources: new Set(), occurrences: 0 };
    current.rawLabels.add(String(row.label).trim());
    current.sources.add(row.source);
    current.occurrences += Number(row.occurrences ?? 0);
    grouped.set(normalizedLabel, current);
  }

  const labels = [...grouped.values()]
    .map((row) => ({
      normalizedLabel: row.normalizedLabel,
      rawLabels: [...row.rawLabels].sort(),
      sources: [...row.sources].sort(),
      occurrences: row.occurrences,
      taxonomyStatus: 'UNADMITTED',
      canonicalAuthority: false,
    }))
    .sort((a, b) => b.occurrences - a.occurrences || a.normalizedLabel.localeCompare(b.normalizedLabel));

  const report = {
    schema: 'atlas.raw-concept-label-inventory.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    postgresWrites: false,
    neo4jWrites: false,
    rawLabelCount: labels.length,
    sourceRows: rows.length,
    labels,
    nextGate: 'EXPLICIT_DOMAIN_ONTOLOGY_MAPPING_REVIEW',
  };
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: 'RAW_CONCEPT_LABEL_INVENTORY_PROVEN', rawLabelCount: labels.length, sourceRows: rows.length, reportPath: 'docs/reports/raw-concept-label-inventory-v1.json' }, null, 2));
} finally {
  await pool.end();
}
